// functions/src/workflow/scheduler.ts
import { onSchedule } from 'firebase-functions/v2/scheduler'
import { onCall, HttpsError } from 'firebase-functions/v2/https'
import { initializeApp, getApps } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import { executeWorkflowHeadless } from './execute'
import { preflightWarnings, firstWatchId } from './preflight'
import { writeRunHistory } from './runHistory'
import { writeRunLive, appendRunLiveError, humanizeError } from './runLive'
import {
  loadCheckpoint, saveNodeOutput, saveCheckpointMeta, clearCheckpoint, MAX_RESUME_ATTEMPTS,
} from './checkpoint'
import { computeNextRun, computeNextCycleRun, sanitizeCycle, type CronConfig } from './cronSchedule'
import type { ServerWorkflow } from './types'
import './nodes/index' // enregistre les nodes (effet de bord)

if (!getApps().length) initializeApp()

/** Borne de temps par exécution de workflow : déclenche l'AbortSignal que les nodes
 * (réseau, boucles) surveillent, pour éviter qu'un workflow emballé épuise le budget
 * de la Function et affame les autres plannings dûs. Doit rester < timeoutSeconds des
 * deux Functions (1800s). Relevé à 1700s : une moisson à gros budget de pages (ex. F1 :
 * 1000 pages × 17 sites) + le Comparer dépassaient les 500s → run « interrompu » avant
 * l'écriture du rapport (dashboard figé). Le vrai plafond reste le timeout de la Function. */
const RUN_TIMEOUT_MS = 1_700_000

/** Cadence du battement d'état live. ⚠ Jumeau de `CLIENT_BEAT_INTERVAL_MS`
 *  (`src/features/workflows/runtime/publishClientRun.ts`) : le navigateur publie son état
 *  toutes les dix secondes, le cron ne le faisait qu'aux frontières de niveau — donc jamais
 *  pendant les vingt minutes d'une moisson. Bien plus court que le seuil « run mort » de
 *  trois minutes, qui dépend de ce battement. */
const LIVE_HEARTBEAT_MS = 10_000

/** Miroir du type local de `runLive.ts` — il n'y est pas exporté, et l'exporter pour ce
 *  seul usage élargirait la surface d'un module d'écriture. */
type LiveNodeStatus = 'running' | 'success' | 'error' | 'skipped' | 'pending'

/** Au-delà, un run qui n'écrit plus est mort — même seuil que l'écran « Suivi »
 *  (`LIVE_BEAT_MS`, src/lib/liveRun.ts) : deux valeurs différentes feraient diverger ce
 *  que le serveur REFUSE et ce que l'écran AFFICHE. */
const RUN_ALIVE_MS = 3 * 60_000

/**
 * Un run est-il en train de tourner sur ce workflow ? PUR côté décision, une lecture.
 *
 * ⚠⚠ Rien n'empêchait deux exécutions simultanées du MÊME flux : le cron ne se
 * chevauche pas lui-même (verrou `nextRunAt`), mais un « Lancer (serveur) » pendant un
 * tick cron partait quand même. Les deux écrivent alors le même document d'état live —
 * l'écran alterne entre deux runs et n'en raconte aucun — les mêmes métas de moisson et
 * le même rapport, et la facture des modèles est payée deux fois. La garde côté client
 * ne suffit pas : elle masque le bouton quand un run est visible, elle n'existe pas
 * quand c'est le cron qui vient de démarrer.
 */
export interface LiveRunDoc { status?: string; beatAt?: number; startedAt?: number; trigger?: string }

/** La DÉCISION, isolée de la lecture pour être testable. PUR. */
export function aliveRunOf(d: LiveRunDoc | undefined, now: number): { trigger: string } | null {
  if (!d || d.status !== 'running') return null
  // Repli sur `startedAt` : les documents écrits avant l'estampille `beatAt` n'en ont pas,
  // et les traiter comme morts autoriserait le doublon qu'on vient interdire.
  const beat = d.beatAt ?? d.startedAt ?? 0
  return now - beat <= RUN_ALIVE_MS ? { trigger: d.trigger ?? 'cron' } : null
}

