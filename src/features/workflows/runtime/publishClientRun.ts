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
/** Le run que CET onglet a l'INTENTION de publier, ou null. Posé de façon SYNCHRONE dès
 *  `startClientRunBeat` — avant même de savoir si la place est gagnée. */
let currentRunId: string | null = null
/** Vrai une fois la place CONFIRMÉE (après le `getDoc` + `canOverwrite`).
 *
 * ⚠ Un run très court (graphe vide, abort immédiat) peut appeler `stopClientRunBeat` avant
 * que le `getDoc` de `startClientRunBeat` n'ait répondu. `currentRunId` est déjà posé à ce
 * moment-là (il l'est de façon synchrone), donc un simple test sur `currentRunId` ne suffit
 * pas à distinguer « c'est notre run » de « on ne sait pas encore si c'est notre run » : on
 * écrirait soit dans le document d'un cron qui vient de gagner la course (trap #2 violé),
 * soit un `running` par-dessus l'issue déjà écrite par `stopClientRunBeat` (run éternellement
 * « en cours » à l'écran, battu toutes les 5 s pour toujours). `owned` tranche les deux cas. */
let owned = false
/** Issue demandée pendant que la prise de place est encore en vol. Appliquée dès qu'elle
 *  aboutit, à la place du premier battement « running » qui serait déjà faux. */
let pendingEndStatus: string | null = null

async function beat(
  workflowId: string, runId: string, force: boolean,
  opts: { replace?: boolean; endStatus?: string } = {},
): Promise<void> {
  const uid = getWorkspaceUid()
  if (!uid) return
  const now = Date.now()
  if (!shouldBeat(lastBeatAt, now, force)) return
  lastBeatAt = now
  const endStatus = opts.endStatus
  try {
    // `doc()` valide son chemin de façon SYNCHRONE et peut lever (segment vide) : à
    // l'intérieur du try, sinon `void beat(...)` produirait un rejet de promesse non
    // intercepté au lieu du `console.warn` habituel.
    const ref = doc(db, 'users', uid, 'workflowRunsLive', workflowId)
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
  owned = false
  pendingEndStatus = null
  const uid = getWorkspaceUid()
  if (!uid) return
  try {
    const snap = await getDoc(doc(db, 'users', uid, 'workflowRunsLive', workflowId))
    // Le run a pu s'arrêter (ou un run plus récent démarrer) pendant cette lecture.
    if (currentRunId !== runId) return
    if (!canOverwrite((snap.data() as LiveDocHead | undefined) ?? null, runId, Date.now())) {
      // On ne se bat pas pour le document : un autre run vivant l'occupe. Le run local
      // continue normalement — il ne sera simplement pas publié.
      currentRunId = null
      pendingEndStatus = null
      console.warn('[suivi] un autre run occupe l’état live de ce flux — publication abandonnée.')
      return
    }
  } catch (e) {
    console.warn('[suivi] état live illisible, publication abandonnée :', e)
    currentRunId = null
    pendingEndStatus = null
    return
  }
  // La place est gagnée : à partir d'ici, `stopClientRunBeat` peut écrire directement.
  owned = true
  if (pendingEndStatus != null) {
    // `stopClientRunBeat` a été appelé PENDANT la négociation de la place (run très court,
    // abort immédiat). On publie l'issue tout de suite — jamais un « running » qui serait
    // déjà faux, jamais deux écritures.
    const status = pendingEndStatus
    pendingEndStatus = null
    await beat(workflowId, runId, true, { replace: true, endStatus: status })
    currentRunId = null
    owned = false
    return
  }
  await beat(workflowId, runId, true, { replace: true })
  timer = setInterval(() => { void beat(workflowId, runId, false) }, CLIENT_BEAT_INTERVAL_MS)
}

/** L'identifiant du run que CET onglet publie, ou null. */
export function activeClientRunId(): string | null { return currentRunId }

/** Ce battement est-il le nôtre ? PUR. */
export function isOwnEcho(head: { origin?: string; runId?: string } | null, runId: string | null): boolean {
  return !!head && head.origin === 'client' && !!runId && head.runId === runId
}

/** Arrête la publication et écrit l'issue. */
export function stopClientRunBeat(workflowId: string, runId: string, status: string): void {
  stopTimer()
  if (currentRunId !== runId) return   // la place ne nous appartenait pas (ou plus)
  if (!owned) {
    // La prise de place est encore en vol : on ne sait pas encore si le document nous
    // appartient. `startClientRunBeat` publiera cette issue dès qu'il le saura.
    pendingEndStatus = status
    return
  }
  void beat(workflowId, runId, true, { endStatus: status })
  currentRunId = null
  owned = false
}

function stopTimer(): void {
  if (timer) { clearInterval(timer); timer = null }
}
