// functions/src/workflow/nodes/priceWatchTrack.ts
// Jumeau SERVEUR (headless) du node price-watch-track — wire-compatible avec le
// node client. Prend une feuille de produits en ENTRÉE + des sites en config.
// Logique pure dupliquée depuis src/features/priceWatch/core.ts (les projets
// client/serveur ne partagent pas le code, cf. parsePrice).
import { getFirestore, FieldValue } from 'firebase-admin/firestore'
import { registerServerNode } from '../registry'
import { jinaRead, jinaSearch } from '../jina'
import { callLlm, parseLlmJson } from '../llm'
import { brightDataRead, htmlToText } from '../brightData'
import { fetchHtml } from '../../scraper/fetchHtml'
import { extractProductIdentity } from '../../scraper/extractProducts'

interface Product { id: string; sku?: string; ean?: string; name: string; brand?: string; myPrice?: number }
interface Site { id: string; domain: string; urlPattern?: string; fields?: string[] }
interface Alert { kind: string; productName: string; domain: string; message: string }

const HISTORY_MAX = 30
const MATCH_THRESHOLD = 0.7

export function relationalKey(p: Product): { kind: 'sku' | 'ean' | 'name'; value: string } {
  if (p.sku?.trim()) return { kind: 'sku', value: p.sku.trim() }
  if (p.ean?.trim()) return { kind: 'ean', value: p.ean.trim() }
  return { kind: 'name', value: [p.brand, p.name].filter(Boolean).join(' ').trim() }
}

export function buildPatternUrl(pattern: string | undefined, p: Product): string | null {
  if (!pattern?.trim()) return null
  const values: Record<string, string | undefined> = { sku: p.sku, ean: p.ean, name: p.name }
  let missing = false
  const url = pattern.replace(/\{(sku|ean|name)\}/g, (_m, k: string) => {
    const v = values[k]
    if (!v?.trim()) { missing = true; return '' }
    return encodeURIComponent(v.trim())
  })
  return missing ? null : url
}

export function discoveryQueries(domain: string, p: Product): string[] {
  const queries: string[] = []
  if (p.sku?.trim()) queries.push(`site:${domain} ${p.sku.trim()}`)
  else if (p.ean?.trim()) queries.push(`site:${domain} ${p.ean.trim()}`)
  const nameQuery = [p.brand, p.name].filter(Boolean).join(' ').trim()
  if (nameQuery) queries.push(`site:${domain} ${nameQuery}`)
  return queries
}

