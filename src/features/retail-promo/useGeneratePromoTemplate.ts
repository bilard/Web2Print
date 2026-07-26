import { z } from 'zod'
import { generateJson } from '@/features/ai/llmRouter'
import { FONT_OPTIONS, PROMO_LAYOUT_IDS, type PromoLayoutId, type PromoTemplateConfig, type PromoBlockId } from './promoCardTypes'
import { OPERATOR_LABELS, ACTION_LABELS, actionWithDefaults, type ConditionalRule, type RuleOperator, type RuleActionType } from '@/features/merge/conditionalRules'

const FontEnum = z.enum(FONT_OPTIONS)
const LayoutEnum = z.enum(PROMO_LAYOUT_IDS)
const OPERATORS = Object.keys(OPERATOR_LABELS) as [RuleOperator, ...RuleOperator[]]
const ACTIONS = Object.keys(ACTION_LABELS) as [RuleActionType, ...RuleActionType[]]
const BLOCKS = ['header', 'image', 'badge', 'price', 'category', 'name', 'brand', 'description', 'priceLabel', 'priceWas', 'unitPrice', 'priceNow', 'footer'] as const

// Ajustement fin d'un bloc dans la mise en page choisie (décalage px, échelle, masquage).
const AdjOut = z.object({
  block: z.enum(BLOCKS),
  dx: z.number().optional(),
  dy: z.number().optional(),
  scale: z.number().optional(),
  hidden: z.boolean().optional(),
})

// Règle conditionnelle générée par l'IA.
const RuleOut = z.object({
  block: z.enum(BLOCKS),
  field: z.string(),
  operator: z.enum(OPERATORS),
  value: z.string().optional(),
  actionType: z.enum(ACTIONS),
  color: z.string().optional(),
  opacity: z.number().optional(),
  scale: z.number().optional(),
})

const ResultSchema = z.object({
  // Mise en page (optionnel — si la demande concerne la STRUCTURE/disposition).
  layout: LayoutEnum.optional(),
  adjustments: z.array(AdjOut).optional(),
  // Habillage (optionnel — seulement si la demande concerne le style).
  accent: z.string().optional(),
  headerBg: z.string().optional(),
  fontHeading: FontEnum.optional(),
  fontPrice: FontEnum.optional(),
  colorCategory: z.string().optional(),
  colorName: z.string().optional(),
  colorDescription: z.string().optional(),
  colorPriceNow: z.string().optional(),
  colorPriceWas: z.string().optional(),
  colorFooter: z.string().optional(),
  showCategory: z.boolean().optional(),
  showDescription: z.boolean().optional(),
  showUnitPrice: z.boolean().optional(),
  showBadge: z.boolean().optional(),
  showFooter: z.boolean().optional(),
  // Règles conditionnelles (optionnel — si la demande décrit « si … alors … »).
  rules: z.array(RuleOut).optional(),
})
type Result = z.infer<typeof ResultSchema>

