// Persistance des règles d'appariement d'un suivi. Adaptateur Firestore FIN : toute la
// logique (défauts, bornes, tolérance aux documents anciens) vit dans le module pur
// `catalog/pairingRules.ts`.
//
// Pourquoi Firestore et pas la config d'un node : les consommateurs des règles ne sont
// pas tous joignables par un edge de workflow. L'écran « Concurrents » n'appartient à
// aucun workflow, la passe Kramp tourne côté serveur, et les crons ne voient jamais la
// config d'un node client. Un réglage porté par un port ne s'appliquerait qu'à moitié —
// et ce sont précisément les moitiés silencieuses qui coûtent cher ici.
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore'
import { db } from '@/lib/firebase/config'
import { pairingRulesDoc } from './paths'
import { DEFAULT_PAIRING_RULES, resolvePairingRules, type PairingRules } from './catalog/pairingRules'
import { stripUndefined } from '@/lib/stripUndefined'

/** Qui a écrit le réglage. Le node d'un workflow et l'écran de réglage visent le MÊME
 *  document : sans cette marque, un run nocturne réécrivant ses valeurs par-dessus une
 *  modification faite le matin même serait indétectable. */
export type RulesAuthor = 'node' | 'screen'

export interface StoredPairingRules {
  rules: PairingRules
  updatedAt?: number
  updatedBy?: RulesAuthor
  /** true si le document n'existait pas : l'appelant peut alors dire « règles par
   *  défaut » au lieu de laisser croire à un réglage choisi. */
  fromDefaults: boolean
}

/**
 * Lit les règles d'un suivi. Ne LÈVE JAMAIS : un appariement ne doit pas échouer parce
 * qu'un document de réglage est absent, malformé ou refusé par les règles de sécurité —
 * il retombe sur les défauts, c'est-à-dire sur le comportement historique.
 */
export async function loadPairingRules(uid: string, watchId: string): Promise<StoredPairingRules> {
  try {
    const snap = await getDoc(doc(db, pairingRulesDoc(uid, watchId)))
    if (!snap.exists()) return { rules: DEFAULT_PAIRING_RULES, fromDefaults: true }
    const data = snap.data() as { rules?: Partial<PairingRules>; updatedAt?: number; updatedBy?: RulesAuthor }
    return {
      rules: resolvePairingRules(data.rules),
      updatedAt: data.updatedAt,
      updatedBy: data.updatedBy,
      fromDefaults: false,
    }
  } catch {
    return { rules: DEFAULT_PAIRING_RULES, fromDefaults: true }
  }
}

/**
 * Écrit les règles d'un suivi. Le document est REMPLACÉ (pas fusionné) sur le champ
 * `rules` : une fusion laisserait vivre des clés retirées d'une version à l'autre, et
 * `resolvePairingRules` a déjà normalisé l'objet entier.
 */
export async function savePairingRules(
  uid: string, watchId: string, rules: PairingRules, by: RulesAuthor,
): Promise<void> {
  await setDoc(
    doc(db, pairingRulesDoc(uid, watchId)),
    stripUndefined({ rules: resolvePairingRules(rules), updatedAt: Date.now(), updatedBy: by, touchedAt: serverTimestamp() }),
    { merge: true },
  )
}
