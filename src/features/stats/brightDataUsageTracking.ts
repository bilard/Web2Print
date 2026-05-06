import { doc, setDoc, increment } from 'firebase/firestore'
import { db } from '@/lib/firebase/config'
import { useAuthStore } from '@/stores/auth.store'

/**
 * Bright Data Web Unlocker — pricing par requête réussie.
 * Plan standard ~ $3 / 1000 requêtes (cf. brightdata.com/pricing).
 * Le coût exact dépend de la zone et du quota mensuel ; on stocke une
 * estimation pour alimenter le panneau de consommation live côté UI.
 */
export const BRIGHTDATA_COST_PER_REQUEST_USD = 0.003

/**
 * Persiste un appel Bright Data (un par requête réussie). Stocke un compteur
 * `requests` et un coût USD agrégé dans `brightDataUsage/{userId}_{month}`.
 * Les erreurs Firestore sont silencieuses pour ne pas perturber le scraping.
 */
export async function recordBrightDataUsage(): Promise<void> {
  try {
    const userId = useAuthStore.getState().user?.uid
    if (!userId) return

    const month = new Date().toISOString().slice(0, 7)
    const docId = `${userId}_${month}`

    await setDoc(
      doc(db, 'brightDataUsage', docId),
      {
        ownerId: userId,
        month,
        requests: increment(1),
        costUsd: increment(BRIGHTDATA_COST_PER_REQUEST_USD),
      },
      { merge: true },
    )
  } catch (e) {
    console.warn('[brightDataUsageTracking] recordBrightDataUsage failed:', e)
  }
}
