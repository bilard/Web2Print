// Génération du plan de catalogue via prompt global (tâche LLM 'catalog.plan'),
// sanitisation stricte contre l'arbre réel, et plan par défaut déterministe
// (la génération ne doit JAMAIS être bloquée par un échec IA).
import { z } from 'zod'
import { generateJson } from '@/features/ai/llmRouter'
import { FONT_OPTIONS } from '@/features/retail-promo/RetailPromoCard'
import { CATALOG_GRIDS, type CatalogGrid, type CatalogPlan, type CatalogTreeNode } from './catalogTypes'
import { flattenTree, subtreeProductCount } from './catalogTree'

const ThemeSchema = z.object({
  accent: z.string(), pageBg: z.string(), ink: z.string(),
  headerBg: z.string(), headerInk: z.string(),
  fontHeading: z.enum(FONT_OPTIONS), fontBody: z.enum(FONT_OPTIONS),
})
const SectionSchema = z.object({
  nodeId: z.string(),
  productsPerPage: z.number(),
  featuredIds: z.array(z.string()).optional(),
})
const PlanSchema = z.object({
  theme: ThemeSchema,
  sections: z.array(SectionSchema),
  cover: z.object({ title: z.string(), subtitle: z.string().optional(), baseline: z.string().optional(), imagePrompt: z.string() }),
  backCover: z.object({ title: z.string(), text: z.string() }),
  tocTitle: z.string(),
})
export type RawCatalogPlan = z.infer<typeof PlanSchema>

const SCHEMA_FOR_LLM: Record<string, unknown> = {
  type: 'object',
  properties: {
    theme: {
      type: 'object',
      description: 'identité graphique du catalogue, déclinée sur toutes les pages',
      properties: {
        accent: { type: 'string', description: "hex couleur d'accent (prix, filets, badges)" },
        pageBg: { type: 'string', description: 'hex fond de page (clair pour un catalogue print)' },
        ink: { type: 'string', description: 'hex texte principal' },
        headerBg: { type: 'string', description: 'hex bandeau header/footer' },
        headerInk: { type: 'string', description: 'hex texte du bandeau' },
        fontHeading: { type: 'string', enum: [...FONT_OPTIONS] },
        fontBody: { type: 'string', enum: [...FONT_OPTIONS] },
      },
      required: ['accent', 'pageBg', 'ink', 'headerBg', 'headerInk', 'fontHeading', 'fontBody'],
    },
    sections: {
      type: 'array',
      description: "densité de grille : seul productsPerPage des nœuds de NIVEAU 1 (univers) compte — le flux est continu, les sous-familles s'enchaînent sans page à moitié vide. Choisis dense : 4/page standard, 6-8/page pour les grandes gammes ; 1-2/page UNIQUEMENT pour un univers premium très court. featuredIds se règle sur n'importe quel nœud.",
      items: {
        type: 'object',
        properties: {
          nodeId: { type: 'string' },
          productsPerPage: { type: 'number', enum: [...CATALOG_GRIDS] },
          featuredIds: { type: 'array', items: { type: 'string' }, description: 'ids produits vedette (grande carte 2×2 mise en avant AU SEIN de la page), choisis parmi les exemples fournis, 0-2 par section' },
        },
        required: ['nodeId', 'productsPerPage'],
      },
    },
    cover: {
      type: 'object',
      properties: {
        title: { type: 'string' }, subtitle: { type: 'string' }, baseline: { type: 'string' },
        imagePrompt: { type: 'string', description: 'prompt EN ANGLAIS pour générer le visuel de couverture (photo réaliste, sans texte incrusté)' },
      },
      required: ['title', 'imagePrompt'],
    },
    backCover: {
      type: 'object',
      properties: { title: { type: 'string' }, text: { type: 'string', description: "texte de 4e de couverture (contact, mentions, remerciement)" } },
      required: ['title', 'text'],
    },
    tocTitle: { type: 'string' },
  },
  required: ['theme', 'sections', 'cover', 'backCover', 'tocTitle'],
}

const DEFAULT_GRID: CatalogGrid = 4

/** Thème neutre de repli — aussi source des fallbacks hex de `sanitizeTheme`. */
const DEFAULT_THEME = {
  accent: '#6366f1', pageBg: '#ffffff', ink: '#111827',
  headerBg: '#111827', headerInk: '#ffffff', fontHeading: 'Archivo', fontBody: 'Inter',
} as const

const HEX_RE = /^#[0-9a-f]{6}$/i

/** Valide chaque couleur du thème IA (hex strict `#rrggbb`) ; invalide → repli thème par défaut. */
function sanitizeTheme(theme: RawCatalogPlan['theme']): RawCatalogPlan['theme'] {
  const hex = (v: string, fallback: string) => (HEX_RE.test(v) ? v : fallback)
  return {
    ...theme,
    accent: hex(theme.accent, DEFAULT_THEME.accent),
    pageBg: hex(theme.pageBg, DEFAULT_THEME.pageBg),
    ink: hex(theme.ink, DEFAULT_THEME.ink),
    headerBg: hex(theme.headerBg, DEFAULT_THEME.headerBg),
    headerInk: hex(theme.headerInk, DEFAULT_THEME.headerInk),
  }
}

function clampGrid(n: number): CatalogGrid {
  let best: CatalogGrid = DEFAULT_GRID
  let diff = Infinity
  for (const g of CATALOG_GRIDS) {
    const d = Math.abs(g - n)
    if (d < diff) { diff = d; best = g }
  }
  return best
}