export function pickCandidate(
  results: { url: string; title?: string }[],
  domain: string,
  hints?: { sku?: string; ean?: string },
): string | null {
  const d = domain.replace(/^www\./, '')
  const onDomain = results.filter((r) => {
    try { return new URL(r.url).hostname.replace(/^www\./, '').endsWith(d) } catch { return false }
  })
  if (onDomain.length === 0) return null
  const sku = (hints?.sku ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '')
  const ean = (hints?.ean ?? '').replace(/\D/g, '')
  if (sku.length >= 4 || ean.length === 13) {
    const hit = onDomain.find((r) => {
      const hay = `${r.url} ${r.title ?? ''}`.toUpperCase().replace(/[^A-Z0-9]/g, '')
      return (sku.length >= 4 && hay.includes(sku)) || (ean.length === 13 && hay.includes(ean))
    })
    if (hit) return hit.url
  }
  return onDomain[0].url
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

/** Sur une chaîne à prix multiples (paire promo « 304,38€284,41€ »), renvoie le
 *  PLUS BAS : le prix facturé est toujours le plus bas, quel que soit l'ordre. */
export function parsePrice(v: unknown): number {
  if (typeof v === 'number') return v
  if (typeof v !== 'string') return NaN
  const tokens = [...v.replace(/\s/g, '').matchAll(/-?\d[\d.,]*\d|-?\d/g)]
    .map((m) => normalizePriceToken(m[0]))
    .filter((n) => Number.isFinite(n))
  return tokens.length ? Math.min(...tokens) : NaN
}

/** Page coquille / challenge anti-bot : trop courte ou marqueurs de blocage. */
function looksBlocked(text: string): boolean {
  if (text.replace(/\s/g, '').length < 500) return true
  return /captcha|datadome|access denied|verify you are human|just a moment|cf-browser-verification|px-captcha/i.test(text)
}

interface CompetitorReading { price: number | null; ean: string; name: string; content: string; blocked: boolean }

/**
 * Lit une fiche concurrent en PRIORITÉ via données structurées (JSON-LD :
 * offers.price + gtin13 + name), déterministe et sans LLM. Cascade :
 *   HTML brut (fetchHtml, cheap) → Bright Data si bloqué/sans JSON-LD → markdown Jina.
 * Jamais d'invention : si tout est bloqué, renvoie blocked=true (le caller SKIP).
 * `content` = texte pour la validation d'appariement (repli LLM).
 */
async function readCompetitorPage(uid: string, url: string): Promise<CompetitorReading> {
  const none: CompetitorReading = { price: null, ean: '', name: '', content: '', blocked: true }

  const fromHtml = (html: string): CompetitorReading | null => {
    if (!html.trim()) return null
    const text = htmlToText(html)
    if (looksBlocked(text)) return null
    const id = extractProductIdentity(html)
    return {
      price: id?.price ?? null, ean: id?.ean ?? '', name: id?.name ?? '',
      content: text.slice(0, 8000), blocked: false,
    }
  }

  // 1. HTML brut serveur (sans CORS, cheap) → JSON-LD.
  try {
    const r = fromHtml(await fetchHtml(url, 20000))
    if (r && (r.price != null || r.ean)) return r
  } catch { /* escalade */ }

  // 2. Bright Data (anti-bot) → JSON-LD.
  try {
    const r = fromHtml((await brightDataRead(url)).html)
    if (r) return r // contenu débloqué exploitable (même si JSON-LD partiel)
  } catch { /* repli Jina */ }

  // 3. Markdown Jina (dernier recours ; pas de JSON-LD → prix par repli LLM).
  try {
    const page = await jinaRead(uid, url)
    if (page.content.trim() && !looksBlocked(page.content)) {
      return { price: null, ean: '', name: page.title, content: page.content.slice(0, 8000), blocked: false }
    }
  } catch { /* rien d'exploitable */ }

  return none
}

export function stableId(value: string): string {
  return value.toLowerCase().replace(/[/#?[\]\s]+/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '').slice(0, 200) || 'x'
}

function cell(row: Record<string, unknown>, col: string | undefined): string | undefined {
  if (!col) return undefined
  const v = row[col]
  return v == null ? undefined : String(v).trim() || undefined
}

export function parseProductsFromSheet(
  rows: Record<string, unknown>[],
  map: { sku?: string; ean?: string; name?: string; brand?: string; price?: string },
): Product[] {
  const out: Product[] = []
  const seen = new Set<string>()
  for (const row of rows) {
    const name = cell(row, map.name) ?? ''
    const sku = cell(row, map.sku)
    const ean = cell(row, map.ean)
    const brand = cell(row, map.brand)
    if (!name && !sku && !ean) continue
    const priceRaw = cell(row, map.price)
    const myPrice = priceRaw != null ? parsePrice(priceRaw) : NaN
    const partial: Product = { id: 'x', name: name || (sku ?? ean ?? ''), sku, ean, brand }
    const id = stableId(relationalKey(partial).value)
    if (seen.has(id)) continue
    seen.add(id)
    out.push({ ...partial, id, myPrice: Number.isNaN(myPrice) ? undefined : myPrice })
  }
  return out
}

export function parseSitesConfig(text: string): Site[] {
  const out: Site[] = []
  const seen = new Set<string>()
  for (const line of (text ?? '').split('\n')) {
    const trimmed = line.trim()
    if (!trimmed) continue
    const [domainRaw, fieldsRaw] = trimmed.split('|')
    const domain = domainRaw.trim().replace(/^https?:\/\//, '').replace(/\/.*$/, '')
    if (!domain) continue
    const id = stableId(domain)
    if (seen.has(id)) continue
    seen.add(id)
    const fields = (fieldsRaw ?? '').split(',').map((f) => f.trim()).filter(Boolean)
    out.push({ id, domain, fields: fields.length ? fields : ['price'] })
  }
  return out
}

export function evaluate(
  product: { id: string; name: string; myPrice?: number },
  site: { id: string; domain: string },
  competitorPrice: number,
  previousPrice: number | undefined,
  thresholdPct: number,
): Alert[] {
  const alerts: Alert[] = []
  if (product.myPrice != null && competitorPrice < product.myPrice) {
    alerts.push({ kind: 'positioning', productName: product.name, domain: site.domain,
      message: `${product.name} : ${site.domain} à ${competitorPrice} € < votre prix ${product.myPrice} €` })
  }
  if (previousPrice != null && previousPrice !== competitorPrice) {
    const deltaPct = previousPrice === 0 ? 100 : Math.abs((competitorPrice - previousPrice) / previousPrice) * 100
    if (deltaPct >= thresholdPct) {
      alerts.push({ kind: 'competitor-variation', productName: product.name, domain: site.domain,
        message: `${product.name} : ${site.domain} ${previousPrice} € → ${competitorPrice} €` })
    }
  }
  return alerts
}

function alertsToSheet(alerts: Alert[]) {
  return {
    name: 'Alertes veille tarifaire',
    columns: [
      { key: 'product', label: 'Produit' }, { key: 'domain', label: 'Site' },
      { key: 'kind', label: 'Type' }, { key: 'message', label: 'Détail' },
    ],
    rows: alerts.map((a, i) => ({ _id: `alert_${i}`, product: a.productName, domain: a.domain, kind: a.kind, message: a.message })),
  }
}

registerServerNode({
  type: 'price-watch-track',
  run: async (ctx, config, inputs) => {
    const watchId = String(config.watchId || 'veille-1').trim().replace(/[/#?[\]]/g, '_')
    const thresholdPct = Math.max(0, Number(config.thresholdPct) || 0)
    const sheet = (inputs.products ?? {}) as { rows?: Record<string, unknown>[] }
    const products = parseProductsFromSheet(sheet.rows ?? [], {
      sku: String(config.skuColumn || 'sku'), ean: String(config.eanColumn || 'ean'),
      name: String(config.nameColumn || 'name'), brand: String(config.brandColumn || 'brand'),
      price: String(config.priceColumn || 'price'),
    })
    const sites = parseSitesConfig(String(config.sites || ''))
    if (products.length === 0) { ctx.log('warn', 'Aucun produit exploitable en entrée.'); return { all: alertsToSheet([]) } }
    if (sites.length === 0) { ctx.log('warn', 'Aucun site concurrent configuré.'); return { all: alertsToSheet([]) } }

    const fs = getFirestore()
    const base = `users/${ctx.uid}/priceWatch/${watchId}`
    const alerts: Alert[] = []
    for (const product of products) {
      for (const site of sites) {
        if (ctx.signal.aborted) break
        const key = `${product.id}__${site.id}`
        const matchRef = fs.doc(`${base}/matches/${key}`)
        const prev = (await matchRef.get()).data() as
          | { url?: string; status?: string; confidence?: number } | undefined
        if (prev?.status === 'rejected' || prev?.status === 'pending') continue

        let url = prev?.url ?? buildPatternUrl(site.urlPattern, product) ?? undefined
        if (!url) {
          for (const q of discoveryQueries(site.domain, product)) {
            const results = await jinaSearch(ctx.uid, q)
            const found = pickCandidate(results, site.domain, { sku: product.sku, ean: product.ean })
            if (found) { url = found; break }
          }
        }
        if (!url) { ctx.log('info', `Aucune page : ${product.name} @ ${site.domain}`); continue }

        // Lecture STRUCTURÉE d'abord (JSON-LD : prix canonique + EAN, jamais inventés).
        const read = await readCompetitorPage(ctx.uid, url)
        if (read.blocked) { ctx.log('warn', `Page bloquée/vide (anti-bot), aucun relevé : ${url}`); continue }
        let price = read.price ?? NaN
        // Repli LLM UNIQUEMENT si pas de prix structuré (page sans JSON-LD).
        if (Number.isNaN(price) && read.content) {
          const extractPrompt =
            `Extrait le prix de vente ACTUEL de cette page (si prix barré + promo, prends le plus bas). ` +
            `Réponds UNIQUEMENT {"price": "..."}.\n\n${read.content}`
          price = parsePrice(parseLlmJson<{ price?: unknown }>((await callLlm(ctx.uid, extractPrompt)).text)?.price)
        }
        if (Number.isNaN(price)) { ctx.log('info', `Prix illisible : ${url}`); continue }

        const display = { productName: product.name, domain: site.domain, myPrice: product.myPrice ?? null }
        const competitor = { competitorEan: read.ean || null, competitorName: read.name || null }

        if (!prev?.url || (prev.status !== 'auto' && prev.status !== 'confirmed')) {
          // EAN identique = appariement autoritaire (confiance 1, pas d'appel LLM).
          const eanMatch = !!product.ean && read.ean === product.ean.replace(/\D/g, '')
          let verdict = eanMatch ? 1 : 0
          if (!eanMatch) {
            const matchPrompt =
              `Cette page décrit-elle EXACTEMENT : nom="${product.name}", marque="${product.brand ?? ''}", ` +
              `sku="${product.sku ?? ''}", ean="${product.ean ?? ''}" ? Réponds UNIQUEMENT {"confidence": 0..1}.\n\n` +
              `${read.content.slice(0, 6000)}`
            verdict = Math.max(0, Math.min(1,
              Number(parseLlmJson<{ confidence?: unknown }>((await callLlm(ctx.uid, matchPrompt)).text)?.confidence) || 0))
          }
          const status = verdict >= MATCH_THRESHOLD ? 'auto' : 'pending'
          await matchRef.set({ productId: product.id, siteId: site.id, url, confidence: verdict, status,
            lastPrice: price, lastDiscoveredAt: Date.now(), updatedAt: FieldValue.serverTimestamp(), ...display, ...competitor }, { merge: true })
          if (status === 'pending') { ctx.log('info', `À confirmer (${verdict}) : ${product.name} @ ${site.domain}`); continue }
        }

        const histRef = fs.doc(`${base}/history/${key}`)
        const history = ((await histRef.get()).data()?.values ?? []) as { price: number; at: number }[]
        const previousPrice = history.length ? history[history.length - 1].price : undefined
        const nextHistory = [...history, { price, at: Date.now() }].slice(-HISTORY_MAX)
        await histRef.set({ values: nextHistory })
        await matchRef.set({ lastPrice: price, updatedAt: FieldValue.serverTimestamp(), ...display, ...competitor }, { merge: true })
        alerts.push(...evaluate(product, site, price, previousPrice, thresholdPct))
      }
    }

    const all = alertsToSheet(alerts)
    if (alerts.length === 0) { ctx.log('info', 'Aucune alerte.'); return { all } }
    ctx.log('info', `${alerts.length} alerte(s) — port « changes » émis.`)
    return { changes: all, all }
  },
})
