import { doc, setDoc, getDoc, collection, getDocs, deleteDoc, serverTimestamp, query, where } from 'firebase/firestore'
import { db, auth } from '@/lib/firebase/config'
import { useExcelStore } from '@/stores/excel.store'
import type { ExcelSheet } from './types'

const COLLECTION = 'excel_data'

function getDocId(fileName: string): string {
  return fileName
    .replace(/\.[^.]+$/, '')
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .toLowerCase()
}

export function useExcelFirebase() {
  const { setSheets, setDetecting } = useExcelStore()

  /** Save sheets to Firestore under the file name */
  const saveToFirebase = async (fileName: string, sheets: ExcelSheet[]) => {
    const user = auth.currentUser
    if (!user) {
      console.warn('[Excel Firebase] No authenticated user, skipping save')
      return
    }

    const docId = getDocId(fileName)
    const ref = doc(db, COLLECTION, `${user.uid}_${docId}`)

    console.log(`[Excel Firebase] Saving "${fileName}" (docId: ${docId}) — ${sheets.length} sheet(s), ${sheets.reduce((a, s) => a + s.rows.length, 0)} rows`)

    await setDoc(ref, {
      userId: user.uid,
      fileName,
      docId,
      sheets: JSON.stringify(sheets),
      sheetCount: sheets.length,
      totalRows: sheets.reduce((acc, s) => acc + s.rows.length, 0),
      totalColumns: sheets.reduce((acc, s) => acc + s.columns.length, 0),
      updatedAt: serverTimestamp(),
      createdAt: serverTimestamp(),
    }, { merge: true })

    console.log(`[Excel Firebase] Saved "${fileName}" successfully`)
  }

  /** Load a specific file from Firestore */
  const loadFromFirebase = async (fileName: string): Promise<ExcelSheet[] | null> => {
    const user = auth.currentUser
    if (!user) {
      console.warn('[Excel Firebase] No authenticated user, skipping load')
      return null
    }

    setDetecting(true)
    try {
      const docId = getDocId(fileName)
      const ref = doc(db, COLLECTION, `${user.uid}_${docId}`)
      console.log(`[Excel Firebase] Loading "${fileName}" (docId: ${docId})`)
      const snap = await getDoc(ref)

      if (!snap.exists()) {
        console.log(`[Excel Firebase] "${fileName}" not found`)
        return null
      }

      const data = snap.data()
      const sheets: ExcelSheet[] = JSON.parse(data.sheets)
      setSheets(sheets)
      console.log(`[Excel Firebase] Loaded "${fileName}" — ${sheets.length} sheet(s)`)
      return sheets
    } finally {
      setDetecting(false)
    }
  }

  /** List all saved files for the current user */
  const listSavedFiles = async (): Promise<{ fileName: string; docId: string; totalRows: number; updatedAt: Date | null }[]> => {
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
        }
      })
      .sort((a, b) => {
        if (!a.updatedAt || !b.updatedAt) return 0
        return b.updatedAt.getTime() - a.updatedAt.getTime()
      })

    console.log(`[Excel Firebase] Listed ${files.length} saved file(s)`)
    return files
  }

  /** Delete a saved file */
  const deleteFromFirebase = async (fileName: string) => {
    const user = auth.currentUser
    if (!user) return

    const docId = getDocId(fileName)
    const ref = doc(db, COLLECTION, `${user.uid}_${docId}`)
    await deleteDoc(ref)
    console.log(`[Excel Firebase] Deleted "${fileName}"`)
  }

  return { saveToFirebase, loadFromFirebase, listSavedFiles, deleteFromFirebase }
}
