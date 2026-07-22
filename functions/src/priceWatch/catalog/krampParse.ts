// Parsers PURS des pages kramp CONNECTÉES (via Firecrawl markdown). Serveur-only.
// La page de RECHERCHE connectée /search/<réf> porte déjà tout (URL fiche + réf + nom +
// prix HT), donc une seule page suffit. Prix = tarif B2B HT. Textes VERBATIM (aucune IA).
import type { CompetitorListing } from './prestashop'

/** Réf kramp = segment après le DERNIER « -- » de l'URL fiche : /p/<slug>--<ref>.
 *  On prend le dernier séparateur (un slug peut contenir « -- ») et on retire query/hash. */
export function krampRefFromUrl(url: string): string {
  const path = url.split(/[?#]/)[0]
  const i = path.lastIndexOf('--')
  return i >= 0 ? decodeURIComponent(path.slice(i + 2)) : ''
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

/** Page de RECHERCHE kramp connectée → listing appariable. Pour un résultat exact, la page
 *  /search/<réf> porte l'URL fiche, la réf (dans l'URL), le nom et le prix HT. On prend la
 *  1re fiche et le 1er prix €. null si aucun prix (aucun résultat exploitable). */
export function parseKrampSearchListing(markdown: string): CompetitorListing | null {
  const url = parseKrampSearchUrls(markdown)[0]
  if (!url) return null
  const ref = krampRefFromUrl(url)
  // Nom : le libellé de lien le plus long pointant vers CETTE fiche (hors image `![…]` et
  // hors lien dont le texte n'est que la réf).
  const name = [...markdown.matchAll(/\[([^\]]+)\]\(([^)]+)\)/g)]
    .filter((m) => m[2] === url && !m[1].startsWith('!') && m[1].trim() !== ref)
    .map((m) => m[1].trim())
    .sort((a, b) => b.length - a.length)[0] ?? ''
  const priceM = markdown.match(/(\d[\d\s.]*,\d{2})\s*€/)
  const price = priceM ? parseFrPrice(priceM[1]) : null
  if (price == null) return null
  return { url, name, ref, price, currency: 'EUR', taxIncluded: false }
}
