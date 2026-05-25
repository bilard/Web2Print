// src/features/telegram/executeWorkflowAndCollect.ts
// 2c : exécute un workflow via le moteur client puis récupère le 1er fichier produit (export)
// depuis le store de run. À n'appeler qu'en série (un run à la fois par onglet).
import { executeWorkflow } from '@/features/workflows/runtime/executor'
import { useRunContext } from '@/features/workflows/runtime/runContext'
import { findExportResult } from '@/features/workflows/runtime/exportResult'
import type { Workflow } from '@/features/workflows/types'

export interface ExecutionResult {
  nodeCount: number
  errorCount: number
  firstError?: string
  file?: { blob: Blob; filename: string }
}

export async function executeWorkflowAndCollect(wf: Workflow): Promise<ExecutionResult> {
  await executeWorkflow(wf)

  const states = Object.values(useRunContext.getState().nodeStates)
  const nodeCount = states.filter((s) => s.status === 'success').length
  const errored = states.filter((s) => s.status === 'error')
  const firstError = errored[0]?.error

  let file: { blob: Blob; filename: string } | undefined
  for (const s of states) {
    if (s.status !== 'success') continue
    const exp = findExportResult(s.outputs)
    if (!exp) continue
    try {
      const blob = await fetch(exp.url).then((r) => r.blob())
      file = { blob, filename: exp.filename }
    } finally {
      // Libère la blob: URL (le worker tourne longtemps — évite la fuite mémoire).
      URL.revokeObjectURL(exp.url)
    }
    break
  }

  return { nodeCount, errorCount: errored.length, firstError, file }
}
