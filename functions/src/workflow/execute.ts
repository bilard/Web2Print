// functions/src/workflow/execute.ts
import type { ServerWorkflow, ServerNode, ServerEdge, RunLog } from './types'
import { topoSort } from './topo'
import { interpolate, buildInterpolationContext } from './interpolate'
import { getServerNode } from './registry'
import { SERVER_UNSUPPORTED } from './nodes/index'
import { mergeInputValue } from './mergeInputs'

export interface HeadlessResult {
  status: 'success' | 'error' | 'partial'
  nodeCount: number
  errorCount: number
  logs: RunLog[]
  nodeOutputs: Record<string, Record<string, unknown>>
  /** Statut final par node (pour l'affichage live côté client). */
  nodeStates: Record<string, 'success' | 'error' | 'skipped' | 'pending'>
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

export async function executeWorkflowHeadless(
  wf: ServerWorkflow,
  opts: { uid: string; signal: AbortSignal },
): Promise<HeadlessResult> {
  const logs: RunLog[] = []
  const log = (level: RunLog['level'], msg: string, node?: string) => {
    logs.push({ ts: Date.now(), level, node, msg })
    // Miroir vers les logs Cloud Functions : sans UI d'historique de runs serveur
    // côté client, c'est la seule façon de diagnostiquer un run cron/serveur partiel.
    if (level === 'error' || level === 'warn') {
      const line = `[wf:${wf.name}]${node ? ` [node:${node}]` : ''} ${msg}`
      if (level === 'error') console.error(line)
      else console.warn(line)
    }
  }
  const nodeOutputs: Record<string, Record<string, unknown>> = {}
  const outputs = new Map<string, Record<string, unknown>>()
  const errored = new Set<string>()
  const skipped = new Set<string>()

  const loops = detectLoops(wf.nodes, wf.edges)
  const internalIds = new Set<string>()
  for (const p of loops) for (const id of p.bodyIds) internalIds.add(id)
  const loopByEach = new Map(loops.map((l) => [l.eachId, l]))
  const loopByCollect = new Map(loops.map((l) => [l.collectId, l]))

  const mainNodes = wf.nodes.filter((n) => !internalIds.has(n.id))
  const mainEdges = wf.edges.filter((e) => !internalIds.has(e.source) && !internalIds.has(e.target))
  let ordered: ServerNode[]
  try { ordered = topoSort(mainNodes, mainEdges) }
  catch (err) {
    log('error', err instanceof Error ? err.message : String(err))
    return { status: 'error', nodeCount: 0, errorCount: 1, logs, nodeOutputs, nodeStates: {} }
  }

  const runBody = async (pair: LoopPair, item: unknown, idx: number): Promise<unknown> => {
    const bodyNodes = wf.nodes.filter((n) => pair.bodyIds.has(n.id))
    const innerEdges = wf.edges.filter((e) => pair.bodyIds.has(e.source) && pair.bodyIds.has(e.target))
    const orderedBody = topoSort(bodyNodes, innerEdges)
    const sub = new Map<string, Record<string, unknown>>([[pair.eachId, { item }]])
    for (const bn of orderedBody) {
      if (opts.signal.aborted) throw new Error('Run aborted')
      const spec = getServerNode(bn.type)
      if (!spec) throw new Error(`Type inconnu dans le body de loop : ${bn.type}`)
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
        { uid: opts.uid, signal: opts.signal, log: (lv, m) => log(lv, `[loop#${idx}] ${m}`, bn.id), rawConfig: bn.config },
        cfg, subInputs,
      )
      sub.set(bn.id, result ?? {})
    }
    const back = wf.edges.find((e) => e.target === pair.collectId && e.targetHandle === 'item')
    return back ? sub.get(back.source)?.[back.sourceHandle] : item
  }

  let nodeCount = 0
  for (const node of ordered) {
    const upstream = wf.edges.filter((e) => e.target === node.id && !internalIds.has(e.source))
    if (upstream.some((e) => skipped.has(e.source) || errored.has(e.source))) {
      skipped.add(node.id); continue
    }
    if (opts.signal.aborted) { errored.add(node.id); log('error', 'Run aborted', node.id); continue }
    if (node.type === 'cron') { outputs.set(node.id, { tick: { at: new Date().toISOString() } }); continue }
    if (loopByCollect.has(node.id) && !loopByEach.has(node.id)) { nodeCount++; continue }

    if (SERVER_UNSUPPORTED.has(node.type)) {
      errored.add(node.id); log('error', `Node « ${node.type} » non exécutable côté serveur.`, node.id); continue
    }
    const spec = getServerNode(node.type)
    if (!spec) { errored.add(node.id); log('error', `Type inconnu : ${node.type}`, node.id); continue }

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
        continue
      }
      const ctx = buildInterpolationContext(inputs)
      const cfg = interpolate(node.config, ctx) as Record<string, unknown>
      const result = await spec.run(
        { uid: opts.uid, signal: opts.signal, log: (lv, m) => log(lv, m, node.id), rawConfig: node.config },
        cfg, inputs,
      )
      outputs.set(node.id, result ?? {})
      nodeOutputs[node.id] = result ?? {}
      nodeCount++
    } catch (err) {
      errored.add(node.id); log('error', err instanceof Error ? err.message : String(err), node.id)
    }
  }

  const errorCount = errored.size
  const status: HeadlessResult['status'] = errorCount === 0 ? 'success' : nodeCount > 0 ? 'partial' : 'error'
  // Statut final par node, pour l'affichage live côté client (cartes colorées).
  const nodeStates: HeadlessResult['nodeStates'] = {}
  for (const n of wf.nodes) {
    nodeStates[n.id] = errored.has(n.id)
      ? 'error'
      : skipped.has(n.id)
        ? 'skipped'
        : outputs.has(n.id) || internalIds.has(n.id)
          ? 'success'
          : 'pending'
  }
  console.log(`[wf:${wf.name}] run ${status} — ${nodeCount} node(s) OK, ${errorCount} en erreur`)
  // Trace complète (info inclus) à CHAQUE run : sans UI d'historique côté client,
  // c'est le seul moyen de voir le détail par node (nb de produits, modèle LLM,
  // appariements…), y compris sur un run success. Visible via `firebase functions:log`.
  const trace = logs.map((l) => `  ${l.level} [${l.node ?? '-'}] ${l.msg}`).join('\n')
  console.log(`[wf:${wf.name}] trace:\n${trace}`)
  return { status, nodeCount, errorCount, logs, nodeOutputs, nodeStates }
}