async function liveRun(uid: string, workflowId: string): Promise<{ trigger: string } | null> {
  const snap = await getFirestore().doc(`users/${uid}/workflowRunsLive/${workflowId}`).get().catch(() => null)
  return aliveRunOf(snap?.data() as LiveRunDoc | undefined, Date.now())
}
/** Plafond de plannings traités par tick du scanner (les autres repassent au tick suivant,
 * ordonnés par échéance). Évite qu'un lot massif fasse expirer toute la Function. */
const MAX_SCHEDULES_PER_TICK = 25

/**
 * Fenêtre de fin de run RÉSERVÉE aux nodes AVAL (Comparer catalogue, exports) : les nodes
 * à curseur (moisson, recherche dirigée) rendent la main à RUN_TIMEOUT − RESERVE.
 * Sans elle, la moisson consommait tout le budget à chaque run et le comparatif — dernier
 * du graphe — était interrompu systématiquement (dashboard jamais rafraîchi).
 *
 * ⚠⚠ PORTÉE DE DIX À QUINZE MINUTES le 2026-08-12, sur mesure et non par prudence. Dix
 * minutes suffisaient quand l'index pesait 455 000 fiches ; à 504 000 — et il grossit de
 * vingt mille par heure — « Comparer catalogue » n'y rentre plus. Constaté : QUATRE cycles
 * consécutifs (21:12, 21:43, 22:45, 23:16) sans produire une seule analyse, pendant que le
 * tableau de bord restait figé sur celle de 20:36. Aucune carte en erreur, aucun log : le
 * run est simplement coupé au verrou pendant que le comparatif travaille encore.
 *
 * Le prix est réel — la moisson passe de 18 à 13 minutes par tick — et il est assumé : une
 * analyse produite à chaque cycle vaut mieux qu'un tiers de collecte en plus sur des
 * catalogues déjà bouclés. Ce réglage se relit quand le volume change ; il n'a pas de
 * valeur juste dans l'absolu, seulement une valeur juste POUR UN INDEX DONNÉ.
 */
const DOWNSTREAM_RESERVE_MS = 900_000

/** Types de nodes RÉ-EXÉCUTABLES sans risque même interrompus en plein vol : lecture/
 *  transformation pure, aucun effet de bord externe. La reprise ne saute QUE les nodes
 *  déjà terminés ; si un node NON terminé d'un autre type (gsheets-export, send-gmail,
 *  send-telegram, webhook-post, save-pim…) avait DÉMARRÉ, le ré-exécuter risque des
 *  doublons → on refuse la reprise (cf. garde dans runWorkflow). */
const RESUMABLE_STRADDLE = new Set<string>([
  'list-products', 'scrape-url', 'web-scraping', 'web-search', 'enrichment', 'compare-prices',
  'transform-filter', 'transform-rename', 'transform-set-fields', 'transform-sort', 'transform-text',
  'if-else', 'pipe', 'text-input',
  // Veille tarifaire : avancement par CURSEUR persisté (savePage/saveCursor réécrivent les
  // mêmes docs) ou lecture pure — la ré-exécution après interruption ne doublonne rien.
  // Sans eux, un timeout en pleine moisson (fréquent : 19 sites) rendait la reprise
  // impossible → le run repartait de zéro à chaque tick (« le cron s'arrête au 1ᵉʳ run »).
  'harvest-competitor', 'compare-catalog', 'source-sites', 'directed-search', 'gsheets-import',
])

async function loadWorkflow(uid: string, workflowId: string): Promise<ServerWorkflow | null> {
  const snap = await getFirestore().doc(`users/${uid}/workflows/${workflowId}`).get()
  if (!snap.exists) return null
  const d = snap.data() as { name?: string; nodes?: unknown; edges?: unknown }
  return {
    id: workflowId, name: d.name ?? workflowId, ownerId: uid,
    nodes: (d.nodes ?? []) as ServerWorkflow['nodes'], edges: (d.edges ?? []) as ServerWorkflow['edges'],
  }
}

/** Tronque les rows des sheets de sortie (aperçu client) pour tenir sous le quota
 *  Firestore (1 Mo/doc). 100 lignes/sheet suffisent pour un aperçu.
 *  ⚠️ Ne cape QUE les `.rows`. Un port `file` (ServerFile base64, ex : cost-report)
 *  passe tel quel — OK tant que les fichiers restent petits (rapport HTML ~dizaines de
 *  Ko) ; à tronquer/omettre ici si un node émet un gros binaire (PDF, image). */
