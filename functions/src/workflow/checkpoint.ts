// functions/src/workflow/checkpoint.ts
// Checkpoint de reprise d'un run serveur interrompu par TIMEOUT (cron uniquement). Les
// sorties des nodes déjà terminés sont persistées ; au tick suivant, le run repart de là
// au lieu de tout refaire — évite qu'un graphe long (scraping lourd) n'aboutisse jamais
// sous le budget de 500 s/invocation. Sorties stockées 1 doc/node (sous le quota 1 Mo
// Firestore) ; un node trop gros n'est pas checkpointé (il sera ré-exécuté à la reprise).
//
// ⚠ IDEMPOTENCE : seuls les nodes TERMINÉS sont checkpointés ; un node à effet de bord
// (export Sheets, mail, webhook, Telegram) interrompu EN PLEIN VOL par le timeout sera
// ré-exécuté en entier à la reprise → risque de doublons s'il avait déjà émis une partie.
// Sans danger pour le cas visé : avec la parallélisation des branches, ces workflows
// finissent dans le budget et n'activent jamais la reprise ; elle ne sert que de filet aux
// graphes qui dépassent VRAIMENT 500 s, où le node final (export) tourne dans une fenêtre
// courte non chevauchée. Si un node à effet de bord LONG straddle un jour le timeout,
// ajouter un garde « non reprenable » sur ces types avant d'étendre l'usage.
import { getFirestore } from 'firebase-admin/firestore'

export interface Checkpoint {
  runId: string
  /** Début du PREMIER run de cette série (pour l'expiration, pas rafraîchi à chaque reprise). */
  startedAt: number
  attempts: number
  outputs: Record<string, Record<string, unknown>>
}

const metaRef = (uid: string, wfId: string) =>
  getFirestore().doc(`users/${uid}/workflowCheckpoints/${wfId}`)
const nodesCol = (uid: string, wfId: string) =>
  getFirestore().collection(`users/${uid}/workflowCheckpoints/${wfId}/nodes`)

/** Au-delà, on abandonne la reprise (borne le coût : ~N×500 s de Function). */
export const MAX_RESUME_ATTEMPTS = 6
/** Un checkpoint plus vieux que ça est périmé (run mort) → ignoré et purgé. */
const STALE_MS = 30 * 60_000
/** Marge sous le quota 1 Mo/doc Firestore pour une sortie de node. */
const MAX_NODE_BYTES = 900_000

export async function loadCheckpoint(uid: string, wfId: string): Promise<Checkpoint | null> {
  const meta = await metaRef(uid, wfId).get().catch(() => null)
  if (!meta || !meta.exists) return null
  const m = meta.data() as { runId?: string; startedAt?: number; attempts?: number }
  if (!m.runId || typeof m.startedAt !== 'number') return null
  if (Date.now() - m.startedAt > STALE_MS) { await clearCheckpoint(uid, wfId); return null }
  const nodes = await nodesCol(uid, wfId).get().catch(() => null)
  const outputs: Record<string, Record<string, unknown>> = {}
  for (const d of nodes?.docs ?? []) {
    outputs[d.id] = (d.data() as { output?: Record<string, unknown> }).output ?? {}
  }
  return { runId: m.runId, startedAt: m.startedAt, attempts: m.attempts ?? 0, outputs }
}

/** Persiste la sortie complète d'un node terminé. Best-effort : un échec (trop gros,
 *  réseau) ne fait jamais planter le run — le node sera simplement ré-exécuté à la reprise.
 *  Retourne `true` SEULEMENT si la sortie a réellement été persistée : l'appelant ne doit
 *  compter un node comme « repris » que dans ce cas (sinon faux progrès → reprises gâchées). */
export async function saveNodeOutput(
  uid: string, wfId: string, nodeId: string, output: Record<string, unknown>,
): Promise<boolean> {
  let json: string
  try { json = JSON.stringify({ output }) } catch { return false }
  if (Buffer.byteLength(json, 'utf8') > MAX_NODE_BYTES) return false
  try { await nodesCol(uid, wfId).doc(nodeId).set({ output }); return true } catch { return false }
}

export async function saveCheckpointMeta(
  uid: string, wfId: string, meta: { runId: string; startedAt: number; attempts: number },
): Promise<void> {
  await metaRef(uid, wfId).set(meta).catch(() => {})
}

export async function clearCheckpoint(uid: string, wfId: string): Promise<void> {
  const nodes = await nodesCol(uid, wfId).get().catch(() => null)
  await Promise.all((nodes?.docs ?? []).map((d) => d.ref.delete().catch(() => {})))
  await metaRef(uid, wfId).delete().catch(() => {})
}
