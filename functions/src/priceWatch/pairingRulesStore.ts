// functions/src/priceWatch/pairingRulesStore.ts
// Lecture des règles d'appariement côté SERVEUR — jumeau de
// src/features/priceWatch/pairingRulesStore.ts. Même document, mêmes défauts : un cron
// qui appliquerait d'autres règles que le navigateur produirait un second rapport pour
// le même suivi sans que rien ne le signale.
import { getFirestore } from 'firebase-admin/firestore'
import { pairingRulesDoc } from './paths'
import { DEFAULT_PAIRING_RULES, resolvePairingRules, type PairingRules } from './catalog/pairingRules'

/**
 * Règles d'un suivi. Ne LÈVE JAMAIS : un run serveur ne doit pas échouer parce qu'un
 * document de réglage manque — il retombe sur les défauts, soit le comportement
 * historique.
 */
export async function loadPairingRules(uid: string, watchId: string): Promise<PairingRules> {
  try {
    const snap = await getFirestore().doc(pairingRulesDoc(uid, watchId)).get()
    if (!snap.exists) return DEFAULT_PAIRING_RULES
    return resolvePairingRules((snap.data() as { rules?: Partial<PairingRules> } | undefined)?.rules)
  } catch {
    return DEFAULT_PAIRING_RULES
  }
}
