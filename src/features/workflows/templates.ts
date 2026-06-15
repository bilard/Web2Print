// src/features/workflows/templates.ts
// Galerie de recettes prêtes à l'emploi : chaque template instancie un workflow
// complet (nodes + edges + configs par défaut) que l'utilisateur n'a plus qu'à
// paramétrer (URLs, projet PIM…). Les connexions n'utilisent que des paires de
// ports compatibles (cf. runtime/ports.ts isCompatible).
import type { Workflow, WorkflowNode, WorkflowEdge } from './types'
import { CURRENT_SCHEMA_VERSION } from './persistence/migrations'

export interface WorkflowTemplate {
  id: string
  name: string
  description: string
  /** Émoji affiché sur la carte de la galerie. */
  emoji: string
  nodes: WorkflowNode[]
  edges: WorkflowEdge[]
}

const node = (id: string, type: string, x: number, y: number, config: unknown): WorkflowNode => ({
  id,
  type,
  position: { x, y },
  config,
})

const edge = (source: string, sourceHandle: string, target: string, targetHandle: string): WorkflowEdge => ({
  id: `e_${source}_${sourceHandle}_${target}_${targetHandle}`,
  source,
  sourceHandle,
  target,
  targetHandle,
})

export const WORKFLOW_TEMPLATES: WorkflowTemplate[] = [
  {
    id: 'scrape-to-pim',
    name: 'Scraper un site → PIM',
    description:
      'Scrape des fiches produit (URLs à coller) et enregistre les résultats dans un projet PIM.',
    emoji: '🛒',
    nodes: [
      node('n1', 'scrape-url', 80, 140, { urls: '', template: 'product_full', customFields: '' }),
      node('n2', 'save-pim', 460, 140, { projectId: '', sourceId: 'workflow-import' }),
    ],
    edges: [edge('n1', 'sheet', 'n2', 'sheet')],
  },
  {
    id: 'daily-watch-telegram',
    name: 'Veille quotidienne → Telegram',
    description:
      'Chaque matin (cron), scrape une liste d’URLs, enrichit les données et envoie le résumé sur Telegram.',
    emoji: '📡',
    nodes: [
      node('n0', 'cron', 80, 40, { enabled: false, every: 1, unit: 'day', atTime: '09:00', weekday: 1 }),
      node('n1', 'scrape-url', 80, 200, { urls: '', template: 'product_full', customFields: '' }),
      node('n2', 'enrichment', 460, 200, { urlColumn: 'url', fields: 'title,description,price' }),
      node('n3', 'send-telegram', 840, 200, {
        botToken: '',
        chatId: '',
        text: '📡 Veille du jour : {{title}}',
        parseMode: 'none',
        iterate: false,
      }),
    ],
    edges: [edge('n1', 'sheet', 'n2', 'sheet'), edge('n2', 'sheet', 'n3', 'data')],
  },
  {
    id: 'approval-gate-pim',
    name: 'Scrape → approbation ✅ → PIM',
    description:
      'Scrape des produits, demande une validation humaine sur Telegram (boutons ✅/❌), puis enregistre dans le PIM seulement si approuvé.',
    emoji: '🛂',
    nodes: [
      node('n1', 'scrape-url', 80, 140, { urls: '', template: 'product_full', customFields: '' }),
      node('n2', 'telegram-approval', 460, 140, {
        botToken: '',
        chatId: '',
        text: 'Valider l’import de ces produits dans le PIM ?',
        timeoutMin: 60,
        onTimeout: 'fail',
      }),
      node('n3', 'save-pim', 840, 100, { projectId: '', sourceId: 'workflow-import' }),
      node('n4', 'send-telegram', 840, 260, {
        botToken: '',
        chatId: '',
        text: '❌ Import refusé — aucune donnée enregistrée.',
        parseMode: 'none',
        iterate: false,
      }),
    ],
    edges: [
      edge('n1', 'sheet', 'n2', 'data'),
      edge('n2', 'approved', 'n3', 'sheet'),
      edge('n2', 'rejected', 'n4', 'data'),
    ],
  },
  {
    id: 'price-watch-telegram',
    name: 'Veille prix → alerte Telegram',
    description:
      'Re-scrape une liste d’URLs (cron), compare avec les prix mémorisés et alerte sur Telegram seulement si un prix a bougé.',
    emoji: '📉',
    nodes: [
      node('n0', 'cron', 80, 40, { enabled: false, every: 1, unit: 'day', atTime: '08:00', weekday: 1 }),
      node('n1', 'scrape-url', 80, 200, { urls: '', template: 'product_full', customFields: '' }),
      node('n2', 'price-watch', 460, 200, { watchId: 'veille-1', keyColumn: 'url', valueColumn: 'price', thresholdPct: 0 }),
      node('n3', 'send-telegram', 840, 200, {
        botToken: '',
        chatId: '',
        text: '📉 {{title}} : {{ancien_prix}} → {{nouveau_prix}} ({{variation_pct}} %)',
        parseMode: 'none',
        iterate: true,
      }),
    ],
    edges: [edge('n1', 'sheet', 'n2', 'sheet'), edge('n2', 'changes', 'n3', 'data')],
  },
  {
    id: 'price-compare-sites',
    name: 'Comparer mes prix aux concurrents → Excel',
    description:
      'Lit la page liste SOURCE (mes produits) et une ou plusieurs pages CONCURRENTES, apparie par ' +
      'EAN / code modèle / nom, et exporte un tableau : une ligne par produit source, prix par ' +
      'concurrent, écart et position. Source et concurrents acceptent aussi un import Excel/Sheets.',
    emoji: '⚖️',
    nodes: [
      node('n1', 'list-products', 60, 80, {
        urls: 'https://www.jardiland.com/c/tondeuse-a-gazon-electrique?f=brand_in_Ryobi',
        maxProducts: 40,
      }),
      node('n2', 'list-products', 60, 280, {
        urls: 'https://www.castorama.fr/search?Marque=Ryobi&term=tondeuse+electrique+batterie',
        maxProducts: 40,
      }),
      node('n3', 'compare-prices', 460, 160, {
        nameColumn: 'name', priceColumn: 'price', eanColumn: 'ean',
        referenceColumn: '', urlColumn: 'url', siteColumn: 'site', onlyMatched: false,
      }),
      node('n4', 'export-excel', 840, 160, { columns: '' }),
    ],
    edges: [
      edge('n1', 'sheet', 'n3', 'source'),
      edge('n2', 'sheet', 'n3', 'concurrents'),
      edge('n3', 'sheet', 'n4', 'sheet'),
    ],
  },
  {
    id: 'price-compare-daily-gsheets',
    name: 'Comparaison de prix quotidienne → Google Sheets',
    description:
      'Chaque jour (cron serveur), lit deux pages liste (source + cible), extrait les produits, ' +
      'les apparie par EAN et écrit le tableau comparatif dans un Google Sheet. ' +
      'Tourne en headless après connexion « Google — accès serveur » (Paramètres → Connecteurs).',
    emoji: '🗓️',
    nodes: [
      node('n0', 'cron', 60, 20, { enabled: false, every: 1, unit: 'day', atTime: '08:00', weekday: 1 }),
      node('n1', 'list-products', 60, 140, {
        urls: 'https://www.jardiland.com/c/tondeuse-a-gazon-electrique?f=brand_in_Ryobi',
        maxProducts: 25,
      }),
      node('n2', 'list-products', 60, 320, {
        urls: 'https://www.castorama.fr/search?Marque=Ryobi&term=tondeuse+electrique+batterie',
        maxProducts: 25,
      }),
      node('n3', 'compare-prices', 460, 220, {
        nameColumn: 'name', priceColumn: 'price', eanColumn: 'ean',
        referenceColumn: '', urlColumn: 'url', siteColumn: 'site', onlyMatched: false,
      }),
      node('n4', 'gsheets-export', 840, 220, {
        name: 'Comparaison prix Ryobi', parentFolderId: '', mode: 'create', spreadsheetId: '',
      }),
    ],
    edges: [
      edge('n1', 'sheet', 'n3', 'source'),
      edge('n2', 'sheet', 'n3', 'concurrents'),
      edge('n3', 'sheet', 'n4', 'sheet'),
    ],
  },
  {
    id: 'web-research-excel',
    name: 'Recherche web → Excel',
    description:
      'Recherche sur le web (Jina), lit les meilleures pages et exporte les résultats structurés en .xlsx.',
    emoji: '🔎',
    nodes: [
      node('n1', 'web-search', 80, 140, { query: '', maxResults: 5, readPages: 2 }),
      node('n2', 'export-excel', 460, 140, { columns: '' }),
    ],
    edges: [edge('n1', 'sheet', 'n2', 'sheet')],
  },
]

/** Instancie un workflow complet (ids/horodatage frais) depuis un template. */
export function workflowFromTemplate(template: WorkflowTemplate, uid: string): Workflow {
  const now = Date.now()
  return {
    id: `wf_${now}_${Math.random().toString(36).slice(2, 8)}`,
    schemaVersion: CURRENT_SCHEMA_VERSION,
    name: template.name,
    description: template.description,
    ownerId: uid,
    createdAt: now,
    updatedAt: now,
    // structuredClone : chaque instanciation doit avoir ses propres objets config.
    nodes: structuredClone(template.nodes),
    edges: structuredClone(template.edges),
  }
}
