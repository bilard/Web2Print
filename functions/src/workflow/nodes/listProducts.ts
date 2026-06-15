// functions/src/workflow/nodes/listProducts.ts
// Jumeau SERVEUR (headless) du node client « Produits d'une page liste »
// (src/features/workflows/registry/listProductsNode.ts). Wire-compatible : mêmes
// clés de config (urls, maxProducts), même port de sortie `sheet`, mêmes colonnes
// {site, name, brand, ean, price, url}. Jina (mode listing) + UNE extraction LLM
// JSON par page. Pour le cron quotidien de comparaison de prix multi-sites.
import { registerServerNode } from '../registry'
import { jinaRead } from '../jina'
import { callLlm, parseLlmJson } from '../llm'

interface ExtractedProduct {
  name?: unknown
  brand?: unknown
  ean?: unknown
  price?: unknown
  url?: unknown
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

registerServerNode({
  type: 'list-products',
  run: async (ctx, config) => {
    const urls = parseUrls(config.urls)
    if (urls.length === 0) {
      ctx.log('warn', 'Aucune URL de page liste valide.')
      return { sheet: { columns: COLUMNS, rows: [] } }
    }
    const max = Math.max(0, Number(config.maxProducts) || 0)
    const rows: Record<string, unknown>[] = []
    let rowId = 0

    for (const url of urls) {
      if (ctx.signal.aborted) throw new Error('Run aborted')
      const site = hostOf(url)
      ctx.log('info', `Lecture page liste ${site}`)
      let content = ''
      try {
        content = (await jinaRead(ctx.uid, url, { listing: true })).content
      } catch (err) {
        ctx.log('warn', `Lecture échouée ${url} : ${err instanceof Error ? err.message : err}`)
        continue
      }
      if (!content.trim()) {
        ctx.log('warn', `Aucun contenu pour ${url}.`)
        continue
      }

      const prompt =
        'Voici le contenu MARKDOWN d’une page LISTE / catégorie e-commerce. Extrais TOUS les produits ' +
        'réellement listés (ignore menu, pied de page, bannières, blocs « vous aimerez aussi »). ' +
        'Réponds UNIQUEMENT par un objet JSON { "products": [ ... ] } où chaque produit a EXACTEMENT les clés : ' +
        'name (intitulé complet), brand (marque ou ""), ean (code EAN à 13 chiffres s’il apparaît dans l’URL ' +
        'de la fiche — ex « 4892210822604_CAFR.prd » — ou le nom de fichier image, sinon ""), ' +
        'price (prix de vente ACTUEL en euros, nombre ; si prix barré + promo, prends le prix promo), ' +
        'url (lien absolu de la fiche). Sois concis.\n\n--- CONTENU ---\n' +
        content.slice(0, 28000)
      let products: ExtractedProduct[] = []
      try {
        const { text } = await callLlm(ctx.uid, prompt)
        const parsed = parseLlmJson<{ products?: ExtractedProduct[] }>(text)
        products = Array.isArray(parsed?.products) ? parsed!.products! : []
      } catch (err) {
        ctx.log('warn', `Extraction LLM échouée pour ${site} : ${err instanceof Error ? err.message : err}`)
        continue
      }

      if (max > 0 && products.length > max) products = products.slice(0, max)
      for (const p of products) {
        const priceNum = parsePrice(p.price)
        const price = Number.isFinite(priceNum) && priceNum > 0 ? priceNum : parsePrice(p.name)
        rows.push({
          _id: `lp_${rowId++}`,
          site,
          name: String(p.name ?? '').trim(),
          brand: String(p.brand ?? '').trim(),
          ean: String(p.ean ?? '').replace(/\D/g, '').slice(0, 13),
          price: Number.isFinite(price) && price > 0 ? String(price) : '',
          url: String(p.url ?? '').trim(),
        })
      }
      ctx.log('info', `${products.length} produit(s) extrait(s) de ${site}.`)
    }

    if (rows.length === 0) ctx.log('warn', 'Aucun produit extrait.')
    return { sheet: { columns: COLUMNS, rows } }
  },
})
