// src/features/workflows/runtime/executor.ts
import type { Workflow, WorkflowNode, WorkflowEdge, RunContextApi } from '../types'
import { nodeRegistry } from '../registry'
import { topoSort } from './topo'
import { useRunContext } from './runContext'
import { useProgressStore } from '@/stores/progress.store'
import { interpolate } from './interpolate'

export type Middleware = (
  node: WorkflowNode,
  next: () => Promise<void>
) => Promise<void>

export interface ExecuteOptions {
  middleware?: Middleware[]
}

interface LoopPair {
  eachId: string
  collectId: string
  bodyIds: Set<string>
}

function formatValue(v: unknown): string {
  if (v === null || v === undefined) return ''
  if (typeof v === 'object') return JSON.stringify(v)
  return String(v)
}

/**
 * Extrait un tableau de "rows" (objets plats) depuis une valeur d'input :
 *  - si c'est un Array d'objets → renvoie les objets
 *  - si c'est un objet Sheet ({rows: [...]}) → renvoie .rows
 *  - sinon null
 * Permet à `buildInterpolationContext` et au mode iterate de Send Gmail
 * de fonctionner indifféremment depuis le port `rows` (array) ou `sheet`
 * (objet Sheet) du node Upload.
 */
export function extractRows(input: unknown): Record<string, unknown>[] | null {
  if (Array.isArray(input)) {
    const objs = input.filter(
      (v) => v && typeof v === 'object' && !Array.isArray(v),
    ) as Record<string, unknown>[]
    return objs.length > 0 ? objs : null
  }
  if (input && typeof input === 'object') {
    const maybeRows = (input as Record<string, unknown>).rows
    if (Array.isArray(maybeRows)) {
      const objs = maybeRows.filter(
        (v) => v && typeof v === 'object' && !Array.isArray(v),
      ) as Record<string, unknown>[]
      return objs.length > 0 ? objs : null
    }
  }
  return null
}

interface BuildContextOptions {
  /** Custom renderer pour les colonnes-arrays (sinon : join par `, `). */
  arrayRenderer?: (col: string, values: string[]) => string
}

/**
 * Construit le contexte d'interpolation des configs pour un node :
 *  - si un input est un tableau ou objet contenant des rows → chaque
 *    colonne est exposée comme la liste des valeurs (rendu custom ou
 *    join `, ` par défaut)
 *  - les inputs-objets simples sont aplatis à la racine
 *  - les inputs gardent aussi leur nom original
 *  - les `extra` (item/index en loop) écrasent les inputs en conflit
 */
export function buildInterpolationContext(
  inputs: Record<string, unknown>,
  extra: Record<string, unknown> = {},
  options: BuildContextOptions = {},
): Record<string, unknown> {
  const ctx: Record<string, unknown> = {}
  const renderArray =
    options.arrayRenderer ?? ((_col: string, values: string[]) => values.join(', '))

  // Étape 1 : aplatir.
  for (const value of Object.values(inputs)) {
    const rows = extractRows(value)
    if (rows) {
      // Collecte toutes les colonnes uniques des rows
      const cols = new Set<string>()
      for (const obj of rows) for (const k of Object.keys(obj)) cols.add(k)
      for (const col of cols) {
        if (col in ctx) continue
        const values = rows.map((obj) => formatValue(obj[col])).filter(Boolean)
        ctx[col] = renderArray(col, values)
      }
      // Si l'input était un objet Sheet, on expose aussi ses autres props
      if (!Array.isArray(value) && value && typeof value === 'object') {
        for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
          if (k === 'rows') continue
          if (!(k in ctx)) ctx[k] = v
        }
      }
    } else if (value && typeof value === 'object' && !Array.isArray(value)) {
      Object.assign(ctx, value as Record<string, unknown>)
    }
  }
  // Étape 2 : exposer les inputs par leur nom (sans écraser les props déjà aplaties).
  for (const [key, value] of Object.entries(inputs)) {
    if (!(key in ctx)) ctx[key] = value
  }
  // Étape 3 : extras (item / index du loop) écrasent les inputs si conflit nominal.
  Object.assign(ctx, extra)
  return ctx
}

/**
 * Détecte les paires loop-each → loop-collect du workflow et le sous-graphe
 * "body" entre les deux. Le body inclut tous les nodes accessibles par BFS
 * depuis loop-each (en suivant les edges sortants) jusqu'au loop-collect.
 */
