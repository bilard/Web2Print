import { doc, setDoc, increment } from 'firebase/firestore'
import { db } from '@/lib/firebase/config'
import { useAuthStore } from '@/stores/auth.store'

/**
 * Higgsfield — conso per-user (clé propre à chaque utilisateur, Paramètres →
 * Connecteurs). L'API Higgsfield ne renvoie PAS le coût en crédits dans la
 * réponse de génération ni d'endpoint de solde → on enregistre le COMPTE RÉEL de
 * générations (images/vidéos) et on estime le coût à partir des tarifs publics.
 * Estimations médianes (USD/génération) — à ajuster si Higgsfield publie un débit
 * exact par requête :
 *   - image (Soul) ≈ 0,06 $   - vidéo (DoP) ≈ 0,40 $
 */
const HIGGSFIELD_USD_PER_IMAGE = 0.06
const HIGGSFIELD_USD_PER_VIDEO = 0.4

/**
 * Persiste une génération Higgsfield réussie dans `higgsfieldUsage/{uid}_{month}`.
 * Compteurs `images` / `videos` (réels) + `generations` + `costUsd` (estimé).
 * Best-effort : les erreurs Firestore sont silencieuses.
 * @param mode 'image' (Soul) ou 'video' (DoP).
 * @param count nombre d'assets produits (batch image → N).
 */
export async function recordHiggsfieldUsage(mode: 'image' | 'video', count = 1): Promise<void> {
  try {
    const userId = useAuthStore.getState().user?.uid
    if (!userId) return

    const n = Number.isFinite(count) && count > 0 ? Math.floor(count) : 1
    const isVideo = mode === 'video'
    const costUsd = n * (isVideo ? HIGGSFIELD_USD_PER_VIDEO : HIGGSFIELD_USD_PER_IMAGE)
    const month = new Date().toISOString().slice(0, 7)

    await setDoc(
      doc(db, 'higgsfieldUsage', `${userId}_${month}`),
      {
        ownerId: userId,
        month,
        images: increment(isVideo ? 0 : n),
        videos: increment(isVideo ? n : 0),
        generations: increment(1),
        costUsd: increment(costUsd),
      },
      { merge: true },
    )
  } catch (e) {
    console.warn('[higgsfieldUsageTracking] recordHiggsfieldUsage failed:', e)
  }
}
