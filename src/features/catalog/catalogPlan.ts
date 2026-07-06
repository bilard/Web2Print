// Génération du plan de catalogue via prompt global (tâche LLM 'catalog.plan'),
// sanitisation stricte contre l'arbre réel, et plan par défaut déterministe
// (la génération ne doit JAMAIS être bloquée par un échec IA).
import { z } from 'zod'
import { generateJson } from '@/features/ai/llmRouter'
import { FONT_OPTIONS } from '@/features/retail-promo/RetailPromoCard'
import { CARD_OBJECT_IDS, CATALOG_GRIDS, DEFAULT_CARD_STYLE, type CardBox, type CardObjectId, type CatalogCardStyle, type CatalogGrid, type CatalogCharte, type CatalogPlan, type CatalogSectionPlan, type CatalogTreeNode } from './catalogTypes'
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
/** Couleurs des OBJETS des fiches pilotables par le prompt (sous-ensemble sûr de CatalogCardStyle). */
const ShapeSchema = z.object({
  corner: z.enum(['square', 'rounded', 'bevel']).optional(),
  chip: z.enum(['notch', 'band', 'underline', 'plain']).optional(),
  price: z.enum(['badge', 'bare', 'pill']).optional(),
  sticker: z.enum(['round', 'rect', 'star']).optional(),
  image: z.enum(['framed', 'overflow']).optional(),
  shadow: z.boolean().optional(),
}).optional()

const CardStyleAISchema = z.object({
  shape: ShapeSchema,
  cardBg: z.string().optional(),
  promoBg: z.string().optional(), stickerBg: z.string().optional(), priceBg: z.string().optional(),
  wasBg: z.string().optional(), kickerBg: z.string().optional(), nameColor: z.string().optional(),
  vedetteBg: z.string().optional(), vedettePriceBg: z.string().optional(),
  priceInk: z.string().optional(), vedettePriceInk: z.string().optional(),
  vedetteLabel: z.string().optional(),
  layout: z.record(z.string(), z.object({ x: z.number(), y: z.number(), w: z.number().optional(), h: z.number().optional() })).optional(),
}).optional()

