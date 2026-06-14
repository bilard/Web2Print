// functions/src/workflow/nodes/priceWatchTrack.ts
// Jumeau SERVEUR (headless) du node price-watch-track — wire-compatible avec le
// node client. Logique pure dupliquée depuis src/features/priceWatch/core.ts
// (les projets client/serveur ne partagent pas le code, cf. parsePrice).
import { getFirestore, FieldValue } from 'firebase-admin/firestore'
import { registerServerNode } from '../registry'
import { jinaRead, jinaSearch } from '../jina'
import { callLlm, parseLlmJson } from '../llm'

interface Product { id: string; sku?: string; ean?: string; name: string; brand?: string; myPrice?: number }
interface Site { id: string; domain: string; urlPattern?: string }
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

export function pickCandidate(results: { url: string }[], domain: string): string | null {
  const d = domain.replace(/^www\./, '')
  const hit = results.find((r) => {
    try { return new URL(r.url).hostname.replace(/^www\./, '').endsWith(d) } catch { return false }
  })
  return hit?.url ?? null
}

function parsePrice(v: unknown): number {
  if (typeof v === 'number') return v
  if (typeof v !== 'string') return NaN
  const cleaned = v.replace(/[\s€$£]/g, '').replace(',', '.').replace(/[^0-9.+-]/g, '')
  return cleaned ? parseFloat(cleaned) : NaN
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
  run: async (ctx, config) => {
    const watchId = String(config.watchId || 'veille-1').trim().replace(/[/#?[\]]/g, '_')
    const thresholdPct = Math.max(0, Number(config.thresholdPct) || 0)
    const fs = getFirestore()
    const base = `users/${ctx.uid}/priceWatch/${watchId}`
    const [productsSnap, sitesSnap] = await Promise.all([
      fs.collection(`${base}/products`).get(),
      fs.collection(`${base}/sites`).get(),
    ])
    const products = productsSnap.docs.map((d) => ({ id: d.id, ...d.data() })) as Product[]
    const sites = sitesSnap.docs.map((d) => ({ id: d.id, ...d.data() })) as Site[]
    if (products.length === 0 || sites.length === 0) {
      ctx.log('warn', 'Catalogue ou sites vides — rien à surveiller.')
      return { all: alertsToSheet([]) }
    }

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
            const found = pickCandidate(results, site.domain)
            if (found) { url = found; break }
          }
        }
        if (!url) { ctx.log('info', `Aucune page : ${product.name} @ ${site.domain}`); continue }

        let page: { title: string; content: string }
        try { page = await jinaRead(ctx.uid, url) } catch (e) { ctx.log('error', `Read échoué ${url}: ${String(e)}`); continue }
        const extractPrompt =
          `Extrait le prix de cette page. Réponds UNIQUEMENT {"price": "..."}.\n\n${page.content.slice(0, 8000)}`
        const extracted = parseLlmJson<{ price?: unknown }>((await callLlm(ctx.uid, extractPrompt)).text)
        const price = parsePrice(extracted?.price)
        if (Number.isNaN(price)) { ctx.log('info', `Prix illisible : ${url}`); continue }

        if (!prev?.url || (prev.status !== 'auto' && prev.status !== 'confirmed')) {
          const matchPrompt =
            `Cette page décrit-elle EXACTEMENT : nom="${product.name}", marque="${product.brand ?? ''}", ` +
            `sku="${product.sku ?? ''}", ean="${product.ean ?? ''}" ? Réponds UNIQUEMENT {"confidence": 0..1}.\n\n` +
            `${page.content.slice(0, 6000)}`
          const verdict = Math.max(0, Math.min(1,
            Number(parseLlmJson<{ confidence?: unknown }>((await callLlm(ctx.uid, matchPrompt)).text)?.confidence) || 0))
          const status = verdict >= MATCH_THRESHOLD ? 'auto' : 'pending'
          await matchRef.set({ productId: product.id, siteId: site.id, url, confidence: verdict, status,
            lastPrice: price, lastDiscoveredAt: Date.now(), updatedAt: FieldValue.serverTimestamp() }, { merge: true })
          if (status === 'pending') { ctx.log('info', `À confirmer (${verdict}) : ${product.name} @ ${site.domain}`); continue }
        }

        const histRef = fs.doc(`${base}/history/${key}`)
        const history = ((await histRef.get()).data()?.values ?? []) as { price: number; at: number }[]
        const previousPrice = history.length ? history[history.length - 1].price : undefined
        const nextHistory = [...history, { price, at: Date.now() }].slice(-HISTORY_MAX)
        await histRef.set({ values: nextHistory })
        await matchRef.set({ lastPrice: price, updatedAt: FieldValue.serverTimestamp() }, { merge: true })
        alerts.push(...evaluate(product, site, price, previousPrice, thresholdPct))
      }
    }

    const all = alertsToSheet(alerts)
    if (alerts.length === 0) { ctx.log('info', 'Aucune alerte.'); return { all } }
    ctx.log('info', `${alerts.length} alerte(s) — port « changes » émis.`)
    return { changes: all, all }
  },
})
