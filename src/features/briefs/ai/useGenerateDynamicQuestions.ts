import { useMutation, useQueryClient } from '@tanstack/react-query'
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore'
import { db } from '@/lib/firebase/config'
import { generateJson } from './geminiClient'
import {
  buildPrompt,
  RESPONSE_SCHEMA_FOR_GEMINI,
  DynamicQuestionsResponseSchema,
  VERSION,
} from './prompts/dynamicQuestions.prompt'
import type { Brief } from '@/features/briefs/types'
import type { Taxonomy } from '@/features/taxonomy/types'

interface Args {
  brief: Brief
  taxonomy: Taxonomy
}

/**
 * Génère les questions dynamiques pour un brief via Gemini, puis persiste
 * dynamicForm.questions / selectedNodeIds / aiVersions.questions sur le brief.
 */
export function useGenerateDynamicQuestions() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ brief, taxonomy }: Args) => {
      const nodes = Object.values(taxonomy.nodes).map((n) => ({
        id: n.id,
        label: n.label,
        parentId: n.parentId,
        level: n.level,
      }))
      const prompt = buildPrompt({
        clientValues: brief.client.values,
        nodes,
      })
      const result = await generateJson({
        prompt,
        schema: DynamicQuestionsResponseSchema,
        schemaForGemini: RESPONSE_SCHEMA_FOR_GEMINI,
        version: VERSION,
      })

      // Filtre les ids hallucinés
      const validIds = new Set(nodes.map((n) => n.id))
      const selectedNodeIds = result.selectedNodeIds.filter((id) => validIds.has(id))

      await updateDoc(doc(db, 'briefs', brief.id), {
        'dynamicForm.selectedNodeIds': selectedNodeIds,
        'dynamicForm.questions': result.questions,
        'dynamicForm.answers': brief.dynamicForm?.answers ?? {},
        'dynamicForm.aiReasoning': result.reasoning,
        'aiVersions.questions': VERSION,
        updatedAt: serverTimestamp(),
      })

      return { selectedNodeIds, questions: result.questions, reasoning: result.reasoning }
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ['brief', vars.brief.id] })
      qc.invalidateQueries({ queryKey: ['briefs'] })
    },
  })
}
