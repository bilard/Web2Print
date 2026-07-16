import { doc, getDoc } from 'firebase/firestore'
import { db, auth } from '@/lib/firebase/config'
import type { ExcelSheet } from '@/features/excel/types'

const COLLECTION = 'excel_data'
const PAYLOAD_COLLECTION = 'excel_data_payload'

/**
 * Lit les feuilles d'une base par son `docId` SANS toucher au store excel ni
 * basculer la base active — pour inspecter une base en arrière-plan (ex. compter
 * ses produits vérifiés fabricant). Réplique l'ordre méta-d'abord de
 * `loadFromFirebase` : attaquer `excel_data_payload` en premier jette
 * permission-denied sur un doc non migré (resource null).
 */
export async function fetchSheetsQuiet(docId: string): Promise<ExcelSheet[] | null> {
  if (!auth.currentUser) return null
  try {
    const metaSnap = await getDoc(doc(db, COLLECTION, docId))
    if (!metaSnap.exists()) return null
    const meta = metaSnap.data()
    if (typeof meta.sheets === 'string') return JSON.parse(meta.sheets) as ExcelSheet[]
    const payloadSnap = await getDoc(doc(db, PAYLOAD_COLLECTION, docId))
    if (!payloadSnap.exists()) return null
    return JSON.parse(payloadSnap.data().json) as ExcelSheet[]
  } catch {
    return null
  }
}
