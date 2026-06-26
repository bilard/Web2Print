// functions/src/workflow/nodes/listProducts.ts
// Jumeau SERVEUR (headless) du node client « Produits d'une page liste »
// (src/features/workflows/registry/listProductsNode.ts). Wire-compatible : mêmes
// clés de config (urls, maxProducts), même port de sortie `sheet`, mêmes colonnes
// {site, name, brand, ean, price, url}. Jina (mode listing) + UNE extraction LLM
// JSON par page. Pour le cron quotidien de comparaison de prix multi-sites.
import { load } from 'cheerio'
import { registerServerNode } from '../registry'
import { jinaRead, jinaSearch } from '../jina'
import { brightDataRead, htmlToText, scrapingBrowserRead } from '../brightData'
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

const asObj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' ? v as Record<string, unknown> : {})

/** Collecte récursivement les nœuds `ItemList` d'un JSON-LD (direct, `@graph`, `mainEntity`). */
function collectItemLists(node: unknown, acc: Record<string, unknown>[]): void {
  const n = asObj(node)
  const t = n['@type']
  if ((t === 'ItemList' || (Array.isArray(t) && t.includes('ItemList'))) && Array.isArray(n.itemListElement)) acc.push(n)
  if (Array.isArray(n['@graph'])) for (const g of n['@graph']) collectItemLists(g, acc)
  if (n.mainEntity) collectItemLists(n.mainEntity, acc)
}

/** Extraction DÉTERMINISTE des produits d'une page liste depuis le JSON-LD `ItemList`
 *  (schema.org, générique) : nom, EAN (champ `sku`/`gtin13` validé), prix, URL. Pas de
 *  prix barré (absent de l'ItemList) → complété par le LLM dans `mergeListing`. */
export function parseListingItemList(html: string): ExtractedProduct[] {
  const out: ExtractedProduct[] = []
  if (!html || !html.includes('ItemList')) return out
  try {
    const $ = load(html)
    $('script[type="application/ld+json"]').each((_i, el) => {
      let data: unknown
      try { data = JSON.parse($(el).contents().text()) } catch { return }
      for (const block of Array.isArray(data) ? data : [data]) {
        const lists: Record<string, unknown>[] = []
        collectItemLists(block, lists)
        for (const list of lists) {
          const els = list.itemListElement
          if (!Array.isArray(els)) continue
          for (const e of els) {
            const eo = asObj(e)
            const it = asObj('item' in eo ? eo.item : e)
            const name = String(it.name ?? '').trim()
            if (!name) continue
            const offersRaw = it.offers
            const offer = asObj(Array.isArray(offersRaw) ? offersRaw[0] : offersRaw)
            const priceNum = Number(offer.price ?? offer.lowPrice)
            const sku = String(it.gtin13 ?? it.gtin ?? it.sku ?? '').replace(/\D/g, '')
            const brandRaw = it.brand
            const imageRaw = it.image
            out.push({
              name,
              brand: typeof brandRaw === 'object' ? String(asObj(brandRaw).name ?? '') : String(brandRaw ?? ''),
              ean: isValidEan13(sku) ? sku : '',
              price: Number.isFinite(priceNum) && priceNum > 0 ? priceNum : undefined,
              url: String(it.url ?? '').trim() || undefined,
              image: typeof imageRaw === 'string' ? imageRaw : Array.isArray(imageRaw) ? String(imageRaw[0] ?? '') : undefined,
            })
          }
        }
      }
    })
  } catch { /* JSON-LD illisible → liste vide, repli LLM */ }
  return out
}

/** Fusionne l'ItemList déterministe (base canonique : nom/EAN/prix) avec l'extraction LLM
 *  (apporte le prix barré + produits hors ItemList). Union par URL ; l'ItemList prime sur
 *  nom/EAN/prix, le LLM complète le barré/marque/image. ItemList vide → LLM seul (non-régression). */
