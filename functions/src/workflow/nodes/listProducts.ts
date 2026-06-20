// functions/src/workflow/nodes/listProducts.ts
// Jumeau SERVEUR (headless) du node client « Produits d'une page liste »
// (src/features/workflows/registry/listProductsNode.ts). Wire-compatible : mêmes
// clés de config (urls, maxProducts), même port de sortie `sheet`, mêmes colonnes
// {site, name, brand, ean, price, url}. Jina (mode listing) + UNE extraction LLM
// JSON par page. Pour le cron quotidien de comparaison de prix multi-sites.
import { registerServerNode } from '../registry'
import { jinaRead, jinaSearch } from '../jina'
import { brightDataRead, htmlToText } from '../brightData'
import { callLlm, parseLlmJson, recoverJsonObjects } from '../llm'
import { fetchHtml } from '../../scraper/fetchHtml'
import { extractProductIdentity } from '../../scraper/extractProducts'

interface ExtractedProduct {
  name?: unknown
  brand?: unknown
  ean?: unknown
  price?: unknown
  originalPrice?: unknown
  url?: unknown
  image?: unknown
}

/** Valide la clé de contrôle EAN-13 (GS1) : écarte les id marketplace à 13 chiffres
 *  planqués dans un slug d'URL (jardiland « …rbc36x2-6744473726508 », checksum KO). */
function isValidEan13(code: string): boolean {
  if (!/^\d{13}$/.test(code)) return false
  const d = [...code].map(Number)
  const sum = d.slice(0, 12).reduce((s, n, i) => s + n * (i % 2 === 0 ? 1 : 3), 0)
  return (10 - (sum % 10)) % 10 === d[12]
}

/** EAN robuste, anti-hallucination : n'accepte qu'un EAN-13 à clé de contrôle valide
 *  (écarte les id marketplace) ; l'EAN du LLM seulement s'il est valide ET corroboré
 *  dans l'image/URL/nom ; sinon le 1er code 13 chiffres VALIDE de l'image, puis URL, puis nom. */
function resolveEan(ean: unknown, image: unknown, url: unknown, name: unknown): string {
  const sources = [image, url, name].map((s) => String(s ?? ''))
  const clean = String(ean ?? '').replace(/\D/g, '')
  if (isValidEan13(clean) && sources.some((s) => s.includes(clean))) return clean
  for (const src of sources) {
    for (const m of src.matchAll(/\d{13}/g)) {
      if (isValidEan13(m[0])) return m[0]
    }
  }
  return ''
}

const COLUMNS = [
  { key: 'site', label: 'Site' },
  { key: 'name', label: 'Produit' },
  { key: 'brand', label: 'Marque' },
  { key: 'ean', label: 'EAN' },
  { key: 'price', label: 'Prix' },
  { key: 'originalPrice', label: 'Prix barré' },
  { key: 'url', label: 'URL' },
]

