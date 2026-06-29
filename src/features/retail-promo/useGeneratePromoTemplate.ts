import { z } from 'zod'
import { generateJson } from '@/features/ai/llmRouter'
import { FONT_OPTIONS, type PromoTemplateConfig } from './RetailPromoCard'

const FontEnum = z.enum(FONT_OPTIONS)

const ResultSchema = z.object({
  accent: z.string(),
  headerBg: z.string(),
  fontHeading: FontEnum,
  fontPrice: FontEnum,
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
})
type Result = z.infer<typeof ResultSchema>

const SCHEMA_FOR_LLM: Record<string, unknown> = {
  type: 'object',
  properties: {
    accent: { type: 'string', description: 'couleur hex bandeau prix + badge + accroche (ex #e11d48)' },
    headerBg: { type: 'string', description: 'couleur hex bandeau en-tête + pied (ex #0f172a)' },
    fontHeading: { type: 'string', enum: [...FONT_OPTIONS], description: 'police titres/nom/prix-accroche' },
    fontPrice: { type: 'string', enum: [...FONT_OPTIONS], description: 'police du prix' },
    colorCategory: { type: 'string', description: 'hex couleur texte catégorie (optionnel)' },
    colorName: { type: 'string', description: 'hex couleur nom produit (optionnel)' },
    colorDescription: { type: 'string', description: 'hex couleur description (optionnel)' },
    colorPriceNow: { type: 'string', description: 'hex couleur prix promo (optionnel)' },
    colorPriceWas: { type: 'string', description: 'hex couleur prix barré (optionnel)' },
    colorFooter: { type: 'string', description: 'hex couleur pied de page (optionnel)' },
    showCategory: { type: 'boolean' },
    showDescription: { type: 'boolean' },
    showUnitPrice: { type: 'boolean' },
    showBadge: { type: 'boolean' },
    showFooter: { type: 'boolean' },
  },
  required: ['accent', 'headerBg', 'fontHeading', 'fontPrice'],
}

function toPatch(r: Result): Partial<PromoTemplateConfig> {
  const colors: PromoTemplateConfig['colors'] = {}
  if (r.colorCategory) colors.category = r.colorCategory
  if (r.colorName) colors.name = r.colorName
  if (r.colorDescription) colors.description = r.colorDescription
  if (r.colorPriceNow) colors.priceNow = r.colorPriceNow
  if (r.colorPriceWas) colors.priceWas = r.colorPriceWas
  if (r.colorFooter) colors.footer = r.colorFooter
  const patch: Partial<PromoTemplateConfig> = {
    accent: r.accent, headerBg: r.headerBg, fontHeading: r.fontHeading, fontPrice: r.fontPrice, colors,
  }
  if (r.showCategory !== undefined) patch.showCategory = r.showCategory
  if (r.showDescription !== undefined) patch.showDescription = r.showDescription
  if (r.showUnitPrice !== undefined) patch.showUnitPrice = r.showUnitPrice
  if (r.showBadge !== undefined) patch.showBadge = r.showBadge
  if (r.showFooter !== undefined) patch.showFooter = r.showFooter
  return patch
}

/** Pilote l'habillage du template via un prompt utilisateur (IA → config). */
export async function generatePromoTemplate(brief: string, categories: string[] = []): Promise<Partial<PromoTemplateConfig>> {
  const ctx = categories.length ? `\nUnivers produits présents : ${categories.slice(0, 8).join(', ')}.` : ''
  const r = await generateJson<Result>({
    task: 'design.templateFill',
    version: 'retailPromo.template.v1',
    prompt:
      "Tu es directeur artistique d'affiches promo RETAIL (grande distribution, prospectus moderne, lumineux — " +
      'JAMAIS jeu vidéo ni cinématique sombre). Définis l\'HABILLAGE d\'un gabarit d\'affiche promo selon la demande.\n' +
      '- Couleurs en hexadécimal (#rrggbb). accent = bandeau prix + badge ; headerBg = bandeau en-tête (souvent foncé) + pied.\n' +
      `- Polices STRICTEMENT parmi : ${FONT_OPTIONS.join(', ')}.\n` +
      '- Les couleurs de texte (colorName, colorPriceNow…) sont optionnelles : ne les mets QUE si la demande le justifie, ' +
      'et garantis un bon contraste sur leur fond (nom/description sur headerBg ; prix sur accent).\n' +
      '- show* : affiche/masque catégorie, description, prix unitaire, badge remise, pied.\n' +
      `Demande : ${brief}${ctx}`,
    schema: ResultSchema,
    schemaForLLM: SCHEMA_FOR_LLM,
  })
  return toPatch(r)
}
