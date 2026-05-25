// src/features/workflows/promptToFlow/usePromptToFlow.ts
import { useCallback, useState } from 'react'
import type { LLMProviderId } from '@/features/ai/llmRouter'
import { useWorkflowStore } from '../persistence/workflow.store'
import { generateWorkflow } from './generateWorkflow'
import { validateGraph } from './validateGraph'
import { layoutGraph } from './layoutGraph'
import type { ValidatedGraph } from './types'

type Phase = 'idle' | 'generating' | 'preview' | 'error'

export interface UsePromptToFlow {
  phase: Phase
  preview: ValidatedGraph | null
  error: string | null
  generate: (prompt: string, forceProvider?: LLMProviderId) => Promise<void>
  apply: () => boolean
  reset: () => void
}

export function usePromptToFlow(): UsePromptToFlow {
  const [phase, setPhase] = useState<Phase>('idle')
  const [preview, setPreview] = useState<ValidatedGraph | null>(null)
  const [error, setError] = useState<string | null>(null)

  const reset = useCallback(() => {
    setPhase('idle')
    setPreview(null)
    setError(null)
  }, [])

  const generate = useCallback(async (prompt: string, forceProvider?: LLMProviderId) => {
    setPhase('generating')
    setError(null)
    try {
      const raw = await generateWorkflow(prompt, { forceProvider })
      let validated = validateGraph(raw)
      const errs = validated.issues.filter((i) => i.level === 'error').map((i) => i.message)
      if (errs.length > 0) {
        const raw2 = await generateWorkflow(prompt, { forceProvider, repairIssues: errs })
        validated = validateGraph(raw2)
      }
      if (validated.nodes.length === 0) {
        setError('Aucun node valide généré. Reformule ta demande.')
        setPhase('error')
        return
      }
      const pos = layoutGraph(validated.nodes, validated.edges)
      validated.nodes.forEach((n) => { n.position = pos[n.id] ?? { x: 0, y: 0 } })
      setPreview(validated)
      setPhase('preview')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setPhase('error')
    }
  }, [])

  const apply = useCallback((): boolean => {
    if (!preview) return false
    const store = useWorkflowStore.getState()
    const cur = store.current
    if (cur && cur.nodes.length > 0) {
      const ok = window.confirm('Le workflow courant sera remplacé par le graphe généré. Continuer ?')
      if (!ok) return false
    }
    store.setNodes(preview.nodes)
    store.setEdges(preview.edges)
    if (preview.title) store.patch({ name: preview.title })
    reset()
    return true
  }, [preview, reset])

  return { phase, preview, error, generate, apply, reset }
}