function capOutputsForPreview(outputs: Record<string, Record<string, unknown>>, maxRows = 100): Record<string, Record<string, unknown>> {
  const out: Record<string, Record<string, unknown>> = {}
  for (const [id, ports] of Object.entries(outputs)) {
    const p2: Record<string, unknown> = {}
    for (const [port, val] of Object.entries(ports)) {
      if (val && typeof val === 'object' && Array.isArray((val as { rows?: unknown[] }).rows)) {
        const sheet = val as { rows: unknown[] }
        // ⚠ `totalRows` accompagne l'échantillon : c'est lui que l'éditeur affiche sous
        // la carte, et 100 lignes annoncées pour 115 815 réelles est un chiffre faux.
        p2[port] = { ...sheet, totalRows: sheet.rows.length, rows: sheet.rows.slice(0, maxRows) }
      } else {
        p2[port] = val
      }
    }
    out[id] = p2
  }
  // ⚠ JSON round-trip = retire les `undefined` (ex : node Export Sheets → webViewLink
  // undefined). Firestore VALIDE .set() de façon SYNCHRONE et lève sur un undefined —
  // sans ce nettoyage, l'aperçu faisait planter TOUT le run (le .catch de writeRunLive
  // n'attrape pas un throw synchrone). Cf. reference_firestore_setdoc_undefined_trap.
  try { return JSON.parse(JSON.stringify(out)) } catch { return {} }
}

