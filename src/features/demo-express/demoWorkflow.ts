// src/features/demo-express/demoWorkflow.ts
// Workflow « Démo {Société} » ensemencé dans la liste du prospect : instancié
// depuis un template codé en dur (déterministe, contrairement à Prompt-to-Flow)
// avec les URLs produits réellement découvertes sur son site. Il rejoue TOUT le
// pipeline de la démo avec les cartes du module Workflow : scrape (Jina+LLM) →
// images dans le DAM Drive + exports Excel/Google Sheets → envoi Gmail, plus un
// cron désactivé prêt à planifier le tout côté serveur.
import type { Workflow, WorkflowNode, WorkflowEdge } from '@/features/workflows/types'
import { workflowFromTemplate, type WorkflowTemplate } from '@/features/workflows/templates'

export function buildDemoWorkflow(company: string, productUrls: string[], uid: string, email: string): Workflow {
  const urls = productUrls.slice(0, 3)
  const demoName = `Démo ${company}`
  const nodes: WorkflowNode[] = [
    {
      id: 'n0', type: 'cron', position: { x: 80, y: 20 },
      config: { enabled: false, every: 1, unit: 'day', atTime: '09:00', weekday: 1 },
    },
    {
      id: 'n1', type: 'scrape-url', position: { x: 80, y: 220 },
      config: { urls: urls.join('\n'), template: 'product_full', customFields: '' },
    },
    {
      id: 'n2', type: 'export-excel', position: { x: 460, y: 40 },
      config: { columns: '' },
    },
    {
      id: 'n3', type: 'gsheets-export', position: { x: 460, y: 220 },
      config: {
        name: demoName, folderName: '', parentFolderId: '', parentFolderName: '',
        mode: 'create', spreadsheetId: '', formulaColumns: '',
      },
    },
    {
      id: 'n4', type: 'save-dam', position: { x: 460, y: 420 },
      config: { folderName: demoName },
    },
    {
      // Couverture IA — même étape que la couverture Nano Banana du pipeline :
      // l'image générée rejoint les photos produit dans le dossier DAM démo
      // (fan-in : mergeInputValue concatène les deux tableaux d'assets).
      id: 'n6', type: 'generate-image', position: { x: 80, y: 460 },
      config: {
        prompt:
          `Couverture de catalogue produits pour ${company} : visuel professionnel et moderne ` +
          `inspiré de l'univers de la marque, sans aucun texte ni logo.`,
        count: 1, aspectRatio: '3:4',
      },
    },
    {
      id: 'n5', type: 'send-gmail', position: { x: 840, y: 220 },
      config: {
        to: email,
        subject: `${demoName} — vos produits scrapés`,
        body: `Bonjour,\n\nLe workflow « ${demoName} » vient de tourner : le Google Sheet des produits est joint à ce mail.\n\n— DesignStudio`,
        isHtml: false, iterate: false,
        attachmentMode: 'source', attachmentFilename: 'extract.csv',
        attachGSheet: true, attachBodyHtml: true,
      },
    },
  ]
  const edges: WorkflowEdge[] = [
    { id: 'e_n1_sheet_n2_sheet', source: 'n1', sourceHandle: 'sheet', target: 'n2', targetHandle: 'sheet' },
    { id: 'e_n1_sheet_n3_sheet', source: 'n1', sourceHandle: 'sheet', target: 'n3', targetHandle: 'sheet' },
    { id: 'e_n1_assets_n4_assets', source: 'n1', sourceHandle: 'assets', target: 'n4', targetHandle: 'assets' },
    { id: 'e_n3_result_n5_gsheet', source: 'n3', sourceHandle: 'result', target: 'n5', targetHandle: 'gsheet' },
    { id: 'e_n6_assets_n4_assets', source: 'n6', sourceHandle: 'assets', target: 'n4', targetHandle: 'assets' },
  ]
  const template: WorkflowTemplate = {
    id: 'demo-express',
    name: demoName,
    description:
      `Généré par la Démo express : scrape ${urls.length} produit(s) du site de ${company} ` +
      `(structure complète : prix, sous-titre, specs…), génère une couverture IA, dépose images ` +
      `et couverture dans le DAM Drive, exporte le résultat en Excel et Google Sheets puis envoie ` +
      `le Sheet par Gmail. Le cron (désactivé) permet de planifier le tout côté serveur.`,
    emoji: '✨',
    nodes,
    edges,
  }
  return workflowFromTemplate(template, uid)
}
