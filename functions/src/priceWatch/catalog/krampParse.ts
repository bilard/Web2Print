// Parsers PURS des pages kramp CONNECTÉES (via Firecrawl markdown). Serveur-only.
// La page de RECHERCHE connectée /search/<réf> porte déjà tout (URL fiche + réf + nom +
// prix HT), donc une seule page suffit. Prix = tarif B2B HT. Textes VERBATIM (aucune IA).

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

// Prix français ANCRÉ : partie entière = groupes de milliers (« 1.234 » / « 1 234 ») OU
// chiffres simples — JAMAIS une réf pointée (pas de « [\d\s.]* » gourmand qui aspirerait
// « 092.48.801 » avant « 12,06 »). Décimales sur 2 chiffres.
const PRICE_RE = /(?:\d{1,3}(?:[ .]\d{3})+|\d+),\d{2}\s*€/

/** Une carte produit de la page de RECHERCHE kramp connectée : URL fiche, réf (dans l'URL),
 *  nom, et prix HT — le prix étant SCOPÉ à la fenêtre de CETTE carte (entre son URL et
 *  l'URL de la carte suivante), pour ne jamais rattacher un € d'ailleurs (bandeau
 *  livraison, filtre, panier). Textes VERBATIM. */
export interface KrampCard {
  url: string
  ref: string
  name: string
  /**
   * Prix HT rattaché à CETTE carte, quand la page de recherche en affiche un.
   *
   * ⚠⚠ OPTIONNEL depuis le 2026-08-12. Une carte sans prix était purement ÉCARTÉE :
   * soixante-deux pour cent des fiches kramp n'entraient donc jamais dans l'index, alors
   * que leur référence et leur libellé étaient là — et que le prix, lui, figure sur la
   * fiche produit (« Prix brut : 29,38 € »). Ne pas inventer un prix est une règle saine ;
   * jeter le produit avec, c'en est une autre, et elle nous coûtait la moitié du
   * concurrent. La fiche est retenue sans prix ; la passe d'enrichissement le complétera.
   */
  price?: number
}

export function parseKrampSearchCards(markdown: string): KrampCard[] {
  const urls = parseKrampSearchUrls(markdown)
  const cards: KrampCard[] = []
  for (let i = 0; i < urls.length; i++) {
    const url = urls[i]
    const start = markdown.indexOf(url)
    if (start < 0) continue
    const next = urls[i + 1] ? markdown.indexOf(urls[i + 1], start + url.length) : -1
    const window = markdown.slice(start, next > start ? next : markdown.length)
    const priceM = window.match(PRICE_RE)
    const price = priceM ? parseFrPrice(priceM[0]) : null
    const ref = krampRefFromUrl(url)
    // Une carte sans RÉFÉRENCE, elle, ne sert à rien : c'est la clé de l'appariement.
    if (!ref) continue
    // Nom : libellé de lien le plus long pointant vers cette fiche (hors image `![…]` et
    // hors lien dont le texte n'est que la réf), dans la fenêtre de la carte.
    const name = [...window.matchAll(/\[([^\]]+)\]\(([^)]+)\)/g)]
      .filter((m) => m[2] === url && !m[1].startsWith('!') && m[1].trim() !== ref)
      .map((m) => m[1].trim())
      .sort((a, b) => b.length - a.length)[0] ?? ''
    cards.push({ url, ref, name, ...(price != null ? { price } : {}) })
  }
  return cards
}