/** Exécute un workflow déjà chargé (boucle d'abort + historique + état live + reprise). */
async function runWorkflow(wf: ServerWorkflow, uid: string, trigger: 'cron' | 'manual' | 'webhook') {
  // Reprise (cron uniquement — seul le scanner peut re-déclencher au tick suivant) : si un
  // run précédent a expiré, on repart de ses sorties au lieu de tout refaire.
  const prior = trigger === 'cron' ? await loadCheckpoint(uid, wf.id) : null
  const startedAt = prior?.startedAt ?? Date.now() // start LOGIQUE (continuité d'affichage + expiration)
  const runId = prior?.runId ?? `srv_${startedAt}`
  const attempts = prior?.attempts ?? 0
  const priorDone = prior ? Object.keys(prior.outputs).length : 0
  const completed = new Set<string>(prior ? Object.keys(prior.outputs) : [])

  // Distingue l'abort par TIMEOUT (reprenable) du STOP volontaire (on n'enchaîne pas).
  let abortReason: 'timeout' | 'stop' | null = null
  const ac = new AbortController()
  // ⚠⚠ NOMMER LES CARTES QUI N'ONT PAS RENDU LA MAIN. Un run coupé au verrou ne disait
  // rien : les cartes restaient « en cours », l'aval « en attente », et il fallait une nuit
  // d'observation pour deviner laquelle tenait la fenêtre. Cinq cycles ont été perdus ainsi
  // le 2026-08-12, avec un tableau de bord figé et aucune trace exploitable.
  //
  // La liste est écrite au moment de la coupure, dans le journal du run : c'est le seul
  // instant où l'information existe encore.
  const timer = setTimeout(() => {
    if (!abortReason) abortReason = 'timeout'
    const snap = liveProbe?.()
    const stuck = snap ? Object.entries(snap.states).filter(([, st]) => st === 'running').map(([id]) => id) : []
    const names = stuck.map((id) => wf.nodes.find((n) => n.id === id)?.type ?? id)
    console.warn(`[scheduler] run ${wf.id} coupé au verrou après ${Math.round(RUN_TIMEOUT_MS / 60_000)} min`
      + (names.length ? ` — carte(s) encore en cours : ${names.join(', ')}` : ' — aucune carte en cours'))
    // ⚠ Ce message ne s'écrit QUE sur un timeout applicatif. Un OOM tue le processus : rien
    // n'est écrit, nulle part. Si les cartes restent « en cours » sans ce message dans le
    // journal, chercher « Memory limit … exceeded » dans les logs de la Function — c'est le
    // seul endroit où l'incident laisse une trace.
    void appendRunLiveError(uid, wf.id, names.length
      ? `Run interrompu au bout de ${Math.round(RUN_TIMEOUT_MS / 60_000)} min : ${names.join(', ')} n'a pas rendu la main dans sa fenêtre. Les cartes en aval n'ont pas été exécutées.`
      : `Run interrompu au bout de ${Math.round(RUN_TIMEOUT_MS / 60_000)} min.`)
    ac.abort()
  }, RUN_TIMEOUT_MS)
  // Bouton STOP : le client pose users/{uid}/workflowAbort/{wf.id} ; on purge un flag
  // périmé au départ, puis on le poll pour déclencher l'abort en cours de run.
  const abortRef = getFirestore().doc(`users/${uid}/workflowAbort/${wf.id}`)
  await abortRef.delete().catch(() => {})
  const abortPoll = setInterval(() => {
    abortRef.get().then((s) => { if (s.exists && s.data()?.requested) { abortReason = 'stop'; ac.abort() } }).catch(() => {})
  }, 3000)
  // État live initial. Sur reprise : on NE réinitialise PAS l'aperçu (les sorties déjà
  // calculées restent visibles) ; sinon reset complet (nouveau runId, aperçu vidé).
  if (prior) {
    await writeRunLive(uid, wf.id, { status: 'running' })
  } else {
    const initial: Record<string, 'pending'> = {}
    for (const n of wf.nodes) initial[n.id] = 'pending'
    // REMPLACEMENT (pas merge) : un run neuf ne doit hériter d'aucun état du précédent —
    // ni les `nodeStates` de nodes depuis supprimés du graphe (affichés « en erreur »
    // à jamais sur les cartes), ni l'`endedAt` du run passé.
    await writeRunLive(uid, wf.id, {
      runId, trigger, startedAt, status: 'running', nodeStates: initial, logs: [],
      nodeOutputs: {}, nodeConnectors: {}, nodeCounts: {}, nodeCycles: {},
    }, { replace: true })
  }
  // Cohérence ENTRE nodes, AVANT d'exécuter. Le contrôle de l'éditeur ne tourne qu'au
  // clic sur « Lancer » : un run planifié pouvait produire un rapport vide chaque nuit
  // sans que rien n'en dise la cause. Journalisé, jamais bloquant.
  const preflight = preflightWarnings(wf)
  if (preflight.length > 0) {
    await writeRunLive(uid, wf.id, { logs: preflight.map((msg) => ({ ts: Date.now(), level: 'warn' as const, msg })) })
  }

  /** Sonde de l'état courant, posée par le moteur dès le démarrage (cf. `onHeartbeat`). */
  let liveProbe: (() => {
    states: Record<string, LiveNodeStatus>
    counts: Record<string, number>
    cycles: Record<string, number>
  }) | null = null
  const heartbeat = setInterval(() => {
    const snap = liveProbe?.()
    if (!snap) return
    void writeRunLive(uid, wf.id, {
      nodeStates: snap.states, nodeCounts: snap.counts, nodeCycles: snap.cycles,
    })
  }, LIVE_HEARTBEAT_MS)

  try {
    // Streaming des logs : écriture throttlée (≥ 2 s) pour que l'onglet Logs se
    // remplisse PENDANT le run (sinon « En cours… Aucun log » jusqu'à la fin).
    let lastLogWrite = 0
    const result = await executeWorkflowHeadless(wf, {
      uid,
      signal: ac.signal,
      runId,
      // Échéance de restitution des nodes à curseur : ancrée sur CE tick (pas sur le
      // startedAt logique d'une série de reprises — chaque tranche a sa pleine fenêtre).
      deadlineAt: Date.now() + RUN_TIMEOUT_MS - DOWNSTREAM_RESERVE_MS,
      resume: prior ? { outputs: prior.outputs } : undefined,
      // Checkpoint cron : persiste chaque sortie de node dès qu'il réussit. On ne le
      // compte « repris » que si la persistance a RÉELLEMENT eu lieu (pas un node trop gros).
      onNodeDone: trigger === 'cron'
        ? async (nodeId, output) => { if (await saveNodeOutput(uid, wf.id, nodeId, output)) completed.add(nodeId) }
        : undefined,
      onProgress: (nodeStates, nodeOutputs, nodeCounts, nodeCycles) =>
        // ⚠ `nodeCounts`/`nodeCycles` VOYAGENT ici aussi. Ils n'étaient écrits qu'à la
        // pause et à la fin : pendant tout le run, les cartes de l'écran « Suivi »
        // n'affichaient aucun chiffre, puis tout apparaissait d'un coup, terminé. Le
        // jumeau navigateur les publie à chaque battement depuis toujours.
        writeRunLive(uid, wf.id, {
          nodeStates, nodeOutputs: capOutputsForPreview(nodeOutputs), nodeCounts, nodeCycles,
        }),
      // ⚠⚠ Battement PÉRIODIQUE, indépendant des nodes. `onProgress` ne se déclenche qu'aux
      // frontières de niveau : un node de moisson qui tourne vingt minutes ne publiait rien
      // entre-temps, et l'écran semblait figé alors que le run collectait des milliers de
      // fiches. Même cadence que le jumeau navigateur (`CLIENT_BEAT_INTERVAL_MS`), dont
      // dépend aussi le seuil « run mort ». Écriture en MERGE : surtout pas `replace`, qui
      // écraserait runId/startedAt/trigger à chaque tick.
      onHeartbeat: (probe) => {
        liveProbe = probe
      },
      onLog: (logs) => {
        const now = Date.now()
        if (now - lastLogWrite < 2000) return
        lastLogWrite = now
        void writeRunLive(uid, wf.id, { logs: logs.slice(-200) })
      },
    })

    // Fin de cycle : signalée ce tick, OU lors d'une tranche précédente du même run
    // (le node signaleur, déjà checkpointé, n'est pas ré-exécuté à la reprise).
    const cycleComplete = result.cycleComplete || !!prior?.cycleComplete

    // Garde d'idempotence : un node à effet de bord DÉMARRÉ mais non terminé serait
    // ré-exécuté en entier à la reprise (doublons Sheets/mail/webhook). On ne reprend que
    // si tout node straddlé est d'un type pur ré-exécutable.
    const typeById = new Map(wf.nodes.map((n) => [n.id, n.type]))
    const unsafeStraddle = result.startedNodes.some(
      (id) => !completed.has(id) && !RESUMABLE_STRADDLE.has(typeById.get(id) ?? ''),
    )
    // Reprenable : timeout cron, run non abouti, progrès réel ce tick, budget restant,
    // et aucun node à effet de bord interrompu en plein vol.
    const canResume = trigger === 'cron' && abortReason === 'timeout' && ac.signal.aborted
      && completed.size > priorDone && attempts + 1 < MAX_RESUME_ATTEMPTS && !unsafeStraddle
    if (canResume) {
      await saveCheckpointMeta(uid, wf.id, { runId, startedAt, attempts: attempts + 1, cycleComplete })
      // Aperçu en pause : les nodes faits = success, le reste = pending (reprise au tick suivant).
      const pausedStates: Record<string, 'success' | 'pending'> = {}
      for (const n of wf.nodes) pausedStates[n.id] = completed.has(n.id) ? 'success' : 'pending'
      clearInterval(heartbeat)
      await writeRunLive(uid, wf.id, {
        runId, trigger, startedAt, status: 'running', nodeStates: pausedStates,
        logs: result.logs.slice(-200), nodeOutputs: capOutputsForPreview(result.nodeOutputs),
        nodeConnectors: result.nodeConnectors,
        nodeCounts: result.nodeCounts,
        nodeCycles: result.nodeCycles,
      })
      return { ...result, cycleComplete, paused: true, stopped: false }
    }

    // Sinon, run terminé : succès/partiel, STOP volontaire, ou reprise impossible/épuisée.
    clearInterval(heartbeat)
    if (trigger === 'cron') await clearCheckpoint(uid, wf.id)
    // Run interrompu (STOP/timeout non reprenable) : statut global « error » (n'a pas abouti),
    // même si les nodes individuels sont « arrêtés » (skipped) et non en échec.
    const finalStatus = ac.signal.aborted ? 'error' : result.status
    // ⚠ L'HISTORIQUE NE DOIT JAMAIS FAIRE ÉCHOUER LE RUN. Cas vécu : un snapshot de
    // 2 808 947 octets refusé par Firestore (limite 1 048 576) faisait remonter l'exception
    // jusqu'au catch ci-dessous — un run ABOUTI y était enregistré « error », son statut
    // final jamais publié et son checkpoint effacé. Le snapshot est un confort ; savoir que
    // le run s'est terminé est l'essentiel. L'échec est journalisé, jamais avalé.
    await writeRunHistory(uid, { workflowId: wf.id, name: wf.name, trigger, startedAt }, { ...result, status: finalStatus })
      .catch(async (e) => {
        const why = e instanceof Error ? e.message : String(e)
        console.warn('[runHistory] snapshot non conservé :', why)
        await appendRunLiveError(
          uid, wf.id, `Résultat non conservé (le run, lui, s'est terminé) : ${why}`,
          { watchId: firstWatchId(wf), runId },
        ).catch(() => {})
      })
    await writeRunLive(uid, wf.id, {
      runId, trigger, startedAt, endedAt: Date.now(),
      status: finalStatus, nodeStates: result.nodeStates, logs: result.logs.slice(-200),
      nodeOutputs: capOutputsForPreview(result.nodeOutputs),
      nodeConnectors: result.nodeConnectors,
      nodeCounts: result.nodeCounts,
      nodeCycles: result.nodeCycles,
    })
    // `status: finalStatus` (et non result.status) : le run interrompu remonte VRAIMENT
    // comme tel jusqu'au planning et au bouton « Lancer » — l'historique le notait déjà,
    // le planning l'ignorait.
    return { ...result, status: finalStatus, cycleComplete, paused: false, stopped: abortReason === 'stop' }
  } catch (err) {
    if (trigger === 'cron') await clearCheckpoint(uid, wf.id).catch(() => {})
    await writeRunLive(uid, wf.id, { runId, endedAt: Date.now(), status: 'error' })
    // Le POURQUOI du crash, visible dans la console du dashboard (sinon boîte noire), et
    // dans le journal des pannes quand ce workflow adresse un suivi (survit à l'élagage
    // des logs live et de l'historique, cf. appendRunLiveError).
    await appendRunLiveError(
      uid, wf.id, `Run interrompu : ${err instanceof Error ? err.message : String(err)}`,
      { watchId: firstWatchId(wf), runId },
    )
    throw err
  } finally {
    clearTimeout(timer)
    clearInterval(abortPoll)
    // Idempotent : déjà arrêté sur les deux sorties normales, il reste le jet d'exception.
    clearInterval(heartbeat)
    await abortRef.delete().catch(() => {})
  }
}