/**
 * Nœuds méritant une section : leur SOUS-ARBRE contient des produits. Un univers
 * dont les produits sont tous dans les sous-familles doit avoir sa section (c'est
 * elle qui porte la densité de grille du flux continu).
 */
function nodesWithProducts(tree: CatalogTreeNode[]): CatalogTreeNode[] {
  return flattenTree(tree).filter((n) => subtreeProductCount(n) > 0)
}

/** Plan neutre déterministe : repli si l'IA échoue, base avant première génération. */
export function defaultCatalogPlan(tree: CatalogTreeNode[], catalogName: string): CatalogPlan {
  return {
    theme: { ...DEFAULT_THEME },
    sizeByPrice: true,
    sections: nodesWithProducts(tree).map((n) => ({ nodeId: n.id, productsPerPage: DEFAULT_GRID, randomDensity: false, featuredIds: [] })),
    cover: { title: catalogName || 'Catalogue', subtitle: '', baseline: '', imagePrompt: '' },
    backCover: { title: catalogName || 'Catalogue', text: '' },
    tocTitle: 'Sommaire',
  }
}

/** Valide le plan IA contre l'arbre réel : grilles clampées, ids inconnus filtrés, sections manquantes complétées. */
export function sanitizeCatalogPlan(raw: RawCatalogPlan, tree: CatalogTreeNode[], catalogName: string): CatalogPlan {
  const valid = nodesWithProducts(tree)
  const productsByNode = new Map(valid.map((n) => [n.id, new Set(n.productIds)]))
  const sections = raw.sections
    .filter((s) => productsByNode.has(s.nodeId))
    .map((s) => ({
      nodeId: s.nodeId,
      productsPerPage: clampGrid(s.productsPerPage),
      randomDensity: false,
      featuredIds: (s.featuredIds ?? []).filter((id) => productsByNode.get(s.nodeId)!.has(id)),
    }))
  const covered = new Set(sections.map((s) => s.nodeId))
  for (const n of valid) {
    if (!covered.has(n.id)) sections.push({ nodeId: n.id, productsPerPage: DEFAULT_GRID, randomDensity: false, featuredIds: [] })
  }
  // Cap global : max 2 vedettes PAR UNIVERS (une vedette = une grande carte 2×2 ;
  // sans cap, 2 × N sections saturent les pages de grandes cartes).
  const sectionByNode = new Map(sections.map((s) => [s.nodeId, s]))
  for (const univers of tree) {
    let budget = 2
    for (const n of flattenTree([univers])) {
      const s = sectionByNode.get(n.id)
      if (!s || s.featuredIds.length === 0) continue
      const kept = s.featuredIds.slice(0, Math.max(0, budget))
      budget -= kept.length
      s.featuredIds = kept
    }
  }
  return {
    theme: sanitizeTheme(raw.theme),
    sizeByPrice: true,
    sections,
    cover: { title: raw.cover.title || catalogName, subtitle: raw.cover.subtitle ?? '', baseline: raw.cover.baseline ?? '', imagePrompt: raw.cover.imagePrompt },
    backCover: raw.backCover,
    tocTitle: raw.tocTitle || 'Sommaire',
  }
}

export interface CatalogPlanContext {
  catalogName: string
  tree: CatalogTreeNode[]
  /** nodeId → jusqu'à 3 « id — nom produit » (pour le choix des vedettes). */
  sampleNames: Record<string, string[]>
}

/** Appelle l'IA (cascade + retry Zod gérés par llmRouter). L'appelant gère le repli defaultCatalogPlan. */
export async function generateCatalogPlan(brief: string, ctx: CatalogPlanContext): Promise<CatalogPlan> {
  const treeDesc = flattenTree(ctx.tree)
    .map((n) => {
      const samples = ctx.sampleNames[n.id]?.length ? ` — ex. ${ctx.sampleNames[n.id].join(' ; ')}` : ''
      return `${'  '.repeat(n.level - 1)}- [${n.id}] ${n.label} (${n.productIds.length} produits)${samples}`
    })
    .join('\n')
  const raw = await generateJson<RawCatalogPlan>({
    task: 'catalog.plan',
    version: 'catalog.plan.v1',
    prompt:
      `Tu conçois l'identité graphique d'un CATALOGUE PRODUIT professionnel multi-page (style prospectus/catalogue retail, lumineux, lisible — jamais sombre/cinématique).\n` +
      `Nom du catalogue : « ${ctx.catalogName} ».\n` +
      `Structure (nodeId entre crochets — à réutiliser tel quel) :\n${treeDesc}\n\n` +
      `Produis un plan complet : thème (couleurs hex cohérentes avec la demande, polices STRICTEMENT parmi ${FONT_OPTIONS.join(', ')}), ` +
      `une section par nodeId — la densité (productsPerPage parmi ${CATALOG_GRIDS.join('/')}) ne compte que sur les nœuds de NIVEAU 1 (flux continu : les produits des sous-familles remplissent les pages sans vide) : choisis DENSE (4 à 8/page), jamais 1-2 sauf univers premium très court. 0-2 produits vedette par section ` +
      `choisis parmi les exemples (renvoie l'id AVANT le tiret), textes de couverture et 4e de couverture en FRANÇAIS, ` +
      `et un imagePrompt de couverture en anglais (photo réaliste, sans texte).\n\nDemande : ${brief}`,
    schema: PlanSchema,
    schemaForLLM: SCHEMA_FOR_LLM,
  })
  return sanitizeCatalogPlan(raw, ctx.tree, ctx.catalogName)
}