const SCHEMA_FOR_LLM: Record<string, unknown> = {
  type: 'object',
  properties: {
    layout: {
      type: 'string',
      enum: [...PROMO_LAYOUT_IDS],
      description: 'mise en page (STRUCTURE) : classique=en-tête/photo/bandeau prix empilés ; photo-cover=photo plein cadre avec bandeaux en surimpression ; prix-fort=grand bloc prix dominant en bas, chiffre géant ; minimal=fond blanc épuré avec filets accent (étiquette rayon). Ne renvoie ce champ QUE si la demande concerne la disposition/structure.',
    },
    adjustments: {
      type: 'array',
      description: 'ajustements fins par bloc DANS la mise en page choisie : décalage (dx/dy en px), échelle (scale), masquage (hidden).',
      items: {
        type: 'object',
        properties: {
          block: { type: 'string', enum: [...BLOCKS] },
          dx: { type: 'number' }, dy: { type: 'number' }, scale: { type: 'number' }, hidden: { type: 'boolean' },
        },
        required: ['block'],
      },
    },
    accent: { type: 'string', description: 'hex bandeau prix + badge (style seulement)' },
    headerBg: { type: 'string', description: 'hex bandeau en-tête + pied (style seulement)' },
    fontHeading: { type: 'string', enum: [...FONT_OPTIONS] },
    fontPrice: { type: 'string', enum: [...FONT_OPTIONS] },
    colorCategory: { type: 'string' }, colorName: { type: 'string' }, colorDescription: { type: 'string' },
    colorPriceNow: { type: 'string' }, colorPriceWas: { type: 'string' }, colorFooter: { type: 'string' },
    showCategory: { type: 'boolean' }, showDescription: { type: 'boolean' }, showUnitPrice: { type: 'boolean' },
    showBadge: { type: 'boolean' }, showFooter: { type: 'boolean' },
    rules: {
      type: 'array',
      description: 'Règles conditionnelles « si [champ] [opérateur] [valeur] alors [action] sur [bloc] ».',
      items: {
        type: 'object',
        properties: {
          block: { type: 'string', enum: [...BLOCKS], description: 'bloc cible : badge=badge remise, price=bandeau prix, header=bandeau en-tête, name=nom…' },
          field: { type: 'string', description: 'libellé EXACT de la colonne source testée' },
          operator: { type: 'string', enum: [...OPERATORS], description: 'eq=égal numérique, is=égal texte, gt/lt/gte/lte, contains…' },
          value: { type: 'string', description: 'valeur comparée (respecte le format des exemples de la colonne)' },
          actionType: { type: 'string', enum: [...ACTIONS], description: 'setColor=couleur (fond pour un bloc, texte sinon), hide, show, setOpacity, scale…' },
          color: { type: 'string', description: 'hex si actionType=setColor (ex #22c55e pour vert)' },
          opacity: { type: 'number' }, scale: { type: 'number' },
        },
        required: ['block', 'field', 'operator', 'actionType'],
      },
    },
  },
  required: [],
}

export interface PromoGenResult {
  style?: Partial<PromoTemplateConfig>
  rules?: Partial<Record<PromoBlockId, ConditionalRule[]>>
  layout?: PromoLayoutId
  adjustments?: {
    offsets: Partial<Record<PromoBlockId, { dx: number; dy: number }>>
    scales: Partial<Record<PromoBlockId, { sx: number; sy: number }>>
    hidden: Partial<Record<PromoBlockId, boolean>>
  }
}

const uid = () => (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `r${Math.round(performance.now() * 1000)}`)

function toResult(r: Result): PromoGenResult {
  const out: PromoGenResult = {}
  // Habillage : présent seulement si l'IA a renvoyé des champs de style.
  if (r.accent || r.headerBg || r.fontHeading || r.fontPrice) {
    const colors: PromoTemplateConfig['colors'] = {}
    if (r.colorCategory) colors.category = r.colorCategory
    if (r.colorName) colors.name = r.colorName
    if (r.colorDescription) colors.description = r.colorDescription
    if (r.colorPriceNow) colors.priceNow = r.colorPriceNow
    if (r.colorPriceWas) colors.priceWas = r.colorPriceWas
    if (r.colorFooter) colors.footer = r.colorFooter
    const style: Partial<PromoTemplateConfig> = { colors }
    if (r.accent) style.accent = r.accent
    if (r.headerBg) style.headerBg = r.headerBg
    if (r.fontHeading) style.fontHeading = r.fontHeading
    if (r.fontPrice) style.fontPrice = r.fontPrice
    for (const k of ['showCategory', 'showDescription', 'showUnitPrice', 'showBadge', 'showFooter'] as const) {
      if (r[k] !== undefined) (style as Record<string, unknown>)[k] = r[k]
    }
    out.style = style
  }
  // Mise en page + ajustements fins par bloc.
  if (r.layout) out.layout = r.layout
  if (r.adjustments?.length) {
    const offsets: NonNullable<PromoGenResult['adjustments']>['offsets'] = {}
    const scales: NonNullable<PromoGenResult['adjustments']>['scales'] = {}
    const hidden: NonNullable<PromoGenResult['adjustments']>['hidden'] = {}
    for (const a of r.adjustments) {
      const block = a.block as PromoBlockId
      if (a.dx != null || a.dy != null) offsets[block] = { dx: a.dx ?? 0, dy: a.dy ?? 0 }
      if (a.scale != null) scales[block] = { sx: a.scale, sy: a.scale }
      if (a.hidden != null) hidden[block] = a.hidden
    }
    out.adjustments = { offsets, scales, hidden }
  }
  // Règles conditionnelles groupées par bloc.
  if (r.rules?.length) {
    const rules: Partial<Record<PromoBlockId, ConditionalRule[]>> = {}
    for (const ru of r.rules) {
      const action = actionWithDefaults(ru.actionType, { type: ru.actionType, color: ru.color, opacity: ru.opacity, scale: ru.scale })
      const rule: ConditionalRule = { id: uid(), field: ru.field, operator: ru.operator, value: ru.value, action }
      ;(rules[ru.block as PromoBlockId] ??= []).push(rule)
    }
    out.rules = rules
  }
  return out
}