// TOUT est optionnel : en MODIFICATION (un plan existe), l'IA ne renvoie que
// les clés que la demande impose de changer — le reste est conservé tel quel.
export const PlanSchema = z.object({
  theme: ThemeSchema.optional(),
  sections: z.array(SectionSchema).optional(),
  cover: z.object({ title: z.string(), subtitle: z.string().optional(), baseline: z.string().optional(), imagePrompt: z.string(), layout: z.enum(['classic', 'panel', 'poster']).optional() }).optional(),
  backCover: z.object({ title: z.string(), text: z.string() }).optional(),
  tocTitle: z.string().optional(),
  cardStyle: CardStyleAISchema,
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
        layout: { type: 'string', enum: ['classic', 'panel', 'poster'], description: "ARCHÉTYPE de composition : 'classic' = photo assombrie + textes bas-gauche · 'panel' = éditorial print (bande latérale sombre, grand panneau accent chevauchant la photo, bandeau infos bas) — choisis-le pour les inspirations maquettes/minimalistes · 'poster' = titre géant centré sur la photo" },
      },
      required: ['title', 'imagePrompt'],
    },
    backCover: {
      type: 'object',
      properties: { title: { type: 'string' }, text: { type: 'string', description: "texte de 4e de couverture (contact, mentions, remerciement)" } },
      required: ['title', 'text'],
    },
    tocTitle: { type: 'string' },
    cardStyle: {
      type: 'object',
      description: "OPTIONNEL — style des fiches produit (hex #rrggbb). En CRÉATION : renvoie une palette VARIÉE coordonnée au thème (jamais monochrome). En MODIFICATION : uniquement les clés que la demande impose.",
      properties: {
        cardBg: { type: 'string', description: "hex du FOND des fiches produit — INDISPENSABLE pour un design SOMBRE (fond quasi-noir + textes clairs) ; omettre pour des fiches blanches" },
        shape: { type: 'object', description: "GRAMMAIRE DE FORMES des fiches — reproduis la STRUCTURE graphique du modèle, pas seulement ses couleurs", properties: {
          corner: { type: 'string', enum: ['square', 'rounded', 'bevel'], description: 'coins des fiches (bevel = coin bas-droit coupé, façon flyer)' },
          chip: { type: 'string', enum: ['notch', 'band', 'underline', 'plain'], description: 'pastille sous-famille (notch = chip à encoche coupée)' },
          price: { type: 'string', enum: ['badge', 'bare', 'pill'], description: 'bare = prix en TEXTE bold sans badge (minimaliste) · pill = pastille arrondie' },
          sticker: { type: 'string', enum: ['round', 'rect', 'star'] },
          image: { type: 'string', enum: ['framed', 'overflow'], description: 'overflow = produit détouré AMPLIFIÉ qui déborde avec ombre portée' },
          shadow: { type: 'boolean', description: 'ombre portée des fiches' },
        } },
        promoBg: { type: 'string', description: 'hex cartouche promo' },
        stickerBg: { type: 'string', description: 'hex sticker de remise' },
        priceBg: { type: 'string', description: 'hex badge prix (toutes fiches)' },
        wasBg: { type: 'string', description: 'hex bloc prix barré' },
        kickerBg: { type: 'string', description: 'hex pastille sous-famille' },
        nameColor: { type: 'string', description: 'hex du nom produit' },
        vedetteBg: { type: 'string', description: 'hex ruban + cadre des fiches VEDETTE' },
        vedettePriceBg: { type: 'string', description: 'hex badge prix des fiches VEDETTE uniquement' },
        priceInk: { type: 'string', description: 'hex TEXTE des badges prix (toutes fiches)' },
        vedettePriceInk: { type: 'string', description: 'hex TEXTE du prix des fiches VEDETTE uniquement' },
        vedetteLabel: { type: 'string', description: 'texte du ruban vedette (ex. « Coup de cœur »)' },
        layout: { type: 'object', description: 'OPTIONNEL — position/taille en % (0-100) par objet ; ne renvoyer QUE si la demande porte sur le placement. Objets: promo, image, sticker, kicker, vedette, brand, name, description, ref, unit, price, details. Chaque valeur = { x, y, w?, h? } en %', additionalProperties: { type: 'object', properties: { x: { type: 'number' }, y: { type: 'number' }, w: { type: 'number' }, h: { type: 'number' } } } },
      },
    },
  },
  required: [],
}

const DEFAULT_GRID: CatalogGrid = 4

/** Thème neutre de repli — aussi source des fallbacks hex de `sanitizeTheme`. */
const DEFAULT_THEME = {
  accent: '#6366f1', pageBg: '#ffffff', ink: '#111827',
  headerBg: '#111827', headerInk: '#ffffff', fontHeading: 'Archivo', fontBody: 'Inter',
} as const

const HEX_RE = /^#[0-9a-f]{6}$/i

type RawTheme = NonNullable<RawCatalogPlan['theme']>

