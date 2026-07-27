// Lignes rendues par un BOT (BrowserAct) → fiches concurrent. PUR + server-safe.
//
// Contrainte fondatrice : **la structure de sortie est INCONNUE**. Un bot est construit
// site par site, dans le tableau de bord du fournisseur, et l'utilisateur nomme ses
// champs comme il veut — `price`, `prix`, `Prix TTC`, `product_price`, `montant`… Il n'y
// a donc pas de mapping à écrire par site : il faut DÉDUIRE.
//
// Deux signaux, dans cet ordre :
//   1. le NOM de la clé, normalisé (accents, casse, séparateurs) et comparé à des alias ;
//   2. à défaut, la FORME de la valeur — une URL commence par http, un prix ressemble à
//      « 12,90 € », un EAN fait 13 chiffres, une image finit en .jpg/.png/.webp.
// Le second rattrape ce que le premier ne connaît pas : c'est lui qui rend le module
// utilisable sur un site jamais vu, avec des libellés jamais rencontrés.
//
// FAIL-CLOSED : une ligne sans identité exploitable (ni nom ni référence) est ignorée.
// Mieux vaut zéro fiche qu'une fiche fantôme dans l'index concurrent.
import type { CompetitorListing } from './prestashop'

/** Normalise une clé : sans accents, minuscules, sans séparateurs (`Prix TTC` → `prixttc`). */
function foldKey(k: string): string {
  return k.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '')
}

/** Alias par champ, comparés à la clé NORMALISÉE. Ordre = priorité. */
const ALIASES: Record<'name' | 'price' | 'listPrice' | 'ref' | 'ean' | 'url' | 'image' | 'stock', string[]> = {
  name: ['name', 'title', 'productname', 'libelle', 'designation', 'intitule', 'produit', 'article', 'itemname'],
  price: ['price', 'prix', 'prixttc', 'prixht', 'unitprice', 'saleprice', 'currentprice', 'amount', 'montant', 'tarif', 'cost'],
  listPrice: ['listprice', 'oldprice', 'wasprice', 'prixbarre', 'prixinitial', 'originalprice', 'strikeprice', 'compareatprice'],
  ref: ['ref', 'reference', 'sku', 'mpn', 'code', 'codearticle', 'partnumber', 'itemcode', 'modele', 'model'],
  ean: ['ean', 'ean13', 'gtin', 'gtin13', 'gtin14', 'barcode', 'codebarre', 'upc'],
  url: ['url', 'link', 'href', 'producturl', 'permalink', 'lien', 'page'],
  image: ['image', 'img', 'photo', 'picture', 'thumbnail', 'visuel', 'imageurl'],
  stock: ['stock', 'availability', 'disponibilite', 'dispo', 'instock', 'etat'],
}

const str = (v: unknown): string | undefined => {
  if (typeof v === 'number') return String(v)
  return typeof v === 'string' && v.trim() ? v.trim() : undefined
}

/**
 * Nombre depuis un libellé marchand : « 1 299,90 € », « 12.90 EUR », « 9,90€ HT ».
 * Sépare le décimal du séparateur de milliers en se fiant à la POSITION du dernier
 * marqueur — `1.299,90` et `1,299.90` doivent tous deux rendre 1299.90.
 */
export function parseLooseNumber(raw: unknown): number | undefined {
  if (typeof raw === 'number') return isFinite(raw) && raw > 0 ? raw : undefined
  const s = str(raw)
  if (!s) return undefined
  const cleaned = s.replace(/[^\d.,-]/g, '')
  if (!/\d/.test(cleaned)) return undefined
  const lastComma = cleaned.lastIndexOf(',')
  const lastDot = cleaned.lastIndexOf('.')
  let normalized: string
  if (lastComma > lastDot) normalized = cleaned.replace(/\./g, '').replace(',', '.')
  else if (lastDot > lastComma) normalized = cleaned.replace(/,/g, '')
  else normalized = cleaned
  const n = Number(normalized)
  return isFinite(n) && n > 0 ? n : undefined
}