export async function runOne(uid: string, workflowId: string, trigger: 'cron' | 'manual' | 'webhook') {
  const wf = await loadWorkflow(uid, workflowId)
  if (!wf) throw new Error('Workflow introuvable.')
  return runWorkflow(wf, uid, trigger)
}

/** Forme du doc `workflowSchedules/{workflowId}` lue par le scanner. */
interface ScheduleDocData {
  uid: string; workflowId: string; every: number; unit: CronConfig['unit']
  atTime?: string | null; weekday?: number | null; afterCompletion?: boolean
  cycle?: unknown
}

/**
 * Champs de planning à écrire APRÈS un run. Trois issues :
 *  - run en pause (timeout reprenable) → reprise au plus tôt (prochain tick) ;
 *  - cycle de moisson terminé à 100 % ET relance calendaire configurée → prochaine
 *    échéance du calendrier (`cycleWaiting` affiché côté client) ; dates précises
 *    épuisées → la planification se désactive proprement ;
 *  - sinon → cadence normale (ancrée fin de run en mode « après la fin »).
 */
function afterRunPatch(
  s: ScheduleDocData,
  result: { paused: boolean; cycleComplete: boolean; status: string; stopped?: boolean },
  tickStart: number,
): Record<string, unknown> {
  // 'stopped' = arrêt VOLONTAIRE (bouton STOP), distinct d'un échec : sans ça le planning
  // écrivait le statut brut du run et l'utilisateur voyait « ✓ » après avoir tout arrêté —
  // action invisible, donc perçue comme un bouton mort.
  const lastStatus = result.paused ? 'running' : result.stopped ? 'stopped' : result.status
  if (result.paused) return { lastStatus, nextRunAt: Date.now() + 5_000 }
  // Heure de FIN du run : le client s'en sert pour savoir si un battement de moisson est
  // ANTÉRIEUR à la fin (donc mort) ou postérieur (donc vivant). Sans elle, une carte
  // continuait de clignoter 3 min après un STOP — le battement survivait au run.
  const lastEndAt = Date.now()
  const cycle = sanitizeCycle(s.cycle)
  if (cycle && result.cycleComplete) {
    const next = computeNextCycleRun(cycle, Date.now())
    if (next == null) return { lastStatus: 'done', enabled: false, cycleWaiting: false, lastEndAt }
    return { lastStatus, nextRunAt: next, cycleWaiting: true, lastEndAt }
  }
  const cron: CronConfig = {
    enabled: true, every: s.every, unit: s.unit,
    atTime: s.atTime ?? undefined, weekday: s.weekday ?? undefined,
    afterCompletion: !!s.afterCompletion,
  }
  const anchor = cron.afterCompletion ? Date.now() : tickStart
  return { lastStatus, nextRunAt: computeNextRun(cron, anchor), cycleWaiting: false, lastEndAt }
}