/** Valide chaque couleur du thème IA (hex strict `#rrggbb`) ; invalide → repli thème par défaut. */
function sanitizeTheme(theme: RawTheme): RawTheme {
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

/** Couleurs IA validées (hex strict) + texte du ruban borné — ignore tout le reste. */
function sanitizeAICardStyle(raw: RawCatalogPlan['cardStyle']): Partial<CatalogCardStyle> {
  if (!raw) return {}
  const out: Partial<CatalogCardStyle> = {}
  const HEX_KEYS = ['cardBg', 'promoBg', 'stickerBg', 'priceBg', 'wasBg', 'kickerBg', 'nameColor', 'vedetteBg', 'vedettePriceBg', 'priceInk', 'vedettePriceInk'] as const
  for (const k of HEX_KEYS) {
    const v = raw[k]
    if (v && HEX_RE.test(v)) out[k] = v
  }
  if (raw.vedetteLabel?.trim()) out.vedetteLabel = raw.vedetteLabel.trim().slice(0, 24)
  if (raw.shape && typeof raw.shape === 'object') {
    const sh = raw.shape
    const pick = <T extends string>(v: unknown, allowed: readonly T[]): T | undefined =>
      typeof v === 'string' && (allowed as readonly string[]).includes(v) ? (v as T) : undefined
    const shape = {
      corner: pick(sh.corner, ['square', 'rounded', 'bevel'] as const),
      chip: pick(sh.chip, ['notch', 'band', 'underline', 'plain'] as const),
      price: pick(sh.price, ['badge', 'bare', 'pill'] as const),
      sticker: pick(sh.sticker, ['round', 'rect', 'star'] as const),
      image: pick(sh.image, ['framed', 'overflow'] as const),
      ...(typeof sh.shadow === 'boolean' ? { shadow: sh.shadow } : {}),
    }
    const clean = Object.fromEntries(Object.entries(shape).filter(([, v]) => v !== undefined))
    if (Object.keys(clean).length) out.shape = clean
  }
  const rawLayout = (raw as { layout?: unknown })
  if (rawLayout.layout && typeof rawLayout.layout === 'object') {
    const num = (v: unknown, lo: number, hi: number): number | undefined =>
      typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : undefined
    const layout: Partial<Record<CardObjectId, CardBox>> = {}
    for (const id of CARD_OBJECT_IDS) {
      const b = (rawLayout.layout as Record<string, { x?: unknown; y?: unknown; w?: unknown; h?: unknown }>)[id]
      if (!b) continue
      const x = num(b.x, 0, 100), y = num(b.y, 0, 100)
      if (x == null || y == null) continue
      const box: CardBox = { x, y }
      const w = num(b.w, 4, 100); if (w != null) box.w = w
      const h = num(b.h, 4, 100); if (h != null) box.h = h
      const sc = num((b as { sc?: unknown }).sc, 0.2, 10); if (sc != null) box.sc = sc
      const m = (b as { m?: unknown }).m; if (typeof m === 'boolean') box.m = m
      const ax = (b as { ax?: unknown }).ax; if (ax === 'l' || ax === 'c' || ax === 'r') box.ax = ax
      const ay = (b as { ay?: unknown }).ay; if (ay === 't' || ay === 'c' || ay === 'b') box.ay = ay
      const link = (b as { link?: unknown }).link
      if (typeof link === 'string' && link !== id && (CARD_OBJECT_IDS as readonly string[]).includes(link)) box.link = link as CardObjectId
      else if (link === null) box.link = null // « délié » explicite : masque le lien PAR DÉFAUT (doit survivre)
      const lx = num((b as { lx?: unknown }).lx, -100, 100); if (lx != null) box.lx = lx
      const ly = num((b as { ly?: unknown }).ly, -100, 100); if (ly != null) box.ly = ly
      layout[id] = box
    }
    if (Object.keys(layout).length) out.layout = layout
  }
  return out
}

/**
 * Valide le plan IA contre l'arbre réel : grilles clampées, ids inconnus filtrés,
 * sections manquantes complétées. `current` = plan AVANT régénération : les
 * réglages manuels (style des fiches, fonds de page, couleurs de chapitres,
 * modèle appliqué) sont PRÉSERVÉS — l'IA ne remplace que ce qu'elle renvoie.
 */
export function sanitizeCatalogPlan(raw: RawCatalogPlan, tree: CatalogTreeNode[], catalogName: string, current?: CatalogPlan | null): CatalogPlan {
  const valid = nodesWithProducts(tree)
  const productsByNode = new Map(valid.map((n) => [n.id, new Set(n.productIds)]))
  // sections ABSENTES de la réponse IA (modification ciblée) → celles du plan
  // courant, intactes (densité aléatoire, vedettes, couleurs de chapitre).
  const sections: CatalogSectionPlan[] = raw.sections
    ? raw.sections
      .filter((s) => productsByNode.has(s.nodeId))
      .map((s) => ({
        nodeId: s.nodeId,
        productsPerPage: clampGrid(s.productsPerPage),
        randomDensity: false,
        featuredIds: (s.featuredIds ?? []).filter((id) => productsByNode.get(s.nodeId)!.has(id)),
      }))
    : (current?.sections ?? []).filter((s) => productsByNode.has(s.nodeId)).map((s) => ({ ...s }))
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
  // Couleurs de chapitre choisies manuellement : recopiées sur les sections régénérées.
  if (current) {
    const prevColor = new Map(current.sections.filter((s) => s.color).map((s) => [s.nodeId, s.color as string]))
    for (const s of sections) {
      const color = prevColor.get(s.nodeId)
      if (color) s.color = color
    }
  }
  const aiCardStyle = sanitizeAICardStyle(raw.cardStyle)
  const theme = raw.theme ? sanitizeTheme(raw.theme) : { ...(current?.theme ?? DEFAULT_THEME) }
  // ── GARDE-FOUS DE CONTRASTE (déterministes) : une inspiration SOMBRE faisait
  // renvoyer des textes clairs sur nos fiches blanches → nom/description
  // INVISIBLES. Règles : 1) encre illisible sur le fond EFFECTIF des fiches →
  // les fiches adoptent le fond sombre du thème (design dark cohérent), sinon
  // l'encre retombe au défaut ; 2) toute couleur de texte trop proche de son
  // fond est REJETÉE (héritage du template, toujours lisible).
  const lumOf = (hex: string): number => {
    const r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16)
    return (0.299 * r + 0.587 * g + 0.114 * b) / 255
  }
  const contrast = (a: string, b: string) => Math.abs(lumOf(a) - lumOf(b))
  let effCardBg = aiCardStyle.cardBg || current?.cardStyle?.cardBg || '#ffffff'
  if (contrast(theme.ink, effCardBg) < 0.35) {
    if (lumOf(theme.pageBg) < 0.4) { aiCardStyle.cardBg = theme.pageBg; effCardBg = theme.pageBg }
    else if (lumOf(effCardBg) > 0.6) theme.ink = DEFAULT_THEME.ink
    else {
      // Fiches SOMBRES demandées mais encre SOMBRE aussi (page claire) : on
      // annule le fond sombre — fiches blanches + encre sombre, toujours lisible.
      aiCardStyle.cardBg = ''
      effCardBg = '#ffffff'
      if (contrast(theme.ink, effCardBg) < 0.35) theme.ink = DEFAULT_THEME.ink
    }
  }
  // Seuils calibrés : blanc-sur-blanc ≈ 0,02 · gris clair sur blanc ≈ 0,13 (rejetés) ;
  // or sur orange ≈ 0,23 = contraste de TEINTE légitime (accepté pour les badges).
  if (aiCardStyle.nameColor && contrast(aiCardStyle.nameColor, effCardBg) < 0.22) delete aiCardStyle.nameColor
  for (const [ink, bgKey, fallbackBg] of [['priceInk', 'priceBg', theme.accent], ['vedettePriceInk', 'vedettePriceBg', theme.accent]] as const) {
    const bg = aiCardStyle[bgKey] || current?.cardStyle?.[bgKey] || fallbackBg
    if (aiCardStyle[ink] && contrast(aiCardStyle[ink]!, bg) < 0.18) delete aiCardStyle[ink]
  }
  // Badges à fond CLAIR sans encre définie : leur texte par défaut est BLANC
  // (invisible) → encre sombre posée automatiquement.
  for (const [bgKey, inkKey] of [['stickerBg', 'stickerInk'], ['promoBg', 'promoInk'], ['priceBg', 'priceInk'], ['wasBg', 'wasInk'], ['kickerBg', 'kickerInk'], ['vedettePriceBg', 'vedettePriceInk']] as const) {
    const bg = aiCardStyle[bgKey] || current?.cardStyle?.[bgKey]
    if (bg && lumOf(bg) > 0.72 && !aiCardStyle[inkKey] && !current?.cardStyle?.[inkKey]) aiCardStyle[inkKey] = '#111111'
  }
  const hasCardStyle = current?.cardStyle || Object.keys(aiCardStyle).length > 0
  return {
    // Clés omises par l'IA (modification ciblée) : on conserve le plan courant.
    theme,
    sizeByPrice: current?.sizeByPrice ?? true,
    sections,
    cover: raw.cover
      ? { title: raw.cover.title || catalogName, subtitle: raw.cover.subtitle ?? '', baseline: raw.cover.baseline ?? '', imagePrompt: raw.cover.imagePrompt, layout: raw.cover.layout ?? current?.cover.layout ?? 'classic' }
      : (current?.cover ?? { title: catalogName || 'Catalogue', subtitle: '', baseline: '', imagePrompt: '' }),
    backCover: raw.backCover ?? current?.backCover ?? { title: catalogName || 'Catalogue', text: '' },
    tocTitle: raw.tocTitle || current?.tocTitle || 'Sommaire',
    // Réglages manuels préservés ; les couleurs demandées au prompt s'appliquent par-dessus.
    ...(hasCardStyle ? { cardStyle: { ...DEFAULT_CARD_STYLE, ...current?.cardStyle, ...aiCardStyle } } : {}),
    ...(current?.pageStyle ? { pageStyle: current.pageStyle } : {}),
    ...(current?.appliedTemplate ? { appliedTemplate: current.appliedTemplate } : {}),
  }
}

