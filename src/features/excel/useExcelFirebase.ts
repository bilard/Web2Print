import { doc, setDoc, getDoc, collection, getDocs, deleteDoc, serverTimestamp, query, where, updateDoc, writeBatch, deleteField } from 'firebase/firestore'
import { db, auth } from '@/lib/firebase/config'
import { useExcelStore } from '@/stores/excel.store'
import type { ExcelSheet } from './types'

const COLLECTION = 'excel_data'
const PAYLOAD_COLLECTION = 'excel_data_payload'

export function useExcelFirebase() {
  const { setSheets, setDetecting } = useExcelStore()

  /** Enregistre une base. Si `existingDocId` est fourni, met à jour ce doc
   *  précis (cas usuel : base déjà chargée). Sinon, crée un nouveau doc avec
   *  un ID Firestore auto-généré (unique) — deux bases au même `fileName` ne
   *  se marchent plus dessus. Retourne le docId final pour que l'appelant
   *  puisse le mémoriser (currentDocId).
   *
   *  Stocke les méta dans `excel_data/{docId}` et le blob sheets dans
   *  `excel_data_payload/{docId}` (commit atomique batched). Le `deleteField`
   *  sur `sheets` migre paresseusement les anciens docs qui portaient
   *  encore le blob inline. */
  const saveToFirebase = async (
    fileName: string,
    sheets: ExcelSheet[],
    path: string[] = [],
    existingDocId?: string | null,
  ): Promise<string | null> => {
    const user = auth.currentUser
    if (!user) return null

    const ref = existingDocId
      ? doc(db, COLLECTION, existingDocId)
      : doc(collection(db, COLLECTION))
    const fullDocId = ref.id
    const payloadRef = doc(db, PAYLOAD_COLLECTION, fullDocId)

    const batch = writeBatch(db)
    batch.set(ref, {
      userId: user.uid,
      fileName,
      path,
      sheets: deleteField(),
      sheetCount: sheets.length,
      totalRows: sheets.reduce((acc, s) => acc + s.rows.length, 0),
      totalColumns: sheets.reduce((acc, s) => acc + s.columns.length, 0),
      updatedAt: serverTimestamp(),
      createdAt: serverTimestamp(),
    }, { merge: true })
    batch.set(payloadRef, {
      userId: user.uid,
      json: JSON.stringify(sheets),
      updatedAt: serverTimestamp(),
    }, { merge: true })
    await batch.commit()

    return fullDocId
  }

  /** Charge une base par son `docId` Firestore complet. Lit le payload séparé
   *  en priorité ; fallback sur l'ancien champ `sheets` inline pour les docs
   *  pas encore migrés (compat lecture). */
  const loadFromFirebase = async (docId: string): Promise<ExcelSheet[] | null> => {
    const user = auth.currentUser
    if (!user) return null

    setDetecting(true)
    try {
      const payloadSnap = await getDoc(doc(db, PAYLOAD_COLLECTION, docId))
      if (payloadSnap.exists()) {
        const sheets: ExcelSheet[] = JSON.parse(payloadSnap.data().json)
        setSheets(sheets)
        return sheets
      }
      const legacySnap = await getDoc(doc(db, COLLECTION, docId))
      if (!legacySnap.exists()) return null
      const data = legacySnap.data()
      if (typeof data.sheets !== 'string') return null
      const sheets: ExcelSheet[] = JSON.parse(data.sheets)
      setSheets(sheets)
      return sheets
    } finally {
      setDetecting(false)
    }
  }

  /** Liste toutes les bases de l'utilisateur courant. */
  const listSavedFiles = async (): Promise<{ fileName: string; docId: string; totalRows: number; updatedAt: Date | null; path: string[]; sortIndex?: number }[]> => {
    const user = auth.currentUser
    if (!user) return []

    const q = query(collection(db, COLLECTION), where('userId', '==', user.uid))
    const snap = await getDocs(q)

    const files = snap.docs
      .map((d) => {
        const data = d.data()
        return {
          fileName: data.fileName,
          docId: d.id,
          totalRows: data.totalRows ?? 0,
          updatedAt: data.updatedAt?.toDate?.() ?? null,
          path: Array.isArray(data.path) ? data.path : [],
          sortIndex: typeof data.sortIndex === 'number' ? data.sortIndex : undefined,
        }
      })
      .sort((a, b) => {
        if (!a.updatedAt || !b.updatedAt) return 0
        return b.updatedAt.getTime() - a.updatedAt.getTime()
      })

    return files
  }

  /** Supprime une base par son `docId` Firestore complet (méta + payload). */
  const deleteFromFirebase = async (docId: string) => {
    const user = auth.currentUser
    if (!user) return
    const batch = writeBatch(db)
    batch.delete(doc(db, COLLECTION, docId))
    batch.delete(doc(db, PAYLOAD_COLLECTION, docId))
    await batch.commit()
  }

  /** Renomme une base (met à jour uniquement le libellé `fileName`). */
  const renameFile = async (docId: string, newFileName: string) => {
    const user = auth.currentUser
    if (!user) return
    const trimmed = newFileName.trim()
    if (!trimmed) return
    const ref = doc(db, COLLECTION, docId)
    await updateDoc(ref, { fileName: trimmed, updatedAt: serverTimestamp() })
  }

  /** Déplace une base vers un autre chemin dans l'arbre (path vide = racine). */
  const moveFile = async (docId: string, nextPath: string[]) => {
    const user = auth.currentUser
    if (!user) return
    const cleaned = nextPath.map((s) => s.trim()).filter(Boolean)
    const ref = doc(db, COLLECTION, docId)
    await updateDoc(ref, { path: cleaned, updatedAt: serverTimestamp() })
  }

  /** Persiste l'ordre manuel d'un groupe de bases (siblings d'un même path).
   *  N updates → 1 commit atomique, pour éviter un état mi-réordonné. */
  const reorderFiles = async (updates: { docId: string; sortIndex: number }[]) => {
    const user = auth.currentUser
    if (!user || updates.length === 0) return
    const batch = writeBatch(db)
    for (const { docId, sortIndex } of updates) {
      batch.update(doc(db, COLLECTION, docId), { sortIndex })
    }
    await batch.commit()
  }

  return { saveToFirebase, loadFromFirebase, listSavedFiles, deleteFromFirebase, renameFile, moveFile, reorderFiles }
}