// Scanner : toutes les minutes, exécute les plannings dûs (et purge les orphelins).
/**
 * ⚠⚠ MÉMOIRE PORTÉE DE 1 À 4 Gio le 2026-08-13, sur preuve et non par confort.
 *
 * Log de production : « Memory limit of 1024 MiB exceeded with 1025 MiB used ». Le
 * processus est TUÉ — pas d'exception, pas de log applicatif, rien dans le journal du run.
 * Les cartes restent figées « en cours », l'aval n'est jamais atteint, et le cycle suivant
 * meurt de la même façon. Six cycles perdus, un tableau de bord figé cinq heures, et un
 * diagnostic qui a d'abord accusé les échéances puis les timeouts LLM — parce que rien, du
 * côté applicatif, ne dit qu'on vient de mourir.
 *
 * Ce que ce run tient en mémoire, à ce volume : 115 815 lignes × 14 colonnes, 206 353
 * cibles d'enrichissement (la reprise incrémentale étant coupée sur ce flux), et l'index
 * d'un concurrent à la fois — jusqu'à 190 000 fiches. Le gigaoctet ne suffisait plus.
 *
 * ⚠ Un OOM ne se règle pas QUE par la mémoire : il faut aussi que le travail tienne dans
 * l'enveloppe. Mais un run tué n'écrit ni checkpoint ni diagnostic — donner l'air à la
 * Function passe d'abord, comprendre l'empreinte ensuite.
 */
