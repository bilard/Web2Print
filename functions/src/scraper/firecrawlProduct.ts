// functions/src/scraper/firecrawlProduct.ts
// Extraction PRODUIT générique (toute techno, y compris SPA JS + anti-bot) via Firecrawl
// v2 /scrape en mode `json` : Firecrawl rend le JS, franchit l'anti-bot (proxy stealth),
// et renvoie directement { name, price, currency, inStock, reference } selon le schéma.
// Utilisé par la recherche dirigée pour les marketplaces (cdiscount, kramp…) où le HTML
// brut ne contient pas les prix (chargés en JS) — cf. project_price_watch_generic_any_tech.
import * as logger from 'firebase-functions/logger'
import { creditsExhausted, isCreditError, tripCredits } from './creditBreaker'

const FIRECRAWL_SCRAPE = 'https://api.firecrawl.dev/v2/scrape'

export interface GenericProduct {
  name?: string
  price?: number
  currency?: string
  inStock?: boolean
  reference?: string
}

const PRODUCT_SCHEMA = {
  type: 'object',
  properties: {
    name: { type: 'string', description: 'Nom / titre du produit' },
    price: { type: 'number', description: 'Prix de vente TTC affiché, en euros, nombre sans symbole (ex: 19.90)' },
    currency: { type: 'string', description: 'Devise ISO (EUR)' },
    inStock: { type: 'boolean', description: 'true si en stock / disponible, false si rupture' },
    reference: { type: 'string', description: 'Référence, SKU ou EAN affiché sur la fiche' },
  },
}

/**
 * Scrape+extrait UNE fiche produit via Firecrawl (rendu JS + anti-bot). Renvoie null si
 * la clé manque, si l'API échoue, ou si aucun prix n'est extrait (pas une fiche produit).
 */
export async function firecrawlScrapeProduct(url: string, apiKey: string, timeoutMs = 70_000): Promise<GenericProduct | null> {
  if (!apiKey || creditsExhausted('firecrawl')) return null
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    const res = await fetch(FIRECRAWL_SCRAPE, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        url,
        onlyMainContent: false,
        proxy: 'stealth', // IPs résidentielles + anti-bot
        formats: [{ type: 'json', schema: PRODUCT_SCHEMA }],
      }),
      signal: ctrl.signal,
    })
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      if (isCreditError(res.status, body)) tripCredits('firecrawl', `${res.status} ${body.slice(0, 120)}`)
      else logger.warn(`[firecrawl-product] ${res.status} for ${url}: ${body.slice(0, 200)}`)
      return null
    }
    const json = (await res.json()) as { data?: { json?: GenericProduct } }
    const p = json.data?.json
    if (!p || typeof p !== 'object') return null
    // Normalise le prix (peut revenir en string malgré le schéma).
    const priceRaw: unknown = (p as Record<string, unknown>).price
    const price = typeof priceRaw === 'number' ? priceRaw
      : typeof priceRaw === 'string' ? Number(priceRaw.replace(/[^\d.,-]/g, '').replace(',', '.')) : undefined
    return {
      name: typeof p.name === 'string' ? p.name.trim() : undefined,
      price: price != null && isFinite(price) && price > 0 ? price : undefined,
      currency: typeof p.currency === 'string' ? p.currency : undefined,
      inStock: typeof p.inStock === 'boolean' ? p.inStock : undefined,
      reference: typeof p.reference === 'string' ? p.reference.trim() : undefined,
    }
  } catch (e) {
    logger.warn(`[firecrawl-product] network error for ${url}: ${e instanceof Error ? e.message : e}`)
    return null
  } finally {
    clearTimeout(t)
  }
}
