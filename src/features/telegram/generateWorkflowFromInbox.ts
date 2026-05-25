// src/features/telegram/generateWorkflowFromInbox.ts
// Orchestration 2b : depuis le texte d'un message Telegram, génère un workflow via le pipeline
// Prompt-to-Flow existant et le sauvegarde dans users/{uid}/workflows. Découplé de l'UI.
import { generateWorkflow } from '@/features/workflows/promptToFlow/generateWorkflow'
import { validateGraph } from '@/features/workflows/promptToFlow/validateGraph'
import { layoutGraph } from '@/features/workflows/promptToFlow/layoutGraph'
import { newWorkflow, saveWorkflow } from '@/features/workflows/persistence/workflowsApi'

export interface GeneratedWorkflowInfo {
  workflowId: string
  name: string
  nodeCount: number
}

export async function generateAndSaveWorkflow(
  text: string,
  uid: string,
): Promise<GeneratedWorkflowInfo> {
  const raw = await generateWorkflow(text)
  let validated = validateGraph(raw)

  // Une seule tentative de réparation : on réinjecte les erreurs au LLM.
  const errors = validated.issues.filter((i) => i.level === 'error').map((i) => i.message)
  if (errors.length > 0) {
    const repaired = await generateWorkflow(text, { repairIssues: errors })
    validated = validateGraph(repaired)
  }

  if (validated.nodes.length === 0) {
    throw new Error('aucun node généré — reformule ta demande plus précisément.')
  }

  const positions = layoutGraph(validated.nodes, validated.edges)
  validated.nodes.forEach((n) => {
    n.position = positions[n.id] ?? { x: 0, y: 0 }
  })

  const wf = newWorkflow(uid)
  wf.name = validated.title?.trim() || 'Workflow Telegram'
  wf.nodes = validated.nodes
  wf.edges = validated.edges
  await saveWorkflow(uid, wf)

  return { workflowId: wf.id, name: wf.name, nodeCount: wf.nodes.length }
}
