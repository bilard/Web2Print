// src/features/workflows/runtime/executor.ts
import type { Workflow, WorkflowNode, RunContextApi } from '../types'
import { nodeRegistry } from '../registry'
import { topoSort } from './topo'
import { useRunContext } from './runContext'

export type Middleware = (
  node: WorkflowNode,
  next: () => Promise<void>
) => Promise<void>

export interface ExecuteOptions {
  middleware?: Middleware[]
}

export async function executeWorkflow(wf: Workflow, opts: ExecuteOptions = {}): Promise<void> {
  const ctxStore = useRunContext.getState()
  const ac = ctxStore.startRun()
  try {
    const ordered = topoSort(wf.nodes, wf.edges)
    const outputs = new Map<string, Record<string, unknown>>()
    const skipped = new Set<string>()

    for (const node of ordered) {
      // Skip if any upstream is skipped or errored
      const upstream = wf.edges.filter((e) => e.target === node.id)
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
      }

      const exec = async (): Promise<void> => {
        useRunContext.getState().startNode(node.id)
        try {
          const result = (await spec.run(ctxApi, node.config, inputs)) as Record<string, unknown>
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
  }
}