export interface CatalogPlanContext {
  catalogName: string
  tree: CatalogTreeNode[]
  /** nodeId → jusqu'à 3 « id — nom produit » (pour le choix des vedettes). */
  sampleNames: Record<string, string[]>
  /** Charte extraite des éléments joints (palette/typos/consignes) — PRIME sur le brief pour le graphique. */
  charte?: CatalogCharte | null
}

/** Appelle l'IA (cascade + retry Zod gérés par llmRouter). L'appelant gère le repli defaultCatalogPlan. */
export async function generateCatalogPlan(brief: string, ctx: CatalogPlanContext, current?: CatalogPlan | null): Promise<CatalogPlan> {
  const treeDesc = flattenTree(ctx.tree)
    .map((n) => {
      const samples = ctx.sampleNames[n.id]?.length ? ` — ex. ${ctx.sampleNames[n.id].join(' ; ')}` : ''
      return `${'  '.repeat(n.level - 1)}- [${n.id}] ${n.label} (${n.productIds.length} produits)${samples}`
    })
    .join('\n')
  // Anti-MONOCHROME : sans cette règle, l'IA recopie l'accent sur tous les
  // objets des fiches (cartouche = sticker = prix = vedette) → pages ternes.
  const antiMono =
    `RÈGLE COULEURS : palette RICHE et coordonnée, JAMAIS monochrome — l'accent ne doit pas être recopié à l'identique sur tous les objets. ` +
    `Quand tu renvoies cardStyle, utilise AU MOINS 3 teintes distinctes : cartouche promo, sticker remise, badge prix et vedette dans des couleurs DIFFÉRENTES mais harmonieuses (complémentaires/contrastées) ; prix barré et pastille sous-famille plus sombres/neutres ; texte des prix lisible sur son fond. ` +
    `COHÉRENCE SOMBRE : pour un design/inspiration SOMBRE, renvoie cardStyle.cardBg sombre assorti au pageBg et des textes clairs — ne mets JAMAIS un texte clair sans avoir posé le fond sombre correspondant.`
  // CRÉATION (pas de plan) : plan complet. MODIFICATION (un plan existe) :
  // l'IA ne renvoie QUE les clés que la demande impose — tout omis = conservé.
  const consigne = current
    ? `Un plan EXISTE DÉJÀ : ta réponse est une MODIFICATION CIBLÉE. Renvoie UNIQUEMENT les clés que la demande impose de changer ` +
      `(ex. demande sur la couleur des prix/vedettes → cardStyle SEUL ; demande sur l'ambiance/les couleurs générales → theme). ` +
      `OMETS complètement theme, sections, cover, backCover, tocTitle et cardStyle s'ils ne sont pas concernés — ils seront conservés tels quels. ` +
      `Rappels : theme = polices STRICTEMENT parmi ${FONT_OPTIONS.join(', ')} ; sections = densité parmi ${CATALOG_GRIDS.join('/')} sur les nœuds de NIVEAU 1, vedettes = ids AVANT le tiret des exemples ; ` +
      `cardStyle = uniquement les clés concernées (hex #rrggbb). Si tu changes des couleurs : ${antiMono}`
    : `Produis un plan complet : thème (couleurs hex cohérentes avec la demande, polices STRICTEMENT parmi ${FONT_OPTIONS.join(', ')}), ` +
      `une section par nodeId — la densité (productsPerPage parmi ${CATALOG_GRIDS.join('/')}) ne compte que sur les nœuds de NIVEAU 1 (flux continu : les produits des sous-familles remplissent les pages sans vide) : choisis DENSE (4 à 8/page), jamais 1-2 sauf univers premium très court. 0-2 produits vedette par section ` +
      `choisis parmi les exemples (renvoie l'id AVANT le tiret), textes de couverture et 4e de couverture en FRANÇAIS, ` +
      `et un imagePrompt de couverture en anglais (photo réaliste, sans texte). ` +
      `Renvoie AUSSI cardStyle avec des couleurs d'objets VARIÉES coordonnées au thème. ${antiMono}`
  const raw = await generateJson<RawCatalogPlan>({
    task: 'catalog.plan',
    version: 'catalog.plan.v3',
    prompt:
      `Tu conçois l'identité graphique d'un CATALOGUE PRODUIT professionnel multi-page (style prospectus/catalogue retail, lumineux, lisible — jamais sombre/cinématique).\n` +
      `Nom du catalogue : « ${ctx.catalogName} ».\n` +
      `Structure (nodeId entre crochets — à réutiliser tel quel) :\n${treeDesc}\n\n` +
      // CHARTE (moteur créatif) : extraite des éléments JOINTS par l'utilisateur —
      // elle PRIME sur les goûts du modèle pour les couleurs/typos du thème.
      (ctx.charte && (ctx.charte.colors.length || ctx.charte.fonts.length || ctx.charte.notes)
        ? `CHARTE GRAPHIQUE DE LA MARQUE (extraite des éléments joints — À RESPECTER en PRIORITÉ pour theme et cardStyle) :\n` +
          (ctx.charte.colors.length ? `- Palette imposée : ${ctx.charte.colors.join(', ')} (répartis-la : accent, bandeaux, badges — reste DANS ces teintes ou leurs nuances proches).\n` : '') +
          (ctx.charte.fonts.length ? `- Typographies de la marque : ${ctx.charte.fonts.join(', ')} (choisis les polices du thème PARMI ${FONT_OPTIONS.join(', ')} en te rapprochant LE PLUS de ces familles).\n` : '') +
          (ctx.charte.notes ? `- Consignes créa (graphique & structure) : ${ctx.charte.notes}\n` : '') +
          `- STRUCTURE : si les consignes décrivent une composition (couverture éditoriale, fiches en LISTE 1 colonne, densité), APPLIQUE-les : cover.layout ('panel' maquette éditoriale, 'poster' visuel plein cadre), productsPerPage 2-3 = LISTE pleine largeur, 4-8 = grille. Si un ARCHÉTYPE COUVERTURE est imposé, renvoie OBLIGATOIREMENT l'objet cover complet (title, imagePrompt, layout).\n` +
          `- COMPOSITION DES FICHES : reproduis la maquette AVEC les leviers : cardStyle.cardBg (fond des FICHES — jaune/sombre si le modèle le veut), theme.pageBg (fond de PAGE, noir si le modèle est dark), kickerBg (pastille type chip), cardStyle.shape (coins/chips/prix/sticker/image/ombre — la STRUCTURE graphique) et cardStyle.layout (positions % des blocs) pour rapprocher la maquette du modèle — ose des placements différents du gabarit par défaut.\n` + '\n'
        : '') +
      `${consigne}\n\nDemande : ${brief}`,
    schema: PlanSchema,
    schemaForLLM: SCHEMA_FOR_LLM,
  })
  return sanitizeCatalogPlan(raw, ctx.tree, ctx.catalogName, current)
}