export const workflowCronScheduler = onSchedule(
  { schedule: 'every 1 minutes', region: 'europe-west1', timeoutSeconds: 1800, memory: '4GiB' },
  async () => {
    const db = getFirestore()
    const now = Date.now()
    const due = await db.collection('workflowSchedules')
      .where('enabled', '==', true).where('nextRunAt', '<=', now)
      .orderBy('nextRunAt', 'asc').limit(MAX_SCHEDULES_PER_TICK).get()
    for (const docSnap of due.docs) {
      const s = docSnap.data() as ScheduleDocData
      // Planning orphelin : le workflow a été supprimé sans nettoyer son cron.
      // On purge le doc pour arrêter la boucle d'échec (sinon réessai chaque minute
      // à l'infini, jamais de run réel). Le client purge aussi à la suppression.
      const wf = await loadWorkflow(s.uid, s.workflowId)
      if (!wf) {
        await docSnap.ref.delete().catch(() => {})
        console.warn('workflowCronScheduler: planning orphelin purgé', s.workflowId)
        continue
      }
      const cron: CronConfig = {
        enabled: true, every: s.every, unit: s.unit,
        atTime: s.atTime ?? undefined, weekday: s.weekday ?? undefined,
        afterCompletion: !!s.afterCompletion,
      }
      // VERROU anti-chevauchement, posé AVANT le run : on repousse nextRunAt au-delà du
      // budget de run et on marque 'running'. Sans ça, chaque tick (1×/min) relancerait le
      // même workflow pendant qu'il tourne encore (moisson longue) → empilement de runs et
      // planning jamais avancé (dashboard figé). `lastRunAt = now` = DÉBUT du run (affiché).
      // Si le process meurt en cours, le verrou expire seul (nextRunAt ~30 min → reprise auto).
      // ⚠ Un run lancé À LA MAIN a la priorité : quelqu'un le regarde. On repousse de
      // cinq minutes plutôt que de doubler le travail. ⚠⚠ On ne cède PAS devant un run
      // « cron » vivant : ce serait notre propre reprise après pause (le checkpoint écrit
      // `status: running`), et la bloquer figerait le flux jusqu'à expiration du verrou.
      const human = await liveRun(s.uid, s.workflowId)
      if (human && human.trigger !== 'cron') {
        await docSnap.ref.update({ nextRunAt: now + 5 * 60_000 }).catch(() => {})
        console.log('workflowCronScheduler: run manuel en cours, tick reporté', s.workflowId)
        continue
      }
      // ⚠ Le VERROU d'abord, et FAIL-CLOSED : si le planning a disparu entre le scan et
      // ici (cron supprimé, suspendu, réécrit), on ne lance rien — sans verrou, chaque tick
      // relancerait le même workflow par-dessus lui-même.
      const locked = await docSnap.ref
        .update({ lastRunAt: now, lastStatus: 'running', nextRunAt: now + RUN_TIMEOUT_MS + 120_000 })
        .then(() => true)
        .catch((e) => { console.warn('workflowCronScheduler: verrou impossible, tick ignoré', s.workflowId, e); return false })
      if (!locked) continue
      try {
        const result = await runWorkflow(wf, s.uid, 'cron')
        // ⚠⚠ NE JAMAIS FAIRE ÉCHOUER LE TICK SUR CETTE ÉCRITURE. Vécu : le planning
        // supprimé PENDANT le run faisait remonter « 5 NOT_FOUND: No document to update »
        // jusqu'à la Function — le tick était compté en échec et, surtout, le résultat du
        // run n'était jamais reporté : ni `lastStatus`, ni `lastEndAt`, ni `nextRunAt`. Le
        // bandeau restait donc bloqué sur « En cours » alors que le run était terminé, et
        // c'est exactement la question qu'on n'arrivait pas à trancher à l'écran.
        // Le planning n'est PAS recréé : s'il a disparu, c'est qu'on a voulu l'arrêter.
        await docSnap.ref.update(afterRunPatch(s, result, now))
          .catch((e) => console.warn('workflowCronScheduler: planning disparu pendant le run', s.workflowId, e))
      } catch (err) {
        await docSnap.ref.update({
          lastStatus: 'error',
          // Message persisté (traduit en FR) : le bandeau/console peut dire POURQUOI.
          lastError: humanizeError(err instanceof Error ? err.message : String(err)).slice(0, 500),
          lastErrorAt: Date.now(),
          lastEndAt: Date.now(), // run terminé (en échec) : les battements antérieurs sont morts

          nextRunAt: computeNextRun(cron, cron.afterCompletion ? Date.now() : now),
        }).catch((e) => console.warn('workflowCronScheduler: planning disparu pendant le run', s.workflowId, e))
        console.error('workflowCronScheduler: échec', s.workflowId, err)
      }
    }
  },
)

