import type { Brief, CartItem } from '@/features/briefs/types'

function readString(values: Record<string, unknown>, key: string): string | undefined {
  const v = values[key]
  return typeof v === 'string' && v.trim() ? v.trim() : undefined
}

/**
 * Déduit un décor court (quelques mots) à partir du contexte client.
 * Nano Banana 2 préfère des descriptions visuelles directes et courtes
 * à des instructions méta longues.
 */
function inferSetting(brief: Brief): string {
  const v = brief.client.values
  const haystack = [
    readString(v, 'contextSummary'),
    readString(v, 'sector'),
    readString(v, 'companyName'),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()

  if (/garage|parking|automobile|atelier|m[éeè]canique/.test(haystack))
    return 'a car repair workshop with concrete floor and tools'
  if (/mairie|municipal|collectivit|commune|ville/.test(haystack))
    return 'a town hall lobby with civic architecture'
  if (/restaurant|brasserie|caf[ée]|h[ôo]tel/.test(haystack))
    return 'a warm hospitality venue'
  if (/sport|stade|club|tournoi/.test(haystack)) return 'an outdoor sports venue'
  if (/[ée]cole|coll[èe]ge|lyc[ée]e|universit[ée]/.test(haystack)) return 'a school building'
  if (/h[ôo]pital|clinique|m[ée]dical|sant[ée]/.test(haystack)) return 'a medical facility lobby'
  if (/chantier|btp|construction/.test(haystack)) return 'a construction site'
  if (/[ée]v[ée]nement|salon|foire|congr[èe]s|expo/.test(haystack)) return 'a professional trade show venue'
  if (/magasin|boutique|retail|commerce/.test(haystack)) return 'a modern retail storefront'
  if (/bureau|tertiaire|entreprise|corporate/.test(haystack)) return 'a modern corporate office'
  return 'a professional environment'
}

/**
 * Prompt court et descriptif pour l'image hero du brief.
 * @param scene décor en anglais produit par inferSceneDescription (optionnel)
 */
export function buildHeroImagePrompt(brief: Brief, scene?: string): string {
  const setting = scene?.trim() || inferSetting(brief)
  return `Photorealistic wide-angle photograph. Scene: ${setting}. Cinematic lighting, shallow depth of field, premium editorial style.`
}

/**
 * Prompt court et descriptif pour un produit du panier.
 */
export function buildProductImagePrompt(brief: Brief, item: CartItem, scene?: string): string {
  const setting = scene?.trim() || inferSetting(brief)
  return `Photorealistic product photograph of a ${item.name.toLowerCase()}. Scene: ${setting}. Soft natural lighting, marketing editorial composition, realistic materials and textures.`
}

