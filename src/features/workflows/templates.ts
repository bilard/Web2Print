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

/**
 * Modèle créé par l'utilisateur, persisté sous `users/{uid}/workflowTemplates`.
 * Étend WorkflowTemplate : `workflowFromTemplate()` l'instancie tel quel. La
 * config des nodes est capturée telle quelle (URLs/tokens compris) — privée au
 * user, donc pas de fuite : le but est de réutiliser son propre montage.
 */
export interface UserWorkflowTemplate extends WorkflowTemplate {
  ownerId: string
  createdAt: number
  updatedAt: number
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

/** Sites de démarrage : 3 concurrents PrestaShop éprouvés (moisson par pages liste
 *  validée en conditions réelles). Extensible aux autres PrestaShop motoculture
 *  (jardimax, matijardin, 123courroies, lames-tondeuses, 190cc, dppmsas,
 *  pieces-de-motoculture, progarden, net-motoculture, sodipieces,
 *  pieces-tracteur-tondeuse). Hors périmètre : marketplaces (Amazon, ManoMano,
 *  Cdiscount, Kramp) et sites anti-bot (autoportee-discount). */
const MOTO_COMPETITORS = [
  { domain: 'pro-motoculture.com', enabled: true },
  { domain: 'webmotoculture.com', enabled: true },
  { domain: 'emc-motoculture.com', enabled: true },
]

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
    id: 'price-watch-matrix',
    name: 'Veille tarifaire (matrice concurrents)',
    description:
      'Prend TES produits (page liste ou catalogue) et les compare chez plusieurs concurrents : ' +
      'appariement SKU/EAN puis nom, scrape du prix, et remplit le tableau de bord « Veille tarifaire » (suivi veille-1). ' +
      'Alerte Telegram seulement si un concurrent est moins cher ou a bougé.',
    emoji: '📊',
    nodes: [
      node('n0', 'cron', 80, 40, { enabled: false, every: 1, unit: 'day', atTime: '08:00', weekday: 1 }),
      node('n1', 'list-products', 80, 200, { urls: '', family: '', maxProducts: 40 }),
      node('n2', 'price-watch-track', 460, 200, {
        watchId: 'veille-1',
        thresholdPct: 0,
        sites: '',
        skuColumn: 'sku',
        eanColumn: 'ean',
        nameColumn: 'name',
        brandColumn: 'brand',
        priceColumn: 'price',
      }),
      node('n3', 'send-telegram', 840, 200, {
        botToken: '',
        chatId: '',
        text: '📊 Veille prix — {{message}}',
        parseMode: 'none',
        iterate: true,
      }),
    ],
    edges: [edge('n1', 'sheet', 'n2', 'products'), edge('n2', 'changes', 'n3', 'data')],
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
  {
    id: 'veille-tarifaire-motoculture',
    name: 'Veille tarifaire — concurrents motoculture',
    description:
      'Relève les prix/stock de tes produits chez les concurrents PrestaShop à partir de ta ' +
      'référence article et de ton EAN (sans URL). La liste des sites vit dans « Sites ' +
      'sources » (activation par site, moteur, stats) et alimente Moisson ET Comparer. ' +
      'ÉTAPE 1 : lance « Moisson concurrents » (une ou plusieurs fois) pour remplir ' +
      'l’index. ÉTAPE 2 : sélectionne ton Excel dans « Upload », puis lance la chaîne ' +
      'Upload → Comparer → Export. Marketplaces (Amazon, ManoMano, Cdiscount, Kramp) et ' +
      'sites protégés (autoportee-discount) non couverts par ce moissonneur.',
    emoji: '💶',
    nodes: [
      // Source unique des sites : émise vers Moisson ET Comparer (même watchId garanti).
      node('sites', 'source-sites', 60, 40, { watchId: '', sites: MOTO_COMPETITORS }),
      // Étape 1 — remplit l'index concurrent (indépendant, à lancer d'abord).
      node('harvest', 'harvest-competitor', 460, 40, {
        watchId: '',
        sites: '',
        families: 'COURROIES, FILTRATION, COUPE',
        pageBudget: 90,
      }),
      // Étape 2 — ton Excel → comparaison → export.
      node('upload', 'upload', 60, 320, { fileKey: '', fileName: '', fileSize: 0, mode: 'file' }),
      node('compare', 'compare-catalog', 460, 320, {
        watchId: '',
        sites: '',
        refColumn: 'CODE_ARTICLE', ref2Column: '', eanColumn: 'EAN',
        nameColumn: 'Name', familyColumn: 'Famille', priceColumn: 'Price BRUT',
        descriptionColumn: 'Description', vatRate: 20,
      }),
      node('export', 'export-excel', 860, 320, { columns: '' }),
    ],
    edges: [
      edge('sites', 'sites', 'harvest', 'sites'),
      edge('sites', 'sites', 'compare', 'sites'),
      // L'edge Moisson → Comparer ne transporte pas de donnée : il force la moisson à
      // tourner AVANT la comparaison dans un même lancement (sinon carnet vide → 0 ligne).
      edge('harvest', 'status', 'compare', 'harvest'),
      edge('upload', 'sheet', 'compare', 'products'),
      edge('compare', 'matrix', 'export', 'sheet'),
    ],
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

/**
 * Construit un modèle utilisateur depuis un workflow existant (capture nodes +
 * edges tels quels). `meta.id`/`meta.createdAt` fournis ⇒ mise à jour d'un modèle
 * existant (id/createdAt conservés) ; absents ⇒ nouveau modèle.
 */
export function templateFromWorkflow(
  wf: Workflow,
  meta: { id?: string; name: string; description: string; emoji: string; createdAt?: number },
  uid: string,
): UserWorkflowTemplate {
  const now = Date.now()
  return {
    id: meta.id ?? `wtpl_${now}_${Math.random().toString(36).slice(2, 8)}`,
    name: meta.name.trim() || wf.name || 'Mon modèle',
    description: meta.description.trim(),
    emoji: meta.emoji.trim() || '⭐',
    nodes: structuredClone(wf.nodes),
    edges: structuredClone(wf.edges),
    ownerId: uid,
    createdAt: meta.createdAt ?? now,
    updatedAt: now,
  }
}