// Callable : exécution immédiate (bouton « Lancer maintenant (serveur) »).
// Même enveloppe que le cron : ce bouton exécute EXACTEMENT le même graphe, et mourir ici
// aurait été aussi silencieux que là-bas.
export const runWorkflowNow = onCall(
  { region: 'europe-west1', timeoutSeconds: 1800, memory: '4GiB' },
  async (req) => {
    const uid = req.auth?.uid
    if (!uid) throw new HttpsError('unauthenticated', 'Connexion requise.')
    const workflowId = String((req.data as { workflowId?: string })?.workflowId ?? '')
    if (!workflowId) throw new HttpsError('invalid-argument', 'workflowId requis.')
    // ⚠ Refus AVANT d'engager la moindre dépense : un second run n'irait pas plus vite,
    // il écrirait par-dessus le premier et paierait deux fois les modèles.
    const already = await liveRun(uid, workflowId)
    if (already) {
      throw new HttpsError('failed-precondition', 'Un run est déjà en cours sur ce flux.')
    }
    const startedAt = Date.now()
    const result = await runOne(uid, workflowId, 'manual')
    // Resynchroniser le planning : un run manuel peut TERMINER le cycle (→ attendre
    // l'échéance calendaire) ou le RELANCER pendant l'attente (→ reprendre la cadence).
    const ref = getFirestore().doc(`workflowSchedules/${workflowId}`)
    const sched = await ref.get().catch(() => null)
    const s = sched?.exists ? (sched.data() as ScheduleDocData & { enabled?: boolean }) : null
    if (s?.enabled && s.uid === uid) await ref.update(afterRunPatch(s, result, startedAt)).catch(() => {})
    return { status: result.status, nodeCount: result.nodeCount, errorCount: result.errorCount }
  },
)