function parseUrls(raw: unknown): string[] {
  return String(raw ?? '')
    .split(/[\n,;]+/)
    .map((s) => s.trim())
    .filter((s) => /^https?:\/\//.test(s))
}

/** Mode « famille » : chaque ligne = un DOMAINE. */
function parseDomains(raw: unknown): string[] {
  return String(raw ?? '')
    .split(/[\n,;]+/)
    .map((s) => s.trim().replace(/^https?:\/\//, '').replace(/\/.*$/, '').replace(/^www\./, ''))
    .filter(Boolean)
}

/** Meilleure URL de page liste pour une famille sur un domaine (pas une fiche). */
function pickListingUrl(results: { url: string; title?: string }[], domain: string, family: string): string | null {
  const d = domain.replace(/^www\./, '')
  const onDomain = results.filter((r) => {
    try { return new URL(r.url).hostname.replace(/^www\./, '').endsWith(d) } catch { return false }
  })
  if (onDomain.length === 0) return null
  const fam = family.toLowerCase()
  const isProduct = (u: string) => /\/p\/|\.prd(\?|$)|-p\.html|\/produit\/|\/product\//i.test(u)
  const isListing = (u: string) =>
    /\/c\/|\/s\/|cat[_.-]|categor|\/produits\/|\/rayon|\/recherche|\/search|dyn\.cat/i.test(u) || u.toLowerCase().includes(fam)
  const notProduct = onDomain.filter((r) => !isProduct(r.url))
  return (
    notProduct.find((r) => isListing(r.url) && `${r.url} ${r.title ?? ''}`.toLowerCase().includes(fam)) ||
    notProduct.find((r) => isListing(r.url)) ||
    notProduct[0] ||
    onDomain[0]
  )?.url ?? null
}

/** Normalise pour comparaison marque : minuscules, sans accents. */
function normBrand(s: string): string {
  return String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim()
}
/** Un produit « est de la marque » si le terme apparaît dans sa marque OU son nom.
 *  Terme vide → toujours vrai (aucun filtrage = comportement inchangé). */
export function matchesBrand(name: unknown, brand: unknown, term: string): boolean {
  if (!term) return true
  const t = normBrand(term)
  return normBrand(`${brand ?? ''} ${name ?? ''}`).includes(t)
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

function normalizePriceToken(tok: string): number {
  let s = tok
  if (s.includes('.') && s.includes(',')) {
    const dec = s.lastIndexOf('.') > s.lastIndexOf(',') ? '.' : ','
    s = s.split(dec === '.' ? ',' : '.').join('').replace(dec, '.')
  } else if (s.includes(',')) {
    const parts = s.split(',')
    s = parts.length === 2 && parts[parts.length - 1].length <= 2 ? parts.join('.') : parts.join('')
  } else if (s.includes('.')) {
    const parts = s.split('.')
    if (parts.length > 2 || parts[parts.length - 1].length === 3) s = parts.join('')
  }
  return parseFloat(s)
}
/** Parse « 1 299,90 € » → 1299.9 ; NaN si illisible. Séparateurs FR/EN ; sur une
 *  paire promo (« 304,38€284,41€ ») renvoie le PLUS BAS. (Aligné sur priceWatch/core.) */
function parsePrice(v: unknown): number {
  if (typeof v === 'number') return v
  if (typeof v !== 'string') return NaN
  const tokens = [...v.replace(/\s/g, '').matchAll(/-?\d[\d.,]*\d|-?\d/g)]
    .map((m) => normalizePriceToken(m[0]))
    .filter((n) => Number.isFinite(n))
  return tokens.length ? Math.min(...tokens) : NaN
}

type Ctx = {
  uid: string
  signal: AbortSignal
  log: (level: 'info' | 'warn' | 'error', msg: string) => void
  reportConnector?: (id: string) => void
}

/** Exécute fn sur chaque item, au plus `limit` en parallèle (borne le coût/temps + les
 *  limites de débit Bright Data quand on charge plusieurs pages d'un coup). */
async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length)
  let i = 0
  await Promise.all(
    Array.from({ length: Math.min(Math.max(1, limit), items.length || 1) }, async () => {
      while (i < items.length) {
        const idx = i++
        out[idx] = await fn(items[idx])
      }
    }),
  )
  return out
}

/** Compte les marqueurs de prix (€) — signal robuste, cross-site, d'une grille produit
 *  réellement rendue. Une page liste dont la grille est peinte en JS ressort quasi sans
 *  prix dans le markdown Jina (ex. Castorama → 6 k chars, 3 produits au lieu de ~45). */
export function priceMarkerCount(text: string): number {
  return (String(text).match(/\d[\d  .,]{0,12}€|€\s?\d/g) ?? []).length
}
/** Sous ce nombre de marqueurs de prix, un listing est jugé « maigre » → on tente Bright
 *  Data (rendu JS) en plus de Jina. Calibré sur run réel : Castorama tronqué = 11 produits
 *  (~15-25 marqueurs) alors que la page en a ~45 → seuil à 30 pour le rattraper ; Jardiland
 *  (~42 produits) et Leroy Merlin (~24, déjà sur BD) restent au-dessus. La garde
 *  anti-régression (ne remplacer que si BD est plus riche) évite tout dégât sur un vrai
 *  petit listing qui aurait < 30 marqueurs. */
export const THIN_LISTING_MARKERS = 30

/** Récupère le contenu d'une page liste : Jina (listing) → escalade Bright Data si VIDE
 *  ou ANORMALEMENT MAIGRE (grille rendue en JS). Garde anti-régression : on ne remplace
 *  Jina que si Bright Data ramène STRICTEMENT plus de produits (marqueurs de prix). */
async function fetchListingContent(ctx: Ctx, url: string): Promise<string> {
  let content = ''
  try {
    content = (await jinaRead(ctx.uid, url, { listing: true })).content
  } catch (err) {
    ctx.log('warn', `Lecture Jina échouée ${url} : ${err instanceof Error ? err.message : err}`)
  }
  if (content.trim()) ctx.reportConnector?.('jina')
  const jinaMarkers = priceMarkerCount(content)
  if (!content.trim() || jinaMarkers < THIN_LISTING_MARKERS) {
    try {
      if (!content.trim()) ctx.log('info', `Jina sans contenu pour ${url} → escalade Bright Data.`)
      else ctx.log('info', `Jina maigre (${jinaMarkers} prix) pour ${url} → escalade Bright Data.`)
      const bd = htmlToText((await brightDataRead(url)).html)
      const bdMarkers = priceMarkerCount(bd)
      if (bd.trim() && bdMarkers > jinaMarkers) { content = bd; ctx.reportConnector?.('brightdata') }
    } catch (err) {
      ctx.log('warn', `Bright Data échoué ${url} : ${err instanceof Error ? err.message : err}`)
    }
  }
  return content
}

/** Extrait les produits d'un contenu de page via le LLM (+ récupération de secours). */
async function extractProducts(ctx: Ctx, content: string, label: string): Promise<ExtractedProduct[]> {
  ctx.reportConnector?.('llm')
  const prompt =
    'Voici le contenu (markdown ou texte extrait du HTML) d’une page LISTE / catégorie e-commerce. Extrais TOUS les produits ' +
    'réellement listés (ignore menu, pied de page, bannières, blocs « vous aimerez aussi »). ' +
    'Réponds UNIQUEMENT par un objet JSON { "products": [ ... ] } où chaque produit a EXACTEMENT les clés : ' +
    'name (intitulé complet), brand (marque ou ""), ean (code EAN à 13 chiffres UNIQUEMENT s’il apparaît ' +
    'LITTÉRALEMENT dans l’URL de la fiche — ex « 4892210822604_CAFR.prd » — ou le nom de fichier image ; ' +
    'ne le devine JAMAIS, ne le reconstitue pas : sinon ""), ' +
    'price (prix de vente ACTUEL en euros, nombre ; si prix barré + promo, prends TOUJOURS le plus bas, le prix promo), ' +
    'originalPrice (prix D’ORIGINE barré avant réduction, nombre ; 0 si pas de prix barré affiché), ' +
    'url (lien absolu de la fiche), image (URL absolue de l’image — son chemin contient souvent ' +
    'l’EAN même quand l’URL fiche ne l’a pas).\n' +
    'IMPÉRATIF : réponds par l’objet JSON BRUT et lui seul — commence par « { » et finis par « } », ' +
    'AUCUN texte avant/après, AUCUN bloc de code markdown (pas de ```), JSON compact.\n\n--- CONTENU ---\n' +
    content.slice(0, 28000)
  const { text, model, stopReason } = await callLlm(ctx.uid, prompt, { maxTokens: 24576 })
  const parsed = parseLlmJson<{ products?: ExtractedProduct[] }>(text)
  let products = Array.isArray(parsed?.products) ? parsed!.products! : []
  if (products.length > 0) {
    ctx.log('info', `${label} : ${products.length} produit(s), parse direct [${model}, stop=${stopReason ?? '?'}, markdown ${content.length} chars].`)
  } else {
    const recovered = recoverJsonObjects(text) as ExtractedProduct[]
    if (recovered.length > 0) {
      products = recovered
      // Pas une erreur : réponse LLM tronquée (limite de sortie), produits récupérés intacts.
      ctx.log('info', `${label} : ${recovered.length} produit(s) extrait(s) [${model}] — réponse tronquée (${text.length} chars), récupération OK.`)
    } else {
      ctx.log('warn', `${label} : 0 produit [${model}, stop=${stopReason ?? '?'}, ${text.length} chars, markdown ${content.length}].`)
    }
  }
  return products
}

registerServerNode({
  type: 'list-products',
  run: async (ctx, config) => {
    const family = String(config.family ?? '').trim()
    let urls: string[]
    if (family) {
      // Découverte auto : chaque ligne = domaine, on cherche la page liste de la famille.
      const domains = parseDomains(config.urls)
      urls = []
      for (const domain of domains) {
        if (ctx.signal.aborted) break
        try {
          const results = await jinaSearch(ctx.uid, `${family} site:${domain}`)
          const found = pickListingUrl(results, domain, family)
          if (found) { urls.push(found); ctx.log('info', `${domain} → ${found}`) }
          else ctx.log('warn', `Aucune page liste « ${family} » sur ${domain}.`)
        } catch (e) {
          ctx.log('warn', `Recherche échouée sur ${domain} : ${e instanceof Error ? e.message : e}`)
        }
      }
      if (urls.length === 0) { ctx.log('warn', `Découverte « ${family} » : aucune page liste trouvée.`); return { sheet: { columns: COLUMNS, rows: [] } } }
    } else {
      urls = parseUrls(config.urls)
      if (urls.length === 0) {
        ctx.log('warn', 'Aucune URL de page liste valide.')
        return { sheet: { columns: COLUMNS, rows: [] } }
      }
    }
    // Filtre marque optionnel : écarte les produits hors-marque (ex. une recherche
    // « tondeuse ryobi » qui remonte des robots Sunseeker). Vide → aucun filtrage.
    const brandTerm = String(config.marque ?? '').trim()
    let brandFiltered = 0
    const max = Math.max(0, Number(config.maxProducts) || 0)
    // Pagination : `maxPages` pages par URL via le param `pageParam` (ex « page », « p »).
    // Page 1 = URL telle quelle ; pages 2..N = URL + ?/&{pageParam}=k.
    const maxPages = Math.max(1, Math.min(20, Number(config.maxPages) || 1))
    const pageParam = String(config.pageParam ?? '').trim() || 'page'

    const WAVE = 3 // pages chargées en parallèle par vague

    const seen = new Set<string>()
    const rows: Record<string, unknown>[] = []
    let rowId = 0
    // Ajoute les produits nouveaux (dédup) et renvoie le nombre RÉELLEMENT ajouté.
    const pushProducts = (products: ExtractedProduct[], site: string): number => {
      let added = 0
      for (const p of products) {
        const url = String(p.url ?? '').trim()
        const name = String(p.name ?? '').trim()
        if (!name) continue
        if (!matchesBrand(name, p.brand, brandTerm)) { brandFiltered++; continue }
        const key = `${site}|${url || name.toLowerCase()}`
        if (seen.has(key)) continue
        seen.add(key)
        const priceNum = parsePrice(p.price)
        const price = Number.isFinite(priceNum) && priceNum > 0 ? priceNum : parsePrice(p.name)
        const origNum = parsePrice(p.originalPrice)
        const orig = Number.isFinite(origNum) && origNum > price ? origNum : NaN
        rows.push({
          _id: `lp_${rowId++}`, site, name,
          brand: String(p.brand ?? '').trim(),
          ean: resolveEan(p.ean, p.image, p.url, p.name),
          price: Number.isFinite(price) && price > 0 ? String(price) : '',
          originalPrice: Number.isFinite(orig) ? String(orig) : '',
          url,
        })
        added++
      }
      return added
    }
    const scrapePage = async (url: string, site: string): Promise<ExtractedProduct[]> => {
      const content = await fetchListingContent(ctx, url)
      if (!content.trim()) { ctx.log('warn', `Aucun contenu pour ${url}.`); return [] }
      try { return await extractProducts(ctx, content, site) }
      catch (err) { ctx.log('warn', `Extraction LLM échouée pour ${url} : ${err instanceof Error ? err.message : err}`); return [] }
    }

    for (const root of urls) {
      if (ctx.signal.aborted) break
      const site = hostOf(root)
      pushProducts(await scrapePage(root, site), site) // page 1
      // Pages 2..maxPages par vagues — ARRÊT ANTICIPÉ dès qu'une vague n'apporte aucun
      // nouveau produit (site sans pagination / fin du catalogue) : évite de lire 20
      // pages quand il n'y en a que 1-3.
      let stop = false
      for (let k = 2; k <= maxPages && !stop && !ctx.signal.aborted; k += WAVE) {
        const sep = root.includes('?') ? '&' : '?'
        const batch: string[] = []
        for (let j = k; j < k + WAVE && j <= maxPages; j++) batch.push(`${root}${sep}${pageParam}=${j}`)
        const results = await mapLimit(batch, WAVE, (u) => scrapePage(u, site))
        let waveNew = 0
        for (const products of results) waveNew += pushProducts(products, site)
        if (waveNew === 0) {
          stop = true
          if (k === 2) ctx.log('info', `${site} : pas de page suivante exploitable (param « ${pageParam} » ?) — 1 page lue.`)
          else ctx.log('info', `${site} : fin de pagination à la page ~${k}.`)
        }
        if (max > 0 && rows.length >= max) break
      }
    }
    const capped = max > 0 ? rows.slice(0, max) : rows

    // Enrichissement par FICHE (EAN/marque/prix canoniques du JSON-LD) : l'EAN n'est
    // quasi jamais sur la page liste. Pour chaque produit, on lit la fiche via
    // fetchHtml (cheap) → Bright Data (anti-bot) et on parse le JSON-LD.
    if (config.enrichFiches !== false && capped.length > 0) {
      const fetchFiche = async (url: string): Promise<string> => {
        try {
          const html = await fetchHtml(url, 20000)
          if (htmlToText(html).length > 500) return html
        } catch { /* escalade */ }
        try { return (await brightDataRead(url)).html } catch { return '' }
      }
      const targets = capped.filter((r) => /^https?:\/\//.test(String(r.url ?? '')))
      ctx.log('info', `Enrichissement de ${targets.length} fiche(s) (EAN/marque/prix)…`)
      let enriched = 0
      await mapLimit(targets, 5, async (row) => {
        if (ctx.signal.aborted) return
        const html = await fetchFiche(String(row.url))
        if (!html) return
        const id = extractProductIdentity(html)
        if (!id) return
        if (id.ean) row.ean = id.ean
        if (id.brand && !String(row.brand ?? '').trim()) row.brand = id.brand
        // Ne PAS écraser un prix déjà extrait de la liste (prix de vente/promo) : la
        // fiche JSON-LD porte souvent le prix catalogue → ne remplir que si vide.
        if (id.price != null && id.price > 0 && !String(row.price ?? '').trim()) row.price = String(id.price)
        if (id.ean || id.brand || id.price != null) enriched++
      })
      ctx.log('info', `Fiches enrichies : ${enriched}/${targets.length}.`)
    }

    // Garde-fou : prix barré > prix de vente, sinon ce n'est pas une promo → vidé.
    for (const row of capped) {
      const pr = parsePrice(String(row.price ?? ''))
      const ob = parsePrice(String(row.originalPrice ?? ''))
      if (!(Number.isFinite(ob) && Number.isFinite(pr) && ob > pr)) row.originalPrice = ''
    }

    if (brandTerm && brandFiltered > 0) ctx.log('info', `Filtre marque « ${brandTerm} » : ${brandFiltered} produit(s) hors-marque écarté(s).`)
    ctx.log('info', `Total : ${capped.length} produit(s) dédupliqué(s)${rows.length !== capped.length ? ` (cap ${max})` : ''}.`)
    if (capped.length === 0) ctx.log('warn', 'Aucun produit extrait.')
    return { sheet: { columns: COLUMNS, rows: capped } }
  },
})