function detectLoops(nodes: WorkflowNode[], edges: WorkflowEdge[]): LoopPair[] {
  const byId = new Map(nodes.map((n) => [n.id, n]))
  const outgoing = new Map<string, WorkflowEdge[]>()
  for (const e of edges) {
    if (!outgoing.has(e.source)) outgoing.set(e.source, [])
    outgoing.get(e.source)!.push(e)
  }

  const pairs: LoopPair[] = []

  for (const node of nodes) {
    if (node.type !== 'loop-each') continue

    // BFS depuis loop-each pour trouver le loop-collect cible et le body.
    const visited = new Set<string>([node.id])
    const queue: string[] = [node.id]
    let collectId: string | null = null

    while (queue.length) {
      const cur = queue.shift()!
      for (const e of outgoing.get(cur) ?? []) {
        if (visited.has(e.target)) continue
        visited.add(e.target)
        const tgt = byId.get(e.target)
        if (!tgt) continue
        if (tgt.type === 'loop-collect') {
          if (!collectId) collectId = tgt.id
          continue // ne pas explorer au-delà du collect
        }
        queue.push(e.target)
      }
    }

    if (!collectId) continue // loop-each isolé : ignoré, fallback sur run() par défaut

    // bodyIds = visited \ {eachId, collectId}
    const bodyIds = new Set(visited)
    bodyIds.delete(node.id)
    bodyIds.delete(collectId)
    pairs.push({ eachId: node.id, collectId, bodyIds })
  }

  return pairs
}

/**
 * Exécute le sous-graphe (body) d'une boucle pour un item donné.
 * Retourne la valeur entrant dans le port `item` du loop-collect (= ce qu'on aggrège).
 */
async function executeLoopBody(
  pair: LoopPair,
  item: unknown,
  itemIdx: number,
  allNodes: WorkflowNode[],
  edges: WorkflowEdge[],
  signal: AbortSignal,
  ctxLog: (level: 'info' | 'warn' | 'error', msg: string) => void,
): Promise<unknown> {
  const bodyNodes = allNodes.filter((n) => pair.bodyIds.has(n.id))
  const bodyEdges = edges.filter((e) => pair.bodyIds.has(e.source) || pair.bodyIds.has(e.target))
  const ordered = topoSort(bodyNodes, bodyEdges.filter((e) => pair.bodyIds.has(e.source) && pair.bodyIds.has(e.target)))

  // Outputs locaux au scope de cette itération
  const subOutputs = new Map<string, Record<string, unknown>>()
  // Le loop-each fournit l'item à toutes les itérations
  subOutputs.set(pair.eachId, { item })

  for (const subNode of ordered) {
    if (signal.aborted) {
      ctxLog('warn', `Loop body itération ${itemIdx} abortée.`)
      throw new Error('Run aborted')
    }
    const spec = nodeRegistry.get(subNode.type)
    if (!spec) {
      throw new Error(`Type inconnu dans le body de loop : ${subNode.type}`)
    }

    // Collecte des inputs depuis les edges (incluant ceux qui partent du loop-each)
    const subInputs: Record<string, unknown> = {}
    for (const e of edges) {
      if (e.target !== subNode.id) continue
      const src = subOutputs.get(e.source)
      if (src && e.sourceHandle in src) {
        subInputs[e.targetHandle] = src[e.sourceHandle]
      }
    }

    // Interpolation des configs : props de l'item à la racine + inputs + item/index nominatifs.
    const itemProps =
      item && typeof item === 'object' && !Array.isArray(item)
        ? (item as Record<string, unknown>)
        : {}
    const ctx = buildInterpolationContext(subInputs, {
      ...itemProps,
      item,
      index: itemIdx,
    })
    const interpolatedConfig = interpolate(subNode.config, ctx)

    const subCtxApi: RunContextApi = {
      signal,
      log: (level, msg) => ctxLog(level, `[loop#${itemIdx}] ${msg}`),
      rawConfig: subNode.config,
    }

    const result = (await spec.run(subCtxApi, interpolatedConfig, subInputs)) as Record<string, unknown>
    subOutputs.set(subNode.id, result ?? {})
  }

  // La valeur agrégée = l'input du port `item` du loop-collect
  const collectIncoming = edges.find(
    (e) => e.target === pair.collectId && e.targetHandle === 'item',
  )
  if (!collectIncoming) return item // pas de chemin retour : on renvoie l'item brut
  const lastOutput = subOutputs.get(collectIncoming.source)
  return lastOutput?.[collectIncoming.sourceHandle]
}

