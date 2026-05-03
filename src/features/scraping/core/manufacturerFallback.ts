import { BRAND_OFFICIAL_SITES } from '@/features/scraping/useJina'

/**
 * Extrait une référence produit (ex: "DHR202Z", "GBH 2-26") depuis un titre
 * via regex. Retourne null si aucun pattern reconnu.
 */
export function extractProductReference(title: string): string | null {
  if (!title) return null
  // Pattern : 2-5 lettres majuscules suivies de chiffres, optionnellement
  // séparées par tiret/espace, parfois suivies de lettres/chiffres
  const m = title.match(/\b([A-Z]{2,5}[\s-]?\d{1,4}[\w-]*)\b/)
  return m ? m[1].trim() : null
}

/**
 * Construit une URL de recherche sur le site fabricant pour une référence donnée.
 * Retourne null si la marque n'est pas dans BRAND_OFFICIAL_SITES.
 */
export function buildManufacturerSearchUrl(brand: string, reference: string): string | null {
  const site = BRAND_OFFICIAL_SITES[brand.toLowerCase()]
  if (!site) return null
  // Heuristique : la plupart des sites supportent ?q=REF ou /search?q=REF
  const base = site.baseUrl.replace(/\/$/, '')
  return `${base}/search?q=${encodeURIComponent(reference)}`
}
