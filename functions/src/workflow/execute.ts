// functions/src/workflow/execute.ts
import type { ServerWorkflow, ServerNode, ServerEdge, RunLog } from './types'
import { topoSort } from './topo'
import { interpolate, buildInterpolationContext } from './interpolate'
import { getServerNode } from './registry'
import { SERVER_UNSUPPORTED, SERVER_SKIP_VISUAL, SERVER_PASS_THROUGH } from './nodes/index'
import { mergeInputValue } from './mergeInputs'
import { getUserLocale, t } from '../i18n'
import { firstWatchId, LABELS } from './preflight'
import { recordIncident, pruneExpiredIncidents } from '../priceWatch/opsIncidents'

export interface HeadlessResult {
  status: 'success' | 'error' | 'partial'
  nodeCount: number
  errorCount: number
  logs: RunLog[]
  nodeOutputs: Record<string, Record<string, unknown>>
  /** Statut final par node (pour l'affichage live côté client). */
  nodeStates: Record<string, LiveNodeStatus>
  /** Volume traité par node, tel que les cartes l'ont remonté. */
  nodeCounts: Record<string, number>
  /** Nombre de PASSAGES par node — un run segmenté en fait plusieurs. */
  nodeCycles: Record<string, number>
  /** Connecteurs réellement utilisés par node (jina/brightdata/llm…), pour les badges. */
  nodeConnectors: Record<string, string[]>
  /** Nodes qui ont RÉELLEMENT démarré leur exécution (entrés dans spec.run). Sert au garde
   *  d'idempotence de la reprise : un node à effet de bord démarré mais non terminé ne doit
   *  pas être ré-exécuté (doublons). */
  startedNodes: string[]
  /** Un node a signalé (ctx.reportCycleComplete) que le cycle de moisson est terminé à
   *  100 % — le scheduler bascule sur l'échéance calendaire de relance. */
  cycleComplete: boolean
}

interface LoopPair { eachId: string; collectId: string; bodyIds: Set<string> }

function detectLoops(nodes: ServerNode[], edges: ServerEdge[]): LoopPair[] {
  const byId = new Map(nodes.map((n) => [n.id, n]))
  const outgoing = new Map<string, ServerEdge[]>()
  for (const e of edges) {
    if (!outgoing.has(e.source)) outgoing.set(e.source, [])
    outgoing.get(e.source)!.push(e)
  }
  const pairs: LoopPair[] = []
  for (const node of nodes) {
    if (node.type !== 'loop-each') continue
    const visited = new Set<string>([node.id])
    const queue = [node.id]
    let collectId: string | null = null
    while (queue.length) {
      const cur = queue.shift()!
      for (const e of outgoing.get(cur) ?? []) {
        if (visited.has(e.target)) continue
        visited.add(e.target)
        const tgt = byId.get(e.target)
        if (!tgt) continue
        if (tgt.type === 'loop-collect') { if (!collectId) collectId = tgt.id; continue }
        queue.push(e.target)
      }
    }
    if (!collectId) continue
    const bodyIds = new Set(visited); bodyIds.delete(node.id); bodyIds.delete(collectId)
    pairs.push({ eachId: node.id, collectId, bodyIds })
  }
  return pairs
}

export type LiveNodeStatus = 'pending' | 'running' | 'success' | 'error' | 'skipped'

/** Cap de concurrence par niveau topo : les branches sœurs tournent en parallèle, mais
 *  on borne pour ne pas saturer la mémoire de la Function (512 MiB) ni les quotas LLM. */
const MAX_NODE_CONCURRENCY = 4