const looksLikeUrl = (s: string): boolean => /^https?:\/\//i.test(s)
const looksLikeImage = (s: string): boolean => looksLikeUrl(s) && /\.(?:jpe?g|png|webp|avif|gif)(?:[?#]|$)/i.test(s)
const looksLikeEan = (s: string): boolean => /^\d{8}$|^\d{12,14}$/.test(s.replace(/[\s-]/g, ''))
const looksLikePrice = (s: string): boolean => /\d/.test(s) && /[€$£]|eur|ttc|\bht\b/i.test(s)

/** Première valeur dont la clé normalisée figure dans `names`. */
function byKey(row: Record<string, unknown>, names: string[]): unknown {
  const folded = new Map<string, unknown>()
  for (const [k, v] of Object.entries(row)) {
    const f = foldKey(k)
    if (!folded.has(f)) folded.set(f, v)
  }
  for (const n of names) {
    const v = folded.get(n)
    if (v != null && v !== '') return v
  }
  return undefined
}

/** Vrai TTC/HT lu dans le NOM de la colonne (« Prix TTC ») ou dans la valeur (« 9,90 € HT »). */
function taxIncludedOf(row: Record<string, unknown>): boolean | undefined {
  for (const [k, v] of Object.entries(row)) {
    const hay = `${k} ${typeof v === 'string' ? v : ''}`
    if (/\bttc\b/i.test(hay)) return true
    if (/\bht\b|hors\s*taxe/i.test(hay)) return false
  }
  return undefined
}

const AVAILABILITY: [RegExp, NonNullable<CompetitorListing['availability']>][] = [
  [/rupture|out.?of.?stock|indisponible|epuise|sold.?out/i, 'out-of-stock'],
  [/commande|preorder|backorder|sur\s*demande|delai/i, 'on-order'],
  [/stock|disponible|in.?stock|available|expedi/i, 'in-stock'],
]

/**
 * Une ligne de bot → une fiche concurrent. `baseUrl` sert d'URL de repli quand le bot
 * n'en rend pas (il a été lancé SUR cette page : c'est bien son adresse).
 */
export function rowToListing(row: Record<string, unknown>, baseUrl?: string): CompetitorListing | null {
  // 1. Par nom de clé.
  let name = str(byKey(row, ALIASES.name))
  let price = parseLooseNumber(byKey(row, ALIASES.price))
  const listPrice = parseLooseNumber(byKey(row, ALIASES.listPrice))
  let ref = str(byKey(row, ALIASES.ref))
  let ean = str(byKey(row, ALIASES.ean))
  let url = str(byKey(row, ALIASES.url))
  let image = str(byKey(row, ALIASES.image))
  const stockRaw = str(byKey(row, ALIASES.stock))

  // 2. Par FORME de valeur — c'est ce qui fait tenir le module sur un site inconnu, dont
  //    on ne peut pas deviner les libellés de colonnes.
  const texts = Object.values(row).map(str).filter((v): v is string => !!v)
  if (!url) url = texts.find((v) => looksLikeUrl(v) && !looksLikeImage(v))
  if (!image) image = texts.find(looksLikeImage)
  if (!ean) ean = texts.find(looksLikeEan)
  if (price == null) price = parseLooseNumber(texts.find(looksLikePrice))
  if (!name) {
    // Le nom est la chaîne la plus « prose » : longue, ni URL, ni prix, ni code nu.
    name = texts
      .filter((v) => v.length >= 8 && !looksLikeUrl(v) && !looksLikePrice(v) && /[a-zà-ÿ]{3}/i.test(v))
      .sort((a, b) => b.length - a.length)[0]
  }
  if (!ref && ean) ref = undefined // un EAN n'est pas une référence marchand

  // FAIL-CLOSED : sans identité, la ligne ne peut ni s'apparier ni s'afficher.
  const identity = name ?? ref ?? ean
  if (!identity) return null
  const finalUrl = url ?? baseUrl
  if (!finalUrl) return null

  const availability = stockRaw
    ? AVAILABILITY.find(([re]) => re.test(stockRaw))?.[1]
    : undefined
  const taxIncluded = taxIncludedOf(row)

  return {
    url: finalUrl,
    name: (name ?? ref ?? ean) as string,
    ...(ref ? { ref } : {}),
    ...(price != null ? { price } : {}),
    ...(listPrice != null && price != null && listPrice > price ? { listPrice } : {}),
    ...(price != null ? { currency: 'EUR' } : {}),
    ...(taxIncluded !== undefined ? { taxIncluded } : {}),
    ...(availability ? { availability } : {}),
    ...(ean ? { gtin13: ean.replace(/[\s-]/g, '') } : {}),
    ...(image ? { image } : {}),
  }
}

/**
 * Sortie brute d'un bot → lignes. Le format n'est pas garanti (JSON, CSV, XML ou
 * Markdown selon le nœud « Output Data ») : on accepte un tableau JSON, un objet unique,
 * les enveloppes usuelles, et le JSONL. Le reste rend [] plutôt qu'un demi-résultat.
 */
export function parseBotRows(output: string | undefined): Record<string, unknown>[] {
  const raw = output?.trim()
  if (!raw) return []
  const asRows = (v: unknown): Record<string, unknown>[] => {
    if (Array.isArray(v)) return v.flatMap(asRows)
    if (v && typeof v === 'object') {
      const o = v as Record<string, unknown>
      for (const k of ['data', 'items', 'results', 'rows', 'products', 'output']) {
        if (Array.isArray(o[k])) return asRows(o[k])
      }
      return [o]
    }
    return []
  }
  try { return asRows(JSON.parse(raw)) } catch { /* JSONL ci-dessous */ }
  const rows: Record<string, unknown>[] = []
  for (const line of raw.split('\n')) {
    const t = line.trim()
    if (!t.startsWith('{')) continue
    try { rows.push(...asRows(JSON.parse(t))) } catch { /* ligne illisible : ignorée */ }
  }
  return rows
}

/** Échappe ce qui casserait le `<script>` porteur (pas du HTML : du JSON dans une balise). */
const escapeForScript = (s: string): string => s.replace(/<\/script/gi, '<\\/script')

/**
 * Sortie d'un bot → document HTML SYNTHÉTIQUE portant ses fiches en JSON-LD.
 *
 * Pourquoi ce détour plutôt qu'un chemin dédié : toute la moisson consomme du HTML
 * (`fetchHtml` → `extractListingProducts`). En rendant un document dont le JSON-LD est
 * déjà au format schema.org, un bot devient une source comme une autre — sans nouveau
 * chemin d'exécution, et en réutilisant un parseur éprouvé plutôt qu'en écrivant un
 * second convertisseur qui dériverait du premier.
 *
 * Rend null si aucune fiche n'est exploitable : l'appelant traite ça comme une page vide.
 */
export function botOutputToHtml(output: string | undefined, baseUrl?: string): string | null {
  const listings = parseBotRows(output)
    .map((r) => rowToListing(r, baseUrl))
    .filter((l): l is CompetitorListing => l != null)
  if (listings.length === 0) return null
  const jsonLd = listings.map((l) => ({
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: l.name,
    url: l.url,
    ...(l.ref ? { sku: l.ref } : {}),
    ...(l.gtin13 ? { gtin13: l.gtin13 } : {}),
    ...(l.image ? { image: l.image } : {}),
    ...(l.price != null
      ? { offers: { '@type': 'Offer', price: l.price, priceCurrency: l.currency ?? 'EUR', ...(l.availability ? { availability: l.availability } : {}) } }
      : {}),
  }))
  return `<!doctype html><html><head><script type="application/ld+json">${
    escapeForScript(JSON.stringify(jsonLd))
  }</script></head><body></body></html>`
}
