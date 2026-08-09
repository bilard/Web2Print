// functions/src/workflow/execute.ts
import type { ServerWorkflow, ServerNode, ServerEdge, RunLog } from './types'
import { topoSort } from './topo'
import { interpolate, buildInterpolationContext } from './interpolate'
import { getServerNode } from './registry'
import { SERVER_UNSUPPORTED, SERVER_SKIP_VISUAL, SERVER_PASS_THROUGH } from './nodes/index'
import { mergeInputValue } from './mergeInputs'
import { getUserLocale, t } from '../i18n'

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
    onProgress?: (states: Record<string, LiveNodeStatus>, outputs: Record<string, Record<string, unknown>>) => void | Promise<void>
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
  },
): Promise<HeadlessResult> {
  // Résolue UNE fois par run : une lecture Firestore, pas une par message.
  const locale = await getUserLocale(opts.uid)
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
  const started = new Set<string>() // nodes entrés dans spec.run (garde reprise)
  let cycleComplete = false // posé par ctx.reportCycleComplete (fin de cycle de moisson)

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
      s[n.id] = running?.has(n.id) ? 'running'
        : errored.has(n.id) ? 'error'
          : skipped.has(n.id) ? 'skipped'
            : outputs.has(n.id) || internalIds.has(n.id) ? 'success'
              : 'pending'
    }
    return s
  }

  let nodeCount = 0

  // Reprise : réinjecte les sorties des nodes déjà terminés (run précédent interrompu).
  // Ils sont marqués « done » → non ré-exécutés, mais disponibles pour câbler l'aval.
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
    if (opts.signal.aborted) { skipped.add(node.id); log('warn', 'Arrêté (run interrompu).', node.id); return }
    if (node.type === 'cron') { outputs.set(node.id, { tick: { at: new Date().toISOString() } }); return }
    if (loopByCollect.has(node.id) && !loopByEach.has(node.id)) { nodeCount++; return }

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
      nodeCount++
      await opts.onNodeDone?.(node.id, result ?? {})
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      // Interruption (STOP/timeout) → arrêté (neutre), pas un échec du node.
      if (opts.signal.aborted || /aborted|arrêté/i.test(msg)) {
        skipped.add(node.id); log('warn', 'Arrêté (run interrompu).', node.id)
      } else {
        errored.add(node.id); log('error', msg, node.id)
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
    await opts.onProgress?.(deriveStates(new Set(group.map((n) => n.id))), nodeOutputs)
    await runConcurrent(group, MAX_NODE_CONCURRENCY, runNode)
    await opts.onProgress?.(deriveStates(), nodeOutputs)
  }

  const errorCount = errored.size
  const status: HeadlessResult['status'] = errorCount === 0 ? 'success' : nodeCount > 0 ? 'partial' : 'error'
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
