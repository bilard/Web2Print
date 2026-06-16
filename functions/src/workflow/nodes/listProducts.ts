// functions/src/workflow/nodes/listProducts.ts
// Jumeau SERVEUR (headless) du node client « Produits d'une page liste »
// (src/features/workflows/registry/listProductsNode.ts). Wire-compatible : mêmes
// clés de config (urls, maxProducts), même port de sortie `sheet`, mêmes colonnes
// {site, name, brand, ean, price, url}. Jina (mode listing) + UNE extraction LLM
// JSON par page. Pour le cron quotidien de comparaison de prix multi-sites.
import { registerServerNode } from '../registry'
import { jinaRead } from '../jina'
import { brightDataRead, htmlToText } from '../brightData'
import { callLlm, parseLlmJson, recoverJsonObjects } from '../llm'

interface ExtractedProduct {
  name?: unknown
  brand?: unknown
  ean?: unknown
  price?: unknown
  url?: unknown
  image?: unknown
}

/** EAN robuste : l'EAN s'il fait 13 chiffres, sinon premier nombre de 13 chiffres
 *  trouvé dans l'image (Jardiland le cache dans le chemin image), puis l'URL, puis le nom. */
function resolveEan(ean: unknown, image: unknown, url: unknown, name: unknown): string {
  const clean = String(ean ?? '').replace(/\D/g, '')
  if (clean.length === 13) return clean
  for (const src of [image, url, name]) {
    const m = String(src ?? '').match(/\d{13}/)
    if (m) return m[0]
  }
  return ''
}

const COLUMNS = [
  { key: 'site', label: 'Site' },
  { key: 'name', label: 'Produit' },
  { key: 'brand', label: 'Marque' },
  { key: 'ean', label: 'EAN' },
  { key: 'price', label: 'Prix' },
  { key: 'url', label: 'URL' },
]

function parseUrls(raw: unknown): string[] {
  return String(raw ?? '')
    .split(/[\n,;]+/)
    .map((s) => s.trim())
    .filter((s) => /^https?:\/\//.test(s))
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

/** Parse « 1 299,90 € » → 1299.9 ; NaN si illisible. */
function parsePrice(v: unknown): number {
  if (typeof v === 'number') return v
  if (typeof v !== 'string') return NaN
  const cleaned = v.replace(/[\s€$£]/g, '').replace(',', '.').replace(/[^0-9.+-]/g, '')
  return cleaned ? parseFloat(cleaned) : NaN
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

/** Récupère le contenu d'une page liste : Jina (listing) → escalade Bright Data si vide. */
async function fetchListingContent(ctx: Ctx, url: string): Promise<string> {
  let content = ''
  try {
    content = (await jinaRead(ctx.uid, url, { listing: true })).content
  } catch (err) {
    ctx.log('warn', `Lecture Jina échouée ${url} : ${err instanceof Error ? err.message : err}`)
  }
  if (content.trim()) ctx.reportConnector?.('jina')
  if (!content.trim()) {
    try {
      ctx.log('info', `Jina sans contenu pour ${url} → escalade Bright Data.`)
      content = htmlToText((await brightDataRead(url)).html)
      if (content.trim()) ctx.reportConnector?.('brightdata')
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
    'name (intitulé complet), brand (marque ou ""), ean (code EAN à 13 chiffres s’il apparaît dans l’URL ' +
    'de la fiche — ex « 4892210822604_CAFR.prd » — ou le nom de fichier image, sinon ""), ' +
    'price (prix de vente ACTUEL en euros, nombre ; si prix barré + promo, prends le prix promo), ' +
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
    const urls = parseUrls(config.urls)
    if (urls.length === 0) {
      ctx.log('warn', 'Aucune URL de page liste valide.')
      return { sheet: { columns: COLUMNS, rows: [] } }
    }
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
        const key = `${site}|${url || name.toLowerCase()}`
        if (seen.has(key)) continue
        seen.add(key)
        const priceNum = parsePrice(p.price)
        const price = Number.isFinite(priceNum) && priceNum > 0 ? priceNum : parsePrice(p.name)
        rows.push({
          _id: `lp_${rowId++}`, site, name,
          brand: String(p.brand ?? '').trim(),
          ean: resolveEan(p.ean, p.image, p.url, p.name),
          price: Number.isFinite(price) && price > 0 ? String(price) : '',
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
    ctx.log('info', `Total : ${capped.length} produit(s) dédupliqué(s)${rows.length !== capped.length ? ` (cap ${max})` : ''}.`)
    if (capped.length === 0) ctx.log('warn', 'Aucun produit extrait.')
    return { sheet: { columns: COLUMNS, rows: capped } }
  },
})
