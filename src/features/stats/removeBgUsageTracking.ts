import { doc, setDoc, increment } from 'firebase/firestore'
import { db } from '@/lib/firebase/config'
import { useAuthStore } from '@/stores/auth.store'

/**
 * Remove.bg — coût estimé par crédit consommé. Une image pleine résolution = 1 crédit ;
 * une preview basse résolution = ~0,25 crédit (l'API renvoie le vrai débit dans l'en-tête
 * `X-Credits-Charged`, qu'on enregistre tel quel). Le tarif réel par crédit varie selon le
 * plan (pay-as-you-go ~1 $, abonnement ~0,18 $) → on retient une estimation médiane pour
 * alimenter le panneau de consommation. La clé Remove.bg est PROPRE à chaque utilisateur
 * (Paramètres → Connecteurs) : la conso est donc per-user, pas un compte partagé comme BD.
 */
const REMOVEBG_USD_PER_CREDIT = 0.2

/**
 * Persiste un appel Remove.bg réussi dans `removebgUsage/{userId}_{month}`.
 * Stocke un compteur `images`, le total de `credits` facturés et un `costUsd` estimé.
 * Les erreurs Firestore sont silencieuses pour ne pas perturber le traitement d'image.
 * @param creditsCharged crédits facturés par l'appel (en-tête `X-Credits-Charged` ; 1 par défaut).
 */
export async function recordRemoveBgUsage(creditsCharged = 1): Promise<void> {
  try {
    const userId = useAuthStore.getState().user?.uid
    if (!userId) return

    const credits = Number.isFinite(creditsCharged) && creditsCharged > 0 ? creditsCharged : 1
    const month = new Date().toISOString().slice(0, 7)
    const docId = `${userId}_${month}`

    await setDoc(
      doc(db, 'removebgUsage', docId),
      {
        ownerId: userId,
        month,
        images: increment(1),
        credits: increment(credits),
        costUsd: increment(credits * REMOVEBG_USD_PER_CREDIT),
      },
      { merge: true },
    )
  } catch (e) {
    console.warn('[removeBgUsageTracking] recordRemoveBgUsage failed:', e)
  }
}
