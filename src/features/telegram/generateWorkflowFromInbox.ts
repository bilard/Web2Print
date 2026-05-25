// src/features/telegram/generateWorkflowFromInbox.ts
// Orchestration 2b : depuis le texte d'un message Telegram, génère un workflow via le pipeline
// Prompt-to-Flow existant et le sauvegarde dans users/{uid}/workflows. Découplé de l'UI.
import { generateWorkflow } from '@/features/workflows/promptToFlow/generateWorkflow'
import { validateGraph } from '@/features/workflows/promptToFlow/validateGraph'
import { layoutGraph } from '@/features/workflows/promptToFlow/layoutGraph'
import { newWorkflow, saveWorkflow } from '@/features/workflows/persistence/workflowsApi'
import type { Workflow } from '@/features/workflows/types'

export interface GeneratedWorkflowInfo {
  workflow: Workflow
  workflowId: string
  name: string
  nodeCount: number
}

// Contraintes propres à l'exécution automatique depuis Telegram (aucune interface). Les nodes
// qui exigent une sélection manuelle de fichier (upload / import-*) ne peuvent pas s'exécuter ;
// on oriente l'IA vers des sources autonomes.
const TELEGRAM_CONSTRAINTS = `

[Contexte : ce workflow sera exécuté AUTOMATIQUEMENT, sans aucune interface ni intervention humaine. Contraintes STRICTES :
- N'utilise JAMAIS de node "Upload" ni d'import de fichier (Parser Excel/CSV, Import IDML/SVG/PPTX, Importer une image) : ils exigent une sélection manuelle et échoueront.
- Pour les données d'entrée, utilise uniquement des sources autonomes : "Scrape URL" si la demande contient une URL, ou "Saisie texte" pour des données/contenu fournis dans la demande.
- Le workflow doit pouvoir s'exécuter de bout en bout sans aucune action de l'utilisateur.]`

export async function generateAndSaveWorkflow(
  text: string,
  uid: string,
): Promise<GeneratedWorkflowInfo> {
  const prompt = text + TELEGRAM_CONSTRAINTS
  const raw = await generateWorkflow(prompt)
  let validated = validateGraph(raw)

  // Une seule tentative de réparation : on réinjecte les erreurs au LLM.
  const errors = validated.issues.filter((i) => i.level === 'error').map((i) => i.message)
  if (errors.length > 0) {
    const repaired = await generateWorkflow(prompt, { repairIssues: errors })
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

  return { workflow: wf, workflowId: wf.id, name: wf.name, nodeCount: wf.nodes.length }
}

// Nodes qui exigent une sélection manuelle de fichier — non exécutables en mode automatique.
const MANUAL_FILE_NODE_TYPES = new Set([
  'upload',
  'import-csv',
  'import-idml',
  'import-svg',
  'import-pptx',
  'import-image',
])

/** true si le workflow contient un node nécessitant un fichier choisi à la main. */
export function requiresManualFile(wf: Workflow): boolean {
  return wf.nodes.some((n) => MANUAL_FILE_NODE_TYPES.has(n.type))
}
