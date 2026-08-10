// Le run NAVIGATEUR publie son état, comme le fait déjà le serveur.
//
// ⚠ Sans ceci, un run lancé dans un onglet n'existe nulle part ailleurs : ni dans un autre
// onglet, ni sur un autre poste, ni dans la PWA. On écrit dans le MÊME document que les
// Functions (`users/{uid}/workflowRunsLive/{workflowId}`) — l'éditeur, l'écran Résultats et
// le mobile s'y abonnent déjà.
import { doc, getDoc, setDoc } from 'firebase/firestore'
import { db } from '@/lib/firebase/config'
import { getWorkspaceUid } from '@/features/access/useWorkspaceUid'
import { useRunContext } from './runContext'
import { useWorkflowStore } from '../persistence/workflow.store'

/** Un battement toutes les cinq secondes au plus. Un run d'une heure écrirait sinon des
 *  milliers de fois pour un écran qui se lit à la seconde. */
export const CLIENT_BEAT_INTERVAL_MS = 5_000

/** Au-delà de ce silence, un run n'est plus vivant : sa place est prenable. Même valeur
 *  que `LIVE_BEAT_MS` (useServerRunLive) et `OPS_BEAT_MS` (buildWatchOps). */
const LIVE_BEAT_MS = 3 * 60_000

export interface LiveDocHead {
  runId?: string
  origin?: 'client' | 'server'
  beatAt?: number
  endedAt?: number
}

/**
 * A-t-on le droit d'écrire dans ce document ? PUR.
 *
 * ⚠ Le cas qui justifie cette fonction : un cron démarre pendant qu'un run tourne dans
 * l'onglet. Les deux écrivent le même document, l'écran alterne entre deux runs et n'en
 * raconte aucun. On laisse la place au premier arrivé tant qu'il donne signe de vie.
 */
export function canOverwrite(existing: LiveDocHead | null, runId: string, now: number): boolean {
  if (!existing?.runId) return true
  if (existing.runId === runId) return true
  if (existing.endedAt != null) return true
  return now - (existing.beatAt ?? 0) > LIVE_BEAT_MS
}

/** PUR. `force` : premier battement, changement d'état d'une carte, fin de run. */
export function shouldBeat(lastAt: number, now: number, force: boolean): boolean {
  return force || lastAt === 0 || now - lastAt >= CLIENT_BEAT_INTERVAL_MS
}

let timer: ReturnType<typeof setInterval> | null = null
let lastBeatAt = 0
/** Le run que CET onglet publie, ou null quand la place appartient à un autre. */
let currentRunId: string | null = null

async function beat(
  workflowId: string, runId: string, force: boolean,
  opts: { replace?: boolean; endStatus?: string } = {},
): Promise<void> {
  const uid = getWorkspaceUid()
  if (!uid) return
  const now = Date.now()
  if (!shouldBeat(lastBeatAt, now, force)) return
  lastBeatAt = now
  const ref = doc(db, 'users', uid, 'workflowRunsLive', workflowId)
  const endStatus = opts.endStatus
  try {
    const states = useRunContext.getState().nodeStates
    const nodeStates: Record<string, string> = {}
    const nodeCounts: Record<string, number> = {}
    const nodeCycles: Record<string, number> = {}
    for (const [id, st] of Object.entries(states)) {
      nodeStates[id] = st.status
      if (typeof st.count === 'number') nodeCounts[id] = st.count
      if (typeof st.cycles === 'number') nodeCycles[id] = st.cycles
    }
    const payload = {
      runId, origin: 'client', trigger: 'manual',
      workflowName: useWorkflowStore.getState().current?.name ?? '',
      beatAt: now, nodeStates, nodeCounts, nodeCycles,
      ...(endStatus ? { status: endStatus, endedAt: now } : { status: 'running' }),
    }
    // ⚠ REMPLACEMENT au démarrage, fusion ensuite. Le merge Firestore fusionne les maps
    // clé à clé : `nodeStates` garderait les entrées de cartes SUPPRIMÉES du graphe,
    // affichées « en erreur » indéfiniment, et un `endedAt` périmé survivrait au nouveau
    // `startedAt` — durée de run absurde. Le jumeau serveur a exactement cette garde
    // (`replace` dans functions/src/workflow/runLive.ts).
    await (opts.replace ? setDoc(ref, { ...payload, startedAt: now }) : setDoc(ref, payload, { merge: true }))
  } catch (e) {
    console.warn('[suivi] battement du run refusé :', e)
  }
}

/**
 * Démarre la publication. À appeler au tout début d'un run navigateur.
 *
 * ⚠ La place se prend UNE FOIS, au démarrage. Un cron qui démarre après nous n'est pas
 * détecté : il écrasera notre battement, ce qui est l'ordre d'arrivée correct. Relire le
 * document toutes les cinq secondes pour arbitrer coûterait une lecture par battement sur
 * toute la durée du run, pour un conflit qui se produit rarement et se résout tout seul.
 */
export async function startClientRunBeat(workflowId: string, runId: string): Promise<void> {
  stopTimer()
  lastBeatAt = 0
  currentRunId = runId
  const uid = getWorkspaceUid()
  if (!uid) return
  try {
    const snap = await getDoc(doc(db, 'users', uid, 'workflowRunsLive', workflowId))
    if (!canOverwrite((snap.data() as LiveDocHead | undefined) ?? null, runId, Date.now())) {
      // On ne se bat pas pour le document : un autre run vivant l'occupe. Le run local
      // continue normalement — il ne sera simplement pas publié.
      currentRunId = null
      console.warn('[suivi] un autre run occupe l’état live de ce flux — publication abandonnée.')
      return
    }
  } catch (e) {
    console.warn('[suivi] état live illisible, publication abandonnée :', e)
    currentRunId = null
    return
  }
  await beat(workflowId, runId, true, { replace: true })
  timer = setInterval(() => { void beat(workflowId, runId, false) }, CLIENT_BEAT_INTERVAL_MS)
}

/** Arrête la publication et écrit l'issue. */
export function stopClientRunBeat(workflowId: string, runId: string, status: string): void {
  stopTimer()
  if (currentRunId !== runId) return   // la place ne nous appartenait pas
  void beat(workflowId, runId, true, { endStatus: status })
  currentRunId = null
}

function stopTimer(): void {
  if (timer) { clearInterval(timer); timer = null }
}
