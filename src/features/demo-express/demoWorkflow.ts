// src/features/demo-express/demoWorkflow.ts
// Workflow « Démo {Société} » ensemencé dans la liste du prospect : instancié
// depuis un template codé en dur (déterministe, contrairement à Prompt-to-Flow)
// avec les URLs produits réellement découvertes sur son site.
import type { Workflow, WorkflowNode, WorkflowEdge } from '@/features/workflows/types'
import { workflowFromTemplate, type WorkflowTemplate } from '@/features/workflows/templates'

export function buildDemoWorkflow(company: string, productUrls: string[], uid: string): Workflow {
  const urls = productUrls.slice(0, 3)
  const nodes: WorkflowNode[] = [
    {
      id: 'n1', type: 'scrape-url', position: { x: 80, y: 140 },
      config: { urls: urls.join('\n'), template: 'product_full', customFields: '' },
    },
    {
      id: 'n2', type: 'export-excel', position: { x: 460, y: 140 },
      config: { columns: '' },
    },
  ]
  const edges: WorkflowEdge[] = [
    { id: 'e_n1_sheet_n2_sheet', source: 'n1', sourceHandle: 'sheet', target: 'n2', targetHandle: 'sheet' },
  ]
  const template: WorkflowTemplate = {
    id: 'demo-express',
    name: `Démo ${company}`,
    description: `Généré par la Démo express : scrape ${urls.length} produit(s) du site de ${company} et exporte le résultat en Excel.`,
    emoji: '✨',
    nodes,
    edges,
  }
  return workflowFromTemplate(template, uid)
}