/** Exécute `fn` sur chaque item avec au plus `limit` tâches en vol simultanément. */
async function runConcurrent<T>(items: T[], limit: number, fn: (item: T) => Promise<void>): Promise<void> {
  let cursor = 0
  const worker = async (): Promise<void> => {
    while (cursor < items.length) await fn(items[cursor++])
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
}

export async function executeWorkflowHeadless(
  wf: ServerWorkflow,
  opts: {
    uid: string
    signal: AbortSignal
    /** Notifié à chaque node avec l'état COURANT de tous les nodes + les sorties des
     *  nodes déjà terminés (progression + aperçu données live). */
    onProgress?: (states: Record<string, LiveNodeStatus>, outputs: Record<string, Record<string, unknown>>,
      counts: Record<string, number>, cycles: Record<string, number>) => void | Promise<void>
    /**
     * Reçoit une sonde qui rend l'état courant À TOUT MOMENT. Le battement périodique du
     * planificateur s'en sert : `onProgress` ne se déclenche qu'aux frontières de niveau,
     * donc pendant les vingt minutes d'un node de moisson, RIEN n'était publié — aucun
     * compteur ne bougeait à l'écran, et c'est précisément ce qu'on venait y voir.
     */
    onHeartbeat?: (probe: () => {
      states: Record<string, LiveNodeStatus>
      counts: Record<string, number>
      cycles: Record<string, number>
    }) => void
    /** Notifié à chaque log (throttlé côté appelant) — streaming des logs en direct. */
    onLog?: (logs: RunLog[]) => void
    /** Reprise : sorties des nodes déjà terminés lors d'un run précédent interrompu
     *  (timeout). Ces nodes ne sont pas ré-exécutés ; leurs sorties câblent l'aval. */
    resume?: { outputs: Record<string, Record<string, unknown>> }
    /** Notifié à CHAQUE node terminé avec succès (sortie COMPLÈTE, non tronquée) pour
     *  que l'appelant la persiste durablement (checkpoint de reprise). */
    onNodeDone?: (nodeId: string, output: Record<string, unknown>) => void | Promise<void>
    /** Échéance de restitution pour les nodes à curseur (cf. ServerRunCtx.deadlineAt). */
    deadlineAt?: number
    /** Identifiant du run courant — reporté sur les incidents consignés (cf. plus bas). */
    runId?: string
  },
): Promise<HeadlessResult> {
  // Résolue UNE fois par run : une lecture Firestore, pas une par message.
  const locale = await getUserLocale(opts.uid)
  // Suivi adressé par CE flux, une fois pour tout le run — jumeau EXACT du câblage
  // navigateur (executor.ts) : `null` quand ce workflow n'en adresse aucun, et alors
  // aucune carte en erreur n'y sera consignée.
  const incidentWatchId = firstWatchId(wf)
  const logs: RunLog[] = []
  const log = (level: RunLog['level'], msg: string, node?: string) => {
    logs.push({ ts: Date.now(), level, node, msg })
    opts.onLog?.(logs)
    // Miroir vers les logs Cloud Functions : l'écran Résultats côté client montre
    // les nodes/sorties mais PAS les logs — ce miroir reste le seul accès au détail.
    if (level === 'error' || level === 'warn') {
      const line = `[wf:${wf.name}]${node ? ` [node:${node}]` : ''} ${msg}`
      if (level === 'error') console.error(line)
      else console.warn(line)
    }
  }
  const nodeOutputs: Record<string, Record<string, unknown>> = {}
  const nodeConnectors: Record<string, string[]> = {}
  /** Volume remonté par chaque node (dernière valeur connue). */
  const nodeCounts: Record<string, number> = {}
  /**
   * Combien de fois chaque node a DÉMARRÉ dans ce run.
   *
   * ⚠ Un run long est SEGMENTÉ et repris automatiquement : une moisson de quatorze sites
   * repasse des dizaines de fois sans jamais « finir » au sens du graphe. Sans ce
   * compteur, l'écran montre « en cours » pendant des heures sans dire que le travail
   * avance bel et bien, cycle après cycle.
   */
  const nodeCycles: Record<string, number> = {}
  const outputs = new Map<string, Record<string, unknown>>()
  const errored = new Set<string>()
  const skipped = new Set<string>()
  /** En deçà, la durée d'une carte n'apprend rien — on ne noie pas le journal. */
  const SLOW_NODE_MS = 60_000
  /** Cartes qui n'ont pas tourné parce que le run a été COUPÉ (verrou de temps, stop) —
   *  distinctes des cartes sautées par une condition métier (`ctx.skip()`), qui, elles,
   *  sont un déroulement normal. */
  const abortedNodes = new Set<string>()
  const started = new Set<string>() // nodes entrés dans spec.run (garde reprise)
  let cycleComplete = false // posé par ctx.reportCycleComplete (fin de cycle de moisson)
  // Un incident au moins a-t-il été consigné pendant CE run ? Sert à ne purger qu'une fois
  // par run (pas une fois par carte en erreur) — cf. `pruneExpiredIncidents` plus bas.
  let recordedIncident = false

  const loops = detectLoops(wf.nodes, wf.edges)
  const internalIds = new Set<string>()
  for (const p of loops) for (const id of p.bodyIds) internalIds.add(id)
  const loopByEach = new Map(loops.map((l) => [l.eachId, l]))
  const loopByCollect = new Map(loops.map((l) => [l.collectId, l]))

  const mainNodes = wf.nodes.filter((n) => !internalIds.has(n.id))
  const mainEdges = wf.edges.filter((e) => !internalIds.has(e.source) && !internalIds.has(e.target))
  // Arête synthétique each→collect : le collect (sans amont « main », ses entrées venant
  // du body interne) doit rester APRÈS son each — pour le topo ET le calcul des niveaux.
  const synthEdges: ServerEdge[] = loops.map((l) => ({
    id: `__loop_${l.eachId}`, source: l.eachId, sourceHandle: 'item', target: l.collectId, targetHandle: 'item',
  }))
  let ordered: ServerNode[]
  try { ordered = topoSort(mainNodes, [...mainEdges, ...synthEdges]) }
  catch (err) {
    log('error', err instanceof Error ? err.message : String(err))
    return { status: 'error', nodeCount: 0, errorCount: 1, logs, nodeOutputs, nodeStates: {}, nodeConnectors, nodeCounts: {}, nodeCycles: {}, startedNodes: [], cycleComplete: false }
  }

  const runBody = async (pair: LoopPair, item: unknown, idx: number): Promise<unknown> => {
    const bodyNodes = wf.nodes.filter((n) => pair.bodyIds.has(n.id))
    const innerEdges = wf.edges.filter((e) => pair.bodyIds.has(e.source) && pair.bodyIds.has(e.target))
    const orderedBody = topoSort(bodyNodes, innerEdges)
    const sub = new Map<string, Record<string, unknown>>([[pair.eachId, { item }]])
    for (const bn of orderedBody) {
      if (opts.signal.aborted) throw new Error(t(locale, 'run.stopped'))
      const spec = getServerNode(bn.type)
      if (!spec) throw new Error(t(locale, 'run.unknownTypeInLoop', { type: bn.type }))
      const subInputs: Record<string, unknown> = {}
      for (const e of wf.edges) {
        if (e.target !== bn.id) continue
        const src = sub.get(e.source)
        if (src && e.sourceHandle in src) subInputs[e.targetHandle] = src[e.sourceHandle]
      }
      const itemProps = item && typeof item === 'object' && !Array.isArray(item) ? (item as Record<string, unknown>) : {}
      const ctx = buildInterpolationContext(subInputs, { ...itemProps, item, index: idx })
      const cfg = interpolate(bn.config, ctx) as Record<string, unknown>
      const result = await spec.run(
        { uid: opts.uid, locale, signal: opts.signal, log: (lv, m) => log(lv, `[loop#${idx}] ${m}`, bn.id), rawConfig: bn.config },
        cfg, subInputs,
      )
      sub.set(bn.id, result ?? {})
    }
    const back = wf.edges.find((e) => e.target === pair.collectId && e.targetHandle === 'item')
    return back ? sub.get(back.source)?.[back.sourceHandle] : item
  }

  // État courant de tous les nodes (pour la progression live). `running` = le node
  // passé en argument ; les précédents ont déjà leur état final dans les sets.
  const deriveStates = (running?: ReadonlySet<string>): Record<string, LiveNodeStatus> => {
    const s: Record<string, LiveNodeStatus> = {}
    for (const n of wf.nodes) {
      // ⚠⚠ Le ByPass se teste AVANT « en cours ». Au démarrage d'un niveau, TOUTES ses
      // cartes passent en `running` — y compris celles qu'on a désactivées : elles
      // tournaient à l'écran, spinner compris, pendant toute la durée du niveau, alors
      // qu'elles ne font rien. Une carte désactivée ne travaille jamais, à aucun instant.
      s[n.id] = n.bypass ? 'skipped'
        : running?.has(n.id) ? 'running'
          : errored.has(n.id) ? 'error'
            : bypassed.has(n.id) || skipped.has(n.id) ? 'skipped'
            : outputs.has(n.id) || internalIds.has(n.id) ? 'success'
              : 'pending'
    }
    return s
  }

  // Nodes du niveau en cours d'exécution — la sonde de battement en a besoin pour rendre
  // le MÊME état que `onProgress` publierait à cet instant.
  let levelRunning: ReadonlySet<string> | undefined
  opts.onHeartbeat?.(() => ({
    states: deriveStates(levelRunning), counts: nodeCounts, cycles: nodeCycles,
  }))

  let nodeCount = 0

  // Reprise : réinjecte les sorties des nodes déjà terminés (run précédent interrompu).
  // Ils sont marqués « done » → non ré-exécutés, mais disponibles pour câbler l'aval.
  /** Cartes désactivées à la main. ⚠ Séparé de `skipped` : celui-ci fait sauter tout
   *  l'aval, alors qu'un ByPass doit au contraire le laisser tourner. */
  const bypassed = new Set<string>()
  const done = new Set<string>()
  if (opts.resume) {
    for (const [id, out] of Object.entries(opts.resume.outputs)) {
      outputs.set(id, out); nodeOutputs[id] = out; done.add(id)
    }
  }

  // Exécution d'UN node. Mutations partagées (outputs/errored/skipped/nodeOutputs/nodeCount)
  // sûres malgré la concurrence : JS est mono-thread coopératif et chaque mutation porte
  // sur une clé distincte (nodes d'un même niveau = indépendants).
  const runNode = async (node: ServerNode): Promise<void> => {
    if (done.has(node.id)) { nodeCount++; return } // déjà calculé (reprise)
    const upstream = wf.edges.filter((e) => e.target === node.id && !internalIds.has(e.source))
    if (upstream.some((e) => skipped.has(e.source) || errored.has(e.source))) {
      skipped.add(node.id); return
    }
    // Abort (STOP volontaire ou timeout) = pas un échec : node « arrêté » (neutre), pas erreur.
    if (opts.signal.aborted) {
      skipped.add(node.id); abortedNodes.add(node.id)
      log('warn', 'Arrêté (run interrompu).', node.id)
      return
    }
    // ByPass : la carte ne travaille pas, mais ce qui entre ressort — l'aval continue.
    if (node.bypass) {
      const passed: Record<string, unknown> = {}
      const incoming = upstream
        .map((e) => outputs.get(e.source)?.[e.sourceHandle])
        .find((v) => v !== undefined)
      // Reposé sur CHAQUE port de sortie branché : l'aval réclame un nom de port précis,
      // et publier sur le mauvais revient à ne rien publier.
      for (const e of wf.edges.filter((x) => x.source === node.id)) passed[e.sourceHandle] = incoming
      outputs.set(node.id, passed); nodeOutputs[node.id] = passed
      bypassed.add(node.id)
      log('info', t(locale, 'run.node.bypassed'), node.id)
      return
    }
    if (node.type === 'cron') { outputs.set(node.id, { tick: { at: new Date().toISOString() } }); return }
    if (loopByCollect.has(node.id) && !loopByEach.has(node.id)) { nodeCount++; return }

    const nodeStartedAt = Date.now()
    if (SERVER_UNSUPPORTED.has(node.type)) {
      // Node purement visuel (chart…) : no-op gracieux (sortie vide + warning) → ne fait
      // PAS échouer le run, et l'aval continue avec une entrée vide (pas de cascade skip).
      if (SERVER_SKIP_VISUAL.has(node.type)) {
        outputs.set(node.id, {}); nodeOutputs[node.id] = {}; nodeCount++
        log('warn', `Node « ${node.type} » ignoré côté serveur (rendu navigateur uniquement).`, node.id)
        return
      }
      // Node non exécutable ici mais qui laisse PASSER la donnée : son entrée ressort
      // telle quelle sur les ports branchés, et le run continue.
      //
      // ⚠ Revirement assumé. Ces types étaient marqués EN ERREUR pour qu'un run planifié
      // ne « réussisse » pas sans avoir enrichi. En pratique, une carte accessoire posée au
      // milieu d'une chaîne de veille faisait sauter TOUT l'aval — comparatif vide, mail
      // non parti — pour une réécriture de textes qui, elle, se fait maintenant dans
      // l'écran « Traduire (IA) », hors workflow. Casser la chaîne coûtait plus cher que
      // le risque qu'on voulait couvrir. L'avertissement, lui, reste dans le journal.
      if (SERVER_PASS_THROUGH.has(node.type)) {
        const passed: Record<string, unknown> = {}
        // Ce qui arrive, quel que soit le port d'entrée.
        const incoming = upstream
          .map((e) => outputs.get(e.source)?.[e.sourceHandle])
          .find((v) => v !== undefined)
        // Reposé sur CHAQUE port de sortie branché : l'aval réclame un nom de port précis,
        // et publier sur le mauvais revient à ne rien publier.
        for (const e of wf.edges.filter((x) => x.source === node.id)) passed[e.sourceHandle] = incoming
        outputs.set(node.id, passed); nodeOutputs[node.id] = passed; nodeCount++
        log('warn', `Node « ${node.type} » non exécutable côté serveur : la donnée passe sans être traitée.`, node.id)
        return
      }
      errored.add(node.id); log('error', `Node « ${node.type} » non exécutable côté serveur.`, node.id); return
    }
    const spec = getServerNode(node.type)
    if (!spec) { errored.add(node.id); log('error', t(locale, 'run.unknownType', { type: node.type }), node.id); return }

    const inputs: Record<string, unknown> = {}
    for (const e of upstream) {
      const src = outputs.get(e.source)
      if (src && e.sourceHandle in src) {
        const incoming = src[e.sourceHandle]
        // Fan-in : plusieurs edges sur le même port → fusion (sheets concaténées)
        // au lieu d'écraser. Cf. mergeInputs.ts (parité client).
        inputs[e.targetHandle] = e.targetHandle in inputs
          ? mergeInputValue(inputs[e.targetHandle], incoming)
          : incoming
      }
    }
    started.add(node.id) // à partir d'ici, du travail (potentiellement à effet de bord) a pu démarrer
    nodeCycles[node.id] = (nodeCycles[node.id] ?? 0) + 1
    try {
      const loopPair = loopByEach.get(node.id)
      if (loopPair) {
        const items = inputs.items
        if (!Array.isArray(items)) throw new Error("Loop each : 'items' doit être un tableau.")
        log('info', `Loop : ${items.length} itération(s).`, node.id)
        const results: unknown[] = []
        for (let i = 0; i < items.length; i++) results.push(await runBody(loopPair, items[i], i))
        outputs.set(loopPair.collectId, { results })
        nodeOutputs[loopPair.collectId] = { results }
        outputs.set(node.id, { item: items[0] }); nodeCount++
        return
      }
      const ctx = buildInterpolationContext(inputs)
      const cfg = interpolate(node.config, ctx) as Record<string, unknown>
      // Un node peut demander à être SAUTÉ : le drapeau est lu juste après `run()`, et le
      // node rejoint alors `skipped` — la propagation à l'aval existe déjà.
      let skipReason: string | null = null
      const result = await spec.run(
        {
          uid: opts.uid,
          skip: (reason: string) => { skipReason = reason },
          locale,
          signal: opts.signal,
          workflowId: wf.id,
          workflowName: wf.name,
          log: (lv, m) => log(lv, m, node.id),
          rawConfig: node.config,
          reportConnector: (cid) => {
            const arr = (nodeConnectors[node.id] ??= [])
            if (!arr.includes(cid)) arr.push(cid)
          },
          reportCount: (v) => { if (Number.isFinite(v)) nodeCounts[node.id] = v },
          reportCycleComplete: () => { cycleComplete = true },
          deadlineAt: opts.deadlineAt,
        },
        cfg, inputs,
      )
      if (skipReason != null) {
        skipped.add(node.id)
        log('info', skipReason, node.id)
        return
      }
      outputs.set(node.id, result ?? {})
      nodeOutputs[node.id] = result ?? {}
      // ⚠ COMBIEN DE TEMPS chaque carte a tenu la fenêtre, et ce qu'il restait avant
      // l'échéance de restitution. Sans cette mesure, « le comparatif n'a pas eu son tour »
      // se diagnostique en recoupant des horodatages de logs sur plusieurs runs — c'est
      // exactement ce qui a coûté plusieurs journées d'analyse figée. Seules les cartes
      // LENTES sont journalisées : une carte instantanée n'apprend rien.
      const heldMs = Date.now() - nodeStartedAt
      if (heldMs >= SLOW_NODE_MS) {
        const left = opts.deadlineAt ? Math.round((opts.deadlineAt - Date.now()) / 1000) : null
        log('info', `Fenêtre tenue ${Math.round(heldMs / 1000)} s${left == null ? '' : ` — reste ${left} s avant l'échéance de restitution`}.`, node.id)
      }
      nodeCount++
      await opts.onNodeDone?.(node.id, result ?? {})
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      // Interruption (STOP/timeout) → arrêté (neutre), pas un échec du node.
      if (opts.signal.aborted || /aborted|arrêté/i.test(msg)) {
        skipped.add(node.id); abortedNodes.add(node.id)
        log('warn', 'Arrêté (run interrompu).', node.id)
      } else {
        errored.add(node.id); log('error', msg, node.id)
        // Journal des pannes de la veille tarifaire — MÊME granularité que le navigateur
        // (executor.ts) : une entrée par carte en erreur, silencieusement omise quand ce
        // flux n'adresse aucun suivi. Fire-and-forget : `recordIncident` avale déjà ses
        // propres erreurs et ne doit jamais ralentir ni faire échouer le run.
        //
        // ⚠ Pas de double consignation avec le `catch` de `scheduler.ts` (run qui plante
        // entièrement) POUR LA MÊME panne : ce catch-ci ne rethrow JAMAIS — y compris pour
        // un échec DANS `runBody` (chaque itération de boucle est `await`ée à l'intérieur
        // de CE `try`, dans la branche `loopPair` ci-dessus, donc son échec atterrit ici
        // aussi, attribué à la carte « each »). L'échec d'un node reste donc toujours local
        // à `runNode` ; il ne peut jamais déclencher AUSSI le catch englobant pour la MÊME
        // raison — celui-ci n'est atteignable que par une panne D'UN AUTRE ORDRE (bug
        // d'infrastructure du run — écriture d'état live, boucle de niveaux —, pas l'échec
        // d'un `spec.run()`).
        //
        // ⚠⚠ Ceci ne couvre PAS les reprises cron (tick suivant après timeout, même runId,
        // cf. scheduler.ts::canResume). `onNodeDone`/`saveNodeOutput` ne checkpointent que
        // les nodes qui RÉUSSISSENT ; un node resté en erreur au tick N n'est donc jamais
        // dans `resume.outputs` et se retrouve ré-exécuté au tick N+1 — s'il échoue à
        // nouveau, un DEUXIÈME incident est consigné, même runId, même carte. Ce n'est pas
        // la même panne comptée deux fois par erreur de câblage : c'est une VRAIE
        // ré-exécution qui échoue une deuxième fois. Accepté tel quel (pas de dédup par
        // runId+node : un in-memory set ne survivrait pas au changement d'invocation entre
        // deux ticks) — signalé au journal des rapports plutôt que corrigé en silence.
        if (incidentWatchId) {
          recordedIncident = true
          void recordIncident(opts.uid, incidentWatchId, {
            ts: Date.now(), message: msg, nodeLabel: LABELS[node.type] ?? node.type,
            origin: 'server', ...(opts.runId ? { runId: opts.runId } : {}),
          })
        }
      }
    }
  }

  // Niveaux topo : un node ne démarre qu'une fois TOUS ses amonts terminés. Les nodes d'un
  // même niveau sont indépendants → lancés EN PARALLÈLE (cap concurrence). Les branches
  // sœurs (ex. 3 scrapes → 1 comparateur) ne s'additionnent plus dans le temps, ce qui
  // évite que le budget serveur (RUN_TIMEOUT_MS) expire avant le bout du graphe.
  const upByTarget = new Map<string, string[]>()
  for (const e of [...mainEdges, ...synthEdges]) {
    const arr = upByTarget.get(e.target) ?? upByTarget.set(e.target, []).get(e.target)!
    arr.push(e.source)
  }
  const levelOf = new Map<string, number>()
  for (const node of ordered) {
    const ups = upByTarget.get(node.id) ?? []
    levelOf.set(node.id, ups.reduce((m, u) => Math.max(m, (levelOf.get(u) ?? 0) + 1), 0))
  }
  const byLevel = new Map<number, ServerNode[]>()
  for (const node of ordered) {
    const lvl = levelOf.get(node.id) ?? 0
    const arr = byLevel.get(lvl) ?? byLevel.set(lvl, []).get(lvl)!
    arr.push(node)
  }
  // Pas de `break` sur abort : on traverse les niveaux restants pour que chaque node aval
  // soit marqué « arrêté » (skipped + log) comme avant — runNode le fait sans rien exécuter.
  for (const lvl of [...byLevel.keys()].sort((a, b) => a - b)) {
    const group = byLevel.get(lvl)!
    levelRunning = new Set(group.filter((n) => !n.bypass).map((n) => n.id))
    await opts.onProgress?.(deriveStates(levelRunning), nodeOutputs, nodeCounts, nodeCycles)
    await runConcurrent(group, MAX_NODE_CONCURRENCY, runNode)
    levelRunning = undefined
    await opts.onProgress?.(deriveStates(), nodeOutputs, nodeCounts, nodeCycles)
  }

  // Purge du journal des pannes — UNE fois par run, pas une fois par carte en erreur : la
  // granularité fine ci-dessus (une entrée par carte) rend la rétention 90 jours réellement
  // nécessaire en cron (des dizaines d'incidents/jour sur un flux qui échoue régulièrement),
  // là où le navigateur ne l'atteint qu'à force de runs répétés. Isolée dans son propre
  // échec (cf. `pruneExpiredIncidents`) et attendue (pas fire-and-forget) : une Cloud
  // Function peut être coupée juste après son `return`, un `void` risquerait de ne jamais
  // s'exécuter — ce coût (une lecture Firestore de plus, une fois par run) est acceptable
  // ici, contrairement à `recordIncident` qui reste fire-and-forget sur le chemin chaud.
  if (incidentWatchId && recordedIncident) await pruneExpiredIncidents(opts.uid, incidentWatchId)

  const errorCount = errored.size
  // ⚠ Un run dont des cartes ont été COUPÉES n'est pas un succès. Vécu : « Comparer
  // catalogue » arrêté au verrou, et le run annoncé « run success — 5 node(s) OK » — donc
  // un comparatif jamais produit, sous une étiquette verte. Le statut doit dire ce qui
  // s'est réellement passé, sinon rien ne signale qu'il faut relancer.
  const status: HeadlessResult['status'] = errorCount > 0
    ? (nodeCount > 0 ? 'partial' : 'error')
    : abortedNodes.size > 0 ? 'partial' : 'success'
  // Statut final par node, pour l'affichage live côté client (cartes colorées).
  const nodeStates = deriveStates()
  console.log(`[wf:${wf.name}] run ${status} — ${nodeCount} node(s) OK, ${errorCount} en erreur`)
  // Trace complète (info inclus) à CHAQUE run : l'écran Résultats montre nodeOutputs/
  // nodeStates mais pas les logs `info` (nb de produits, modèle LLM, appariements…) —
  // cette trace reste le seul accès à ce détail. Visible via `firebase functions:log`.
  const trace = logs.map((l) => `  ${l.level} [${l.node ?? '-'}] ${l.msg}`).join('\n')
  console.log(`[wf:${wf.name}] trace:\n${trace}`)
  return { status, nodeCount, errorCount, logs, nodeOutputs, nodeStates, nodeConnectors, nodeCounts, nodeCycles, startedNodes: [...started], cycleComplete }
}
