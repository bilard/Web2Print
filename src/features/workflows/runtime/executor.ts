import { getWorkspaceUid } from '@/features/access/useWorkspaceUid'
import type { Workflow, WorkflowNode, WorkflowEdge, RunContextApi, NodeRunState } from '../types'
import { nodeRegistry } from '../registry'
import { topoSort } from './topo'
import { useRunContext } from './runContext'
import { useWorkflowStore } from '../persistence/workflow.store'
import { useProgressStore } from '@/stores/progress.store'
import { interpolate } from './interpolate'
import { mergeInputValue } from './mergeInputs'
import { persistClientRun, type RunStatus } from '../persistence/runHistoryClient'
// Messages d'exécution hors composant : helper `t()` de module.
import { t } from '@/lib/i18n'

type Middleware = (
  node: WorkflowNode,
  next: () => Promise<void>
) => Promise<void>

/** Résumé d'un run, pour afficher un message de fin clair (✅ / ⚠️ / ❌). */
export interface RunOutcome {
  aborted: boolean
  okCount: number
  errorCount: number
  firstError?: string
  firstWarn?: string
}

export interface ExecuteOptions {
  middleware?: Middleware[]
  /**
   * RUN partiel « depuis une carte » : n'exécute que ce node et tout son aval.
   * L'amont est supposé déjà exécuté — ses sorties en cache (nodeStates) sont
   * réinjectées comme entrées ; une entrée amont absente déclenche un warning
   * sur le node concerné (visible dans l'onglet Logs).
   */
  fromNodeId?: string
}

/** Promise résolue dès que le signal est abandonné (Stop). Un seul listener par run. */
function whenAborted(signal: AbortSignal): Promise<void> {
  if (signal.aborted) return Promise.resolve()
  return new Promise<void>((resolve) => {
    signal.addEventListener('abort', () => resolve(), { once: true })
  })
}

/** Cap de concurrence par niveau topo : les branches sœurs (ex. 3 scrapes indépendants)
 *  tournent EN PARALLÈLE, mais on borne pour ne pas saturer les quotas LLM/proxy. Aligné
 *  sur le jumeau serveur `executeWorkflowHeadless` (functions/src/workflow/execute.ts). */
const MAX_NODE_CONCURRENCY = 4

