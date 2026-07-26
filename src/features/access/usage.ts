// Compteurs d'usage cumulés par compte (`users/{uid}.usage.{pimRows,damAssets}`),
// support des quotas des comptes « démo ». L'incrément client est le compteur de
// vérité pour le PIM (import batch direct) ; pour le DAM, la Cloud Function
// `damUpload` incrémente `damAssets` côté serveur (source de vérité infalsifiable),
// le client ne fait que refléter localement pour l'UX.
import { doc, setDoc, increment } from 'firebase/firestore'
import { db } from '@/lib/firebase/config'
import type { UsageCounters } from './permissions'

export function emptyUsage(): UsageCounters {
  return { pimRows: 0, damAssets: 0 }
}

/** Normalise un champ `usage` Firestore (tolère l'absence / les valeurs partielles). */
export function readUsage(raw: unknown): UsageCounters {
  const u = (raw ?? {}) as Partial<UsageCounters>
  return {
    pimRows: typeof u.pimRows === 'number' ? u.pimRows : 0,
    damAssets: typeof u.damAssets === 'number' ? u.damAssets : 0,
  }
}

/**
 * Incrémente les compteurs d'usage du user (merge). Best-effort — l'appelant gère
 * l'erreur. Les règles Firestore interdisent la DÉCROISSANCE (anti-reset), donc on
 * ne passe ici que des deltas positifs.
 */
export async function incrementUsage(uid: string, patch: Partial<UsageCounters>): Promise<void> {
  const usage: Record<string, unknown> = {}
  if (patch.pimRows) usage.pimRows = increment(patch.pimRows)
  if (patch.damAssets) usage.damAssets = increment(patch.damAssets)
  if (Object.keys(usage).length === 0) return
  await setDoc(doc(db, 'users', uid), { usage }, { merge: true })
}