export async function executeWorkflow(wf: Workflow, opts: ExecuteOptions = {}): Promise<void> {
  const ctxStore = useRunContext.getState()
  // Garde anti-double-run : si une exécution est déjà en cours, on ignore
  // les clics suivants pour éviter d'envoyer 2× les mails (par exemple).
  if (ctxStore.isRunning) {
    console.warn('[executeWorkflow] Un run est déjà en cours — ignoré.')
    return
  }
  const ac = ctxStore.startRun()
  useProgressStore.getState().begin('Exécution du workflow…')
  try {
    // Détection des loops avant tout topo
    const loops = detectLoops(wf.nodes, wf.edges)
    const internalIds = new Set<string>()
    for (const pair of loops) for (const id of pair.bodyIds) internalIds.add(id)
    // Le collect reste dans le topo principal (il "termine" la loop) ; les body nodes sont retirés.

    const mainNodes = wf.nodes.filter((n) => !internalIds.has(n.id))
    const mainEdges = wf.edges.filter((e) => !internalIds.has(e.source) && !internalIds.has(e.target))

    const ordered = topoSort(mainNodes, mainEdges)
    const outputs = new Map<string, Record<string, unknown>>()
    const skipped = new Set<string>()
    const loopByEach = new Map(loops.map((l) => [l.eachId, l]))
    const loopByCollect = new Map(loops.map((l) => [l.collectId, l]))

    let processed = 0
    for (const node of ordered) {
      useProgressStore.getState().setProgress(++processed / Math.max(1, ordered.length))
      // Skip if any upstream is skipped or errored
      const upstream = wf.edges.filter((e) => e.target === node.id && !internalIds.has(e.source))
      const upstreamFailed = upstream.some(
        (e) => skipped.has(e.source) || useRunContext.getState().nodeStates[e.source]?.status === 'error'
      )
      if (upstreamFailed) {
        skipped.add(node.id)
        useRunContext.getState().setNodeStatus(node.id, 'skipped')
        continue
      }

      if (ac.signal.aborted) {
        useRunContext.getState().endNode(node.id, 'error', 'Run aborted')
        continue
      }

      const spec = nodeRegistry.get(node.type)
      if (!spec) {
        useRunContext.getState().endNode(node.id, 'error', `Unknown node type: ${node.type}`)
        continue
      }

      const inputs: Record<string, unknown> = {}
      for (const e of upstream) {
        const src = outputs.get(e.source)
        if (src && e.sourceHandle in src) inputs[e.targetHandle] = src[e.sourceHandle]
      }

      const ctxApi: RunContextApi = {
        signal: ac.signal,
        log: (level, msg) => useRunContext.getState().appendLog(node.id, level, msg),
        rawConfig: node.config,
      }

      const exec = async (): Promise<void> => {
        useRunContext.getState().startNode(node.id)
        try {
          // Branchement spécial : loop-each déclenche l'exécution du body N fois.
          const loopPair = loopByEach.get(node.id)
          if (loopPair) {
            const items = inputs.items
            if (!Array.isArray(items)) {
              throw new Error("Loop each : l'entrée 'items' doit être un tableau.")
            }
            ctxApi.log('info', `Loop : ${items.length} itération(s).`)

            // Le loop-each lui-même est marqué success ; ses outputs ne sont pas utilisés
            // par le main flow (ses successeurs sont dans le body).
            outputs.set(node.id, { item: items[0] })

            // Exécution du body pour chaque item
            const results: unknown[] = []
            for (let i = 0; i < items.length; i++) {
              const collected = await executeLoopBody(
                loopPair,
                items[i],
                i,
                wf.nodes,
                wf.edges,
                ac.signal,
                ctxApi.log,
              )
              results.push(collected)
            }

            // Le loop-collect reçoit l'array agrégé
            outputs.set(loopPair.collectId, { results })
            useRunContext.getState().setNodeOutputs(loopPair.collectId, { results })
            // Le collect est marqué success directement (pas de run individuel)
            useRunContext.getState().endNode(loopPair.collectId, 'success')

            useRunContext.getState().setNodeOutputs(node.id, { item: items[0] })
            useRunContext.getState().endNode(node.id, 'success')
            return
          }

          // Le loop-collect ne doit pas être exécuté indépendamment ; ses outputs
          // sont déjà publiés par le branchement loop-each. On skip.
          if (loopByCollect.has(node.id)) {
            // déjà traité par le loop-each ; rien à faire ici
            return
          }

          // Interpolation des configs avec les inputs comme contexte
          // (permet {{Nom produit}} dans Send Gmail même hors loop).
          const ctx = buildInterpolationContext(inputs)
          const interpolatedConfig = interpolate(node.config, ctx)
          const result = (await spec.run(ctxApi, interpolatedConfig, inputs)) as Record<string, unknown>
          outputs.set(node.id, result ?? {})
          useRunContext.getState().setNodeOutputs(node.id, result ?? {})
          useRunContext.getState().endNode(node.id, 'success')
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err)
          useRunContext.getState().endNode(node.id, 'error', msg)
        }
      }

      // Compose middleware chain
      const chain = (opts.middleware ?? []).reduceRight<() => Promise<void>>(
        (next, mw) => () => mw(node, next),
        exec
      )
      await chain()
    }
  } finally {
    useRunContext.getState().endRun()
    useProgressStore.getState().end()
  }
}