export function mergeListing(ld: ExtractedProduct[], llm: ExtractedProduct[]): ExtractedProduct[] {
  if (ld.length === 0) return llm
  const normUrl = (u: unknown): string => String(u ?? '').trim().toLowerCase().replace(/[#?].*$/, '')
  const llmByUrl = new Map<string, ExtractedProduct>()
  for (const p of llm) { const u = normUrl(p.url); if (u) llmByUrl.set(u, p) }
  const used = new Set<string>()
  const out: ExtractedProduct[] = []
  for (const p of ld) {
    const u = normUrl(p.url)
    const m = u ? llmByUrl.get(u) : undefined
    if (m && u) used.add(u)
    const ldPrice = Number(p.price)
    out.push({
      name: p.name,
      brand: String(p.brand ?? '').trim() ? p.brand : m?.brand,
      ean: String(p.ean ?? '').trim() ? p.ean : m?.ean,
      price: Number.isFinite(ldPrice) && ldPrice > 0 ? p.price : m?.price,
      originalPrice: m?.originalPrice,
      url: p.url,
      image: String(p.image ?? '').trim() ? p.image : m?.image,
    })
  }
  for (const p of llm) { const u = normUrl(p.url); if (!u || !used.has(u)) out.push(p) }
  return out
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
async function fetchListingContent(ctx: Ctx, url: string): Promise<{ text: string; html: string }> {
  let content = ''
  try {
    content = (await jinaRead(ctx.uid, url, { listing: true })).content
  } catch (err) {
    ctx.log('warn', `Lecture Jina échouée ${url} : ${err instanceof Error ? err.message : err}`)
  }
  if (content.trim()) ctx.reportConnector?.('jina')
  let html = '' // HTML brut Bright Data (porte le JSON-LD ItemList déterministe)
  const jinaMarkers = priceMarkerCount(content)
  if (!content.trim() || jinaMarkers < THIN_LISTING_MARKERS) {
    try {
      if (!content.trim()) ctx.log('info', `Jina sans contenu pour ${url} → escalade Bright Data.`)
      else ctx.log('info', `Jina maigre (${jinaMarkers} prix) pour ${url} → escalade Bright Data.`)
      html = (await brightDataRead(url)).html
      const bd = htmlToText(html)
      const bdMarkers = priceMarkerCount(bd)
      if (bd.trim() && bdMarkers > jinaMarkers) { content = bd; ctx.reportConnector?.('brightdata') }
    } catch (err) {
      ctx.log('warn', `Bright Data échoué ${url} : ${err instanceof Error ? err.message : err}`)
    }
  }
  return { text: content, html }
}

/** Faut-il escalader vers le Scraping Browser (rendu JS, coûteux) pour une page liste ?
 *  OUI seulement si la page PRINCIPALE (pas la pagination) n'a sorti AUCUN produit via
 *  Jina + Web Unlocker — signature d'une grille rendue 100 % côté client (ex Leroy Merlin
 *  /search) que ni Jina ni le Web Unlocker HTTP ne matérialisent. Le surcoût n'est donc
 *  payé que quand le résultat serait de toute façon vide : ZÉRO impact sur les sites qui
 *  sortent déjà des produits (Castorama, Jardiland) et JAMAIS sur les pages 2..N (où
 *  0 produit = fin de catalogue, comportement normal). */
export function shouldEscalateToBrowser(productCount: number, isMainPage: boolean): boolean {
  return productCount === 0 && isMainPage
}

/** Au-delà de ce nombre de chars, un contenu qui sort « 0 produit » est presque toujours
 *  un FAUX NÉGATIF du LLM (deepseek/gemini rendent par intermittence une liste vide sur un
 *  markdown pourtant riche — cf. Leroy Merlin : même page ~32k → 0, 5 ou 24 selon le tirage)
 *  plutôt qu'une page réellement vide → on relance l'extraction. */
export const RETRY_EXTRACT_MIN_CONTENT = 1500
/** Nombre maximum de tentatives d'extraction LLM sur un même contenu (1 essai + 2 relances). */
export const MAX_EXTRACT_TRIES = 3

/** Faut-il relancer l'extraction LLM ? OUI seulement si elle a sorti 0 produit sur un
 *  contenu SUBSTANTIEL, sur la page principale, et sous le plafond de tentatives. Cible le
 *  non-déterminisme du LLM sans gaspiller d'appels sur les pages de pagination vides (fin
 *  de catalogue = 0 produit légitime) ni sur des contenus réellement maigres. */
export function shouldRetryExtraction(found: number, contentLength: number, allowRetry: boolean, triesSoFar: number): boolean {
  return found === 0 && allowRetry && contentLength > RETRY_EXTRACT_MIN_CONTENT && triesSoFar < MAX_EXTRACT_TRIES
}

/** Extrait les produits d'un contenu de page via le LLM (+ récupération de secours).
 *  `allowRetry` (page principale) relance l'extraction si un contenu riche sort 0 produit.
 *  `onModel` reçoit le modèle réellement utilisé à chaque appel (pour le diagnostic visible
 *  dans le log de synthèse du node : confirme quel provider de la cascade a répondu). */
async function extractProducts(ctx: Ctx, content: string, label: string, allowRetry = false, onModel?: (m: string) => void): Promise<ExtractedProduct[]> {
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
  const runOnce = async (): Promise<ExtractedProduct[]> => {
    // Extraction d'une LISTE = JSON exhaustif sur un long contenu : privilégier les modèles
    // fiables en JSON structuré (gemini-3.1-pro, gpt-5.1, claude). deepseek-chat sous-extrait
    // les listes longues de façon erratique (Leroy Merlin : 0/5/24 sur le même markdown) →
    // relégué au repli de la cascade. Pas de régression si l'utilisateur n'a que deepseek.
    const { text, model, stopReason } = await callLlm(ctx.uid, prompt, {
      maxTokens: 24576,
      preferProviders: ['gemini', 'openai', 'claude'],
    })
    onModel?.(model)
    const parsed = parseLlmJson<{ products?: ExtractedProduct[] }>(text)
    const direct = Array.isArray(parsed?.products) ? parsed!.products! : []
    if (direct.length > 0) {
      ctx.log('info', `${label} : ${direct.length} produit(s), parse direct [${model}, stop=${stopReason ?? '?'}, markdown ${content.length} chars].`)
      return direct
    }
    const recovered = recoverJsonObjects(text) as ExtractedProduct[]
    if (recovered.length > 0) {
      // Pas une erreur : réponse LLM tronquée (limite de sortie), produits récupérés intacts.
      ctx.log('info', `${label} : ${recovered.length} produit(s) extrait(s) [${model}] — réponse tronquée (${text.length} chars), récupération OK.`)
      return recovered
    }
    ctx.log('warn', `${label} : 0 produit [${model}, stop=${stopReason ?? '?'}, ${text.length} chars, markdown ${content.length}].`)
    return []
  }
  let products = await runOnce()
  for (let tries = 1; shouldRetryExtraction(products.length, content.length, allowRetry, tries); tries++) {
    ctx.log('info', `${label} : 0 produit sur ${content.length} chars → nouvelle tentative d’extraction (${tries + 1}/${MAX_EXTRACT_TRIES}) — le LLM rend parfois une liste vide à tort.`)
    products = await runOnce()
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
    // Modèles LLM réellement utilisés pour l'extraction (diagnostic : confirme dans le log
    // de synthèse quel provider de la cascade a répondu — gemini-3.1-pro attendu, deepseek
    // = repli si les clés préférées manquent côté serveur).
    const modelsSeen = new Set<string>()
    // Extraction depuis un contenu déjà récupéré : 1) JSON-LD ItemList (déterministe, EAN
    // propres) depuis le HTML brut, 2) LLM sur le texte (prix barré + sites sans ItemList).
    const extractFrom = async (html: string, text: string, label: string, allowRetry: boolean): Promise<ExtractedProduct[]> => {
      const ld = parseListingItemList(html)
      if (ld.length) ctx.log('info', `${label} : ${ld.length} produit(s) via JSON-LD ItemList (déterministe).`)
      let llm: ExtractedProduct[] = []
      if (text.trim()) {
        try { llm = await extractProducts(ctx, text, label, allowRetry, (m) => modelsSeen.add(m)) }
        catch (err) { ctx.log('warn', `Extraction LLM échouée pour ${label} : ${err instanceof Error ? err.message : err}`) }
      }
      return mergeListing(ld, llm)
    }
    const scrapePage = async (url: string, site: string, isMainPage: boolean): Promise<ExtractedProduct[]> => {
      const { text, html } = await fetchListingContent(ctx, url)
      let products = await extractFrom(html, text, site, isMainPage)
      // Escalade rendu JS : une grille injectée 100 % côté client (ex Leroy Merlin) n'est
      // matérialisée ni par Jina ni par le Web Unlocker HTTP → 0 produit malgré un contenu
      // volumineux. Dernier recours : le Scraping Browser (Chrome distant) rend le DOM, on
      // ré-extrait. Ciblé page principale uniquement (cf. shouldEscalateToBrowser).
      if (shouldEscalateToBrowser(products.length, isMainPage)) {
        ctx.log('info', `${site} : 0 produit via Jina/Web Unlocker → escalade Scraping Browser (rendu JS).`)
        const rendered = (await scrapingBrowserRead(url)).html
        if (rendered.trim()) {
          const products2 = await extractFrom(rendered, htmlToText(rendered), `${site} (rendu JS)`, true)
          if (products2.length > 0) {
            ctx.log('info', `${site} : ${products2.length} produit(s) via Scraping Browser — grille rendue en JS (Web Unlocker insuffisant).`)
            products = products2
          }
        }
      }
      if (products.length === 0 && !text.trim()) { ctx.log('warn', `Aucun contenu pour ${url}.`); return [] }
      return products
    }

    for (const root of urls) {
      if (ctx.signal.aborted) break
      const site = hostOf(root)
      pushProducts(await scrapePage(root, site, true), site) // page 1 (principale)
      // Pages 2..maxPages par vagues — ARRÊT ANTICIPÉ dès qu'une vague n'apporte aucun
      // nouveau produit (site sans pagination / fin du catalogue) : évite de lire 20
      // pages quand il n'y en a que 1-3.
      let stop = false
      for (let k = 2; k <= maxPages && !stop && !ctx.signal.aborted; k += WAVE) {
        const sep = root.includes('?') ? '&' : '?'
        const batch: string[] = []
        for (let j = k; j < k + WAVE && j <= maxPages; j++) batch.push(`${root}${sep}${pageParam}=${j}`)
        const results = await mapLimit(batch, WAVE, (u) => scrapePage(u, site, false))
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
    const modelLabel = modelsSeen.size > 0 ? ` — extraction via ${[...modelsSeen].join(', ')}` : ''
    ctx.log('info', `Total : ${capped.length} produit(s) dédupliqué(s)${rows.length !== capped.length ? ` (cap ${max})` : ''}${modelLabel}.`)
    if (capped.length === 0) ctx.log('warn', 'Aucun produit extrait.')
    return { sheet: { columns: COLUMNS, rows: capped } }
  },
})
