// Lecture du rapport persisté d'un suivi, pour le node « Rapport veille tarifaire ».
// Le RENDU vit dans `features/priceWatch/reportHtml` — pur, donc dupliqué côté serveur.
import { getDoc, doc } from 'firebase/firestore'
import { db } from '@/lib/firebase/config'
import { reportLatestDoc } from '@/features/priceWatch/paths'
import type { StoredReport } from '@/features/priceWatch/reportStore'

export { renderPriceWatchReport, DEFAULT_PW_REPORT } from '@/features/priceWatch/reportHtml'

/** Lit le rapport persisté du suivi. null si aucune analyse n'a encore abouti. */
export async function loadStoredReport(uid: string, watchId: string): Promise<StoredReport | null> {
  const snap = await getDoc(doc(db, reportLatestDoc(uid, watchId)))
  return snap.exists() ? (snap.data() as StoredReport) : null
}