/** Exécute `fn` sur chaque item avec au plus `limit` tâches en vol simultanément. */
async function runConcurrent<T>(items: T[], limit: number, fn: (item: T) => Promise<void>): Promise<void> {
  let cursor = 0
  const worker = async (): Promise<void> => {
    while (cursor < items.length) await fn(items[cursor++])
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
}

/** Ensemble { node de départ } ∪ { tous ses descendants } en suivant les edges sortants. */
function downstreamFrom(startId: string, edges: WorkflowEdge[]): Set<string> {
  const outgoing = new Map<string, string[]>()
  for (const e of edges) {
    if (!outgoing.has(e.source)) outgoing.set(e.source, [])
    outgoing.get(e.source)!.push(e.target)
  }
  const set = new Set<string>([startId])
  const queue = [startId]
  while (queue.length) {
    const cur = queue.shift()!
    for (const t of outgoing.get(cur) ?? []) {
      if (!set.has(t)) {
        set.add(t)
        queue.push(t)
      }
    }
  }
  return set
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
      throw new Error(t('run.stopped'))
    }
    const spec = nodeRegistry.get(subNode.type)
    if (!spec) {
      throw new Error(t('run.unknownTypeInLoop', { type: subNode.type }))
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

export async function executeWorkflow(wf: Workflow, opts: ExecuteOptions = {}): Promise<RunOutcome> {
  const ctxStore = useRunContext.getState()
  // Garde anti-double-run : si une exécution est déjà en cours, on ignore
  // les clics suivants pour éviter d'envoyer 2× les mails (par exemple).
  if (ctxStore.isRunning) {
    console.warn('[executeWorkflow] Un run est déjà en cours — ignoré.')
    return { aborted: false, okCount: 0, errorCount: 0 }
  }
  // RUN partiel : on ne réinitialise que le sous-graphe aval ; les sorties amont
  // déjà en cache sont conservées et serviront d'entrées.
  const runSet = opts.fromNodeId ? downstreamFrom(opts.fromNodeId, wf.edges) : null
  const startedAt = Date.now()
  const ac = ctxStore.startRun(runSet ? { clearIds: [...runSet] } : undefined)
  useProgressStore.getState().begin(runSet ? 'Exécution depuis le node…' : 'Exécution du workflow…')
  try {
    // Détection des loops avant tout topo
    const loops = detectLoops(wf.nodes, wf.edges)
    const internalIds = new Set<string>()
    for (const pair of loops) for (const id of pair.bodyIds) internalIds.add(id)
    // Le collect reste dans le topo principal (il "termine" la loop) ; les body nodes sont retirés.

    const mainNodes = wf.nodes.filter((n) => !internalIds.has(n.id))
    const mainEdges = wf.edges.filter((e) => !internalIds.has(e.source) && !internalIds.has(e.target))

    // Arête synthétique each→collect : garantit que le loop-collect reste APRÈS son
    // loop-each dans le topo ET dans le calcul des niveaux (le body est hors graphe
    // principal, sinon le collect remonterait au niveau 0). Cf. jumeau serveur execute.ts.
    const synthEdges: WorkflowEdge[] = loops.map((l) => ({
      id: `__loop_${l.eachId}`, source: l.eachId, sourceHandle: 'item', target: l.collectId, targetHandle: 'item',
    }))
    const ordered = topoSort(mainNodes, [...mainEdges, ...synthEdges])
    // « Pas de lien → ne pas faire tourner la carte » : ensemble des nodes ayant au
    // moins une connexion (entrante ou sortante). Les orphelins sont ignorés.
    const connectedIds = new Set<string>()
    for (const e of wf.edges) {
      connectedIds.add(e.source)
      connectedIds.add(e.target)
    }
    const outputs = new Map<string, Record<string, unknown>>()
    // RUN partiel : réinjecte les sorties des nodes amont (hors sous-graphe) depuis le cache.
    if (runSet) {
      for (const [id, st] of Object.entries(useRunContext.getState().nodeStates)) {
        if (!runSet.has(id) && st.outputs) outputs.set(id, st.outputs)
      }
    }
    const skipped = new Set<string>()
    const loopByEach = new Map(loops.map((l) => [l.eachId, l]))
    const loopByCollect = new Map(loops.map((l) => [l.collectId, l]))

    // Un seul listener d'abort pour tout le run (réutilisé à chaque node).
    const abortedPromise = whenAborted(ac.signal)
    const total = Math.max(1, ordered.length)
    let processed = 0

    // Exécute UN node (skips, inputs, run, état). Mutations partagées (outputs/skipped/
    // processed + setters Zustand) sûres malgré la concurrence : JS est mono-thread
    // coopératif et chaque node écrit des clés distinctes (nodes d'un même niveau =
    // indépendants). Cf. jumeau serveur executeWorkflowHeadless (execute.ts).
    const runNode = async (node: WorkflowNode): Promise<void> => {
      // RUN partiel : on ne touche pas aux nodes hors sous-graphe (état/logs conservés).
      if (runSet && !runSet.has(node.id)) return
      // Node orphelin (aucune connexion) : on ne le fait pas tourner — sauf si le
      // workflow n'a AUCUN lien (cas mono-node légitime, qu'on exécute normalement).
      if (wf.edges.length > 0 && !connectedIds.has(node.id)) return
      // Le loop-collect est finalisé par son loop-each à un niveau ANTÉRIEUR (synthEdge).
      // On le saute AVANT startNode — sinon il resterait coincé en « running ».
      if (loopByCollect.has(node.id) && !loopByEach.has(node.id)) return

      useProgressStore.getState().setProgress(++processed / total)
      // Skip if any upstream is skipped or errored
      const upstream = wf.edges.filter((e) => e.target === node.id && !internalIds.has(e.source))
      const upstreamFailed = upstream.some(
        (e) => skipped.has(e.source) || useRunContext.getState().nodeStates[e.source]?.status === 'error'
      )
      if (upstreamFailed) {
        skipped.add(node.id)
        useRunContext.getState().setNodeStatus(node.id, 'skipped')
        return
      }

      if (ac.signal.aborted) {
        useRunContext.getState().endNode(node.id, 'error', t('run.stopped'))
        return
      }

      const spec = nodeRegistry.get(node.type)
      if (!spec) {
        useRunContext.getState().endNode(node.id, 'error', t('run.unknownType', { type: node.type }))
        return
      }

      const inputs: Record<string, unknown> = {}
      for (const e of upstream) {
        const src = outputs.get(e.source)
        if (src && e.sourceHandle in src) {
          const incoming = src[e.sourceHandle]
          // Fan-in : plusieurs edges sur le même port → fusion (sheets concaténées)
          // au lieu d'écraser. Cf. mergeInputs.ts (parité serveur).
          inputs[e.targetHandle] = e.targetHandle in inputs
            ? mergeInputValue(inputs[e.targetHandle], incoming)
            : incoming
        }
      }

      // Entrée REQUISE vide alors qu'un edge l'alimente : le node va échouer sur un
      // « … manquante en entrée » qui décrit le symptôme et tait la cause. On nomme donc
      // ici le node amont fautif et ce qu'il a fait — jamais exécuté (run partiel),
      // en erreur, ou terminé sans produire ce port.
      for (const port of spec.inputs ?? []) {
        // Un port FACULTATIF vide n'est signalé qu'en run partiel : ailleurs, ne rien
        // recevoir sur un port optionnel est un cas nominal, pas une anomalie.
        if (inputs[port.name] !== undefined || (!port.required && !runSet)) continue
        for (const e of upstream.filter((edge) => edge.targetHandle === port.name)) {
          const src = wf.nodes.find((n) => n.id === e.source)
          const srcSpec = src ? nodeRegistry.get(src.type) : undefined
          const label = srcSpec ? t(srcSpec.labelKey) : (src?.type ?? e.source)
          const status = useRunContext.getState().nodeStates[e.source]?.status
          useRunContext.getState().appendLog(node.id, 'warn', t(
            !outputs.has(e.source)
              ? 'run.input.upstreamNotRun'
              : 'run.input.upstreamNoOutput',
            { port: port.name, node: label, handle: e.sourceHandle, status: status ?? '—' },
          ))
        }
      }

      const ctxApi: RunContextApi = {
        signal: ac.signal,
        workflowId: wf.id,
        workflowName: wf.name,
        log: (level, msg) => useRunContext.getState().appendLog(node.id, level, msg),
        reportConnector: (cid) => useRunContext.getState().reportNodeConnector(node.id, cid),
        reportCount: (value) => useRunContext.getState().setNodeCount(node.id, value),
        patchConfig: (partial) => {
          // Persiste une maj partielle de config (ex. ID du fichier créé) + autosave.
          const store = useWorkflowStore.getState()
          const cur = store.current?.nodes.find((n) => n.id === node.id)
          if (cur) {
            store.upsertNode({ ...cur, config: { ...(cur.config as Record<string, unknown>), ...partial } })
          }
        },
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

            // Exécution du body pour chaque item (les itérations restent séquentielles).
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

          // Interpolation des configs avec les inputs comme contexte
          // (permet {{Nom produit}} dans Send Gmail même hors loop).
          const ctx = buildInterpolationContext(inputs)
          const interpolatedConfig = interpolate(node.config, ctx)
          const result = (await spec.run(ctxApi, interpolatedConfig, inputs)) as Record<string, unknown>
          // Si Stop a été cliqué pendant l'exécution, ce node a été abandonné par la
          // boucle : ne pas réécrire son état (resté « arrêté »).
          if (ac.signal.aborted) return
          outputs.set(node.id, result ?? {})
          useRunContext.getState().setNodeOutputs(node.id, result ?? {})
          useRunContext.getState().endNode(node.id, 'success')
        } catch (err) {
          if (ac.signal.aborted) return
          const msg = err instanceof Error ? err.message : String(err)
          useRunContext.getState().endNode(node.id, 'error', msg)
        }
      }

      // Compose middleware chain (step mode pas-à-pas)
      const chain = (opts.middleware ?? []).reduceRight<() => Promise<void>>(
        (next, mw) => () => mw(node, next),
        exec
      )
      // Course node vs Stop : si l'utilisateur arrête pendant un appel réseau long
      // (LLM/scraping qui n'observent pas le signal), on abandonne l'attente du node
      // au lieu de bloquer jusqu'à sa fin naturelle. Le node orphelin se terminera en
      // arrière-plan sans réécrire l'état (cf. garde `ac.signal.aborted` dans exec).
      await Promise.race([chain(), abortedPromise])
      if (ac.signal.aborted) {
        const st = useRunContext.getState().nodeStates[node.id]
        if (!st || st.status === 'running' || st.status === 'pending') {
          useRunContext.getState().endNode(node.id, 'error', t('run.stopped'))
        }
      }
    }

    // Niveaux topo (cf. execute.ts) : un node ne démarre qu'une fois TOUS ses amonts
    // terminés ; les nodes d'un même niveau sont indépendants → lancés EN PARALLÈLE
    // (cap concurrence). C'est ce qui parallélise plusieurs scrapings frères, comme le
    // RUN SERVER. En step mode (un seul slot de pause), on force la séquentialité.
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
    const byLevel = new Map<number, WorkflowNode[]>()
    for (const node of ordered) {
      const lvl = levelOf.get(node.id) ?? 0
      const arr = byLevel.get(lvl) ?? byLevel.set(lvl, []).get(lvl)!
      arr.push(node)
    }
    const concurrency = (opts.middleware?.length ?? 0) > 0 ? 1 : MAX_NODE_CONCURRENCY
    for (const lvl of [...byLevel.keys()].sort((a, b) => a - b)) {
      await runConcurrent(byLevel.get(lvl)!, concurrency, runNode)
      // Stop : on arrête de lancer de nouveaux niveaux (les nodes en vol ont déjà été
      // marqués « arrêté » par la course ci-dessus ; l'aval reste « pending »).
      if (ac.signal.aborted) break
    }
  } finally {
    useRunContext.getState().endRun()
    useProgressStore.getState().end()
  }
  // Résumé calculé sur les SEULS nodes de ce run (sous-graphe si run partiel),
  // pour un message de fin fiable (≠ états résiduels d'un run précédent).
  const scopeIds = runSet ? [...runSet] : wf.nodes.map((n) => n.id)
  const states = useRunContext.getState().nodeStates
  const ran = scopeIds.map((id) => states[id]).filter(Boolean) as NodeRunState[]
  const errors = ran.filter((s) => s.status === 'error')
  const firstWarn = ran
    .filter((s) => s.status === 'success')
    .flatMap((s) => s.logs ?? [])
    .find((l) => l.level === 'warn')
  const okCount = ran.filter((s) => s.status === 'success').length

  // Persiste un snapshot durable du run (historique de l'écran Résultats). Non bloquant.
  const uid = getWorkspaceUid()
  if (uid && !ac.signal.aborted) {
    const status: RunStatus = errors.length === 0 ? 'success' : okCount > 0 ? 'partial' : 'error'
    void persistClientRun(uid, wf, { startedAt, status, nodeStates: states })
  }

  return {
    aborted: ac.signal.aborted,
    okCount,
    errorCount: errors.length,
    firstError: errors[0]?.error,
    firstWarn: firstWarn?.msg,
  }
}