export interface PromoGenContext {
  categories?: string[]
  columns?: { label: string; samples: string[] }[]
}

/** Pilote l'habillage ET les règles conditionnelles du gabarit via un prompt utilisateur. */
export async function generatePromoTemplate(brief: string, ctx: PromoGenContext = {}): Promise<PromoGenResult> {
  const catCtx = ctx.categories?.length ? `\nUnivers produits : ${ctx.categories.slice(0, 8).join(', ')}.` : ''
  const colCtx = ctx.columns?.length
    ? `\nColonnes de données disponibles (pour les conditions) :\n${ctx.columns.slice(0, 25).map((c) => `- « ${c.label} »${c.samples.length ? ` (ex. ${c.samples.slice(0, 3).join(', ')})` : ''}`).join('\n')}`
    : ''
  const r = await generateJson<Result>({
    task: 'design.templateFill',
    version: 'retailPromo.template.v2',
    prompt:
      "Tu configures un gabarit d'affiche promo RETAIL (grande distribution, lumineux, JAMAIS jeu vidéo). " +
      'Selon la demande, produis une MISE EN PAGE (structure), un HABILLAGE (style), des RÈGLES conditionnelles — un, plusieurs ou tous.\n' +
      '• MISE EN PAGE (`layout`) : choisis la disposition selon l’intention. Ex. « photo en grand / plein cadre » → photo-cover ; ' +
      '« gros prix / prix qui claque » → prix-fort ; « épuré / sobre / étiquette rayon » → minimal ; sinon classique. ' +
      'Affine si besoin avec `adjustments` (décalage dx/dy, échelle, masquage par bloc). Ne renvoie ces champs QUE si la demande concerne la disposition.\n' +
      '• HABILLAGE (couleurs/polices) : couleurs hex, polices STRICTEMENT parmi ' + FONT_OPTIONS.join(', ') + '. ' +
      'Ne renvoie ces champs QUE si la demande concerne le style.\n' +
      '• RÈGLES CONDITIONNELLES (« si [champ] [opérateur] [valeur] alors [action] ») : remplis `rules`. ' +
      "Le `field` doit être le LIBELLÉ EXACT d'une colonne ci-dessous, et `value` doit respecter le FORMAT des exemples " +
      "(ex. si les exemples sont « 0.25 », mets « 0.25 » pour 25 % ; si « 25 », mets « 25 »). " +
      "Pour « mettre le fond en vert », vise un bloc déco (badge / price / header) avec actionType=setColor et color=hex vert. " +
      "« strictement égale » sur un nombre = operator `eq`." +
      colCtx + catCtx +
      `\n\nDemande : ${brief}`,
    schema: ResultSchema,
    schemaForLLM: SCHEMA_FOR_LLM,
  })
  return toResult(r)
}
