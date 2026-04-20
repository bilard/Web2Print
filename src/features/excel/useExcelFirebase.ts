import { doc, setDoc, getDoc, collection, getDocs, deleteDoc, serverTimestamp, query, where, updateDoc } from 'firebase/firestore'
import { db, auth } from '@/lib/firebase/config'
import { useExcelStore } from '@/stores/excel.store'
import type { ExcelSheet } from './types'

const COLLECTION = 'excel_data'

export function useExcelFirebase() {
  const { setSheets, setDetecting } = useExcelStore()

  /** Enregistre une base. Si `existingDocId` est fourni, met à jour ce doc
   *  précis (cas usuel : base déjà chargée). Sinon, crée un nouveau doc avec
   *  un ID Firestore auto-généré (unique) — deux bases au même `fileName` ne
   *  se marchent plus dessus. Retourne le docId final pour que l'appelant
   *  puisse le mémoriser (currentDocId). */
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

    await setDoc(ref, {
      userId: user.uid,
      fileName,
      path,
      sheets: JSON.stringify(sheets),
      sheetCount: sheets.length,
      totalRows: sheets.reduce((acc, s) => acc + s.rows.length, 0),
      totalColumns: sheets.reduce((acc, s) => acc + s.columns.length, 0),
      updatedAt: serverTimestamp(),
      createdAt: serverTimestamp(),
    }, { merge: true })

    return fullDocId
  }

  /** Charge une base par son `docId` Firestore complet. */
  const loadFromFirebase = async (docId: string): Promise<ExcelSheet[] | null> => {
    const user = auth.currentUser
    if (!user) return null

    setDetecting(true)
    try {
      const ref = doc(db, COLLECTION, docId)
      const snap = await getDoc(ref)
      if (!snap.exists()) return null
      const data = snap.data()
      const sheets: ExcelSheet[] = JSON.parse(data.sheets)
      setSheets(sheets)
      return sheets
    } finally {
      setDetecting(false)
    }
  }

  /** Liste toutes les bases de l'utilisateur courant. */
  const listSavedFiles = async (): Promise<{ fileName: string; docId: string; totalRows: number; updatedAt: Date | null; path: string[] }[]> => {
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
        }
      })
      .sort((a, b) => {
        if (!a.updatedAt || !b.updatedAt) return 0
        return b.updatedAt.getTime() - a.updatedAt.getTime()
      })

    return files
  }

  /** Supprime une base par son `docId` Firestore complet. */
  const deleteFromFirebase = async (docId: string) => {
    const user = auth.currentUser
    if (!user) return
    const ref = doc(db, COLLECTION, docId)
    await deleteDoc(ref)
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

  return { saveToFirebase, loadFromFirebase, listSavedFiles, deleteFromFirebase, renameFile, moveFile }
}
