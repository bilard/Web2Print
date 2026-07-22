// Parsers PURS des pages kramp CONNECTÉES (via Firecrawl markdown). Serveur-only.
// Prix = libellé « Prix brut » (HT, tarif B2B). Textes VERBATIM (aucune reformulation IA).
import type { CompetitorListing } from './prestashop'

/** Réf kramp = segment après le dernier « -- » de l'URL fiche : /p/<slug>--<ref>. */
export function krampRefFromUrl(url: string): string {
  const m = url.match(/--([^/?#]+)(?:[/?#]|$)/)
  return m ? decodeURIComponent(m[1]) : ''
}

/** Prix français « 1 234,56 » → 1234.56 ; null si non parsable ou ≤ 0. */
export function parseFrPrice(raw: string): number | null {
  const s = String(raw).replace(/[^\d.,\s]/g, '').replace(/\s/g, '').replace(/\.(?=\d{3}(?:\D|$))/g, '').replace(',', '.')
  const n = Number(s)
  return isFinite(n) && n > 0 ? n : null
}

/** URLs de fiches produit (/p/<slug>--<ref>) présentes dans le markdown d'une recherche. */
export function parseKrampSearchUrls(markdown: string): string[] {
  const re = /https:\/\/www\.kramp\.com\/shop-fr\/fr\/p\/[^\s)"']*--[^\s)"']+/g
  return [...new Set(markdown.match(re) ?? [])]
}

/** Fiche produit kramp connectée → listing appariable. Prix = montant € après « Prix brut ».
 *  null si aucun prix (pas une fiche exploitable). */
export function parseKrampProduct(markdown: string, url: string): CompetitorListing | null {
  const ref = krampRefFromUrl(url)
  const nameM = markdown.match(/^#{1,3}\s+(?!Prix brut)(.+)$/m)
  const name = nameM ? nameM[1].trim() : ''
  const priceM = markdown.match(/Prix brut[^\d]{0,40}?([\d\s.]+,\d{2})\s*€/i)
  const price = priceM ? parseFrPrice(priceM[1]) : null
  if (price == null) return null
  return { url, name, ref, price, currency: 'EUR', taxIncluded: false }
}
