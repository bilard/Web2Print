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
  listPrice?: number
  currency?: string
  inStock?: boolean
  reference?: string
  /** ⚠ Extrait par MODÈLE : affichage seul, jamais une preuve d'appariement. */
  seller?: string
  image?: string
}

const PRODUCT_SCHEMA = {
  type: 'object',
  properties: {
    name: { type: 'string', description: 'Nom / titre du produit' },
    price: { type: 'number', description: 'Prix de vente TTC affiché, en euros, nombre sans symbole (ex: 19.90)' },
    listPrice: { type: 'number', description: 'Prix barré avant remise, en euros. Omettre s\'il n\'y en a pas' },
    currency: { type: 'string', description: 'Devise ISO (EUR)' },
    inStock: { type: 'boolean', description: 'true si en stock / disponible, false si rupture' },
    reference: { type: 'string', description: 'Référence, SKU ou EAN affiché sur la fiche' },
    // Sur une marketplace, le domaine ne dit plus qui vend : une même fiche est proposée
    // par des marchands tiers à des prix différents. Sans ce champ, l'écart de prix
    // n'est pas interprétable — on ne sait pas à qui on se compare.
    seller: {
      type: 'string',
      description: 'Nom du VENDEUR de l\'offre (« Vendu par … »). Sur une marketplace c\'est le marchand tiers, pas le site. Omettre si la fiche ne le dit pas — ne jamais deviner',
    },
    image: { type: 'string', description: 'URL absolue de l\'image principale du produit' },
  },
}

/**
 * MUR DE CONSENTEMENT — exécuté dans la page AVANT l'extraction.
 *
 * Sans lui, amazon.fr ne rendait rien d'exploitable : Firecrawl n'extrayait que le
 * bandeau (« Continuer les achats »), jamais la fiche. Le blocage était connu et non
 * traité ; cdiscount et manomano, eux, passaient déjà.
 *
 * ⚠ `executeJavascript` plutôt qu'une suite de `click` : un `click` sur un sélecteur
 * ABSENT fait échouer l'action, donc le scrape entier — et la plupart des pages n'ont
 * aucun bandeau. Ici le script ne peut pas échouer : il essaie, et rend la main.
 *
 * Liste de sélecteurs de CMP (Didomi, OneTrust, Amazon…) puis repli par LIBELLÉ, jamais
 * de règle par marchand : un site inconnu qui affiche « Tout accepter » est traité comme
 * les autres. « Continuer sans accepter » est retenu au même titre — il lève le mur sans
 * poser de cookie.
 */
const DISMISS_CONSENT = `(() => {
  const SELECTORS = [
    '#sp-cc-accept', 'input[name="accept"]',
    '#didomi-notice-agree-button', '#onetrust-accept-btn-handler', '#axeptio_btn_acceptAll',
    'button[id*="accept-all" i]', 'button[class*="accept-all" i]',
    '[aria-label*="Tout accepter" i]', '[aria-label*="Accept all" i]',
  ]
  for (const s of SELECTORS) {
    const el = document.querySelector(s)
    if (el) { el.click(); return s }
  }
  const RX = /^(tout accepter|accepter et fermer|accepter tout|j'accepte|accept all|accept & close|continuer sans accepter)$/i
  for (const b of document.querySelectorAll('button, input[type="submit"], a[role="button"]')) {
    const txt = ((b.innerText || b.value || '') + '').trim()
    if (RX.test(txt)) { b.click(); return txt }
  }
  return null
})()`

/** Corps de requête. `withActions` à false = repli si l'API refuse les actions. */
function scrapeBody(url: string, withActions: boolean): string {
  return JSON.stringify({
    url,
    onlyMainContent: false,
    proxy: 'stealth', // IPs résidentielles + anti-bot
    formats: [{ type: 'json', schema: PRODUCT_SCHEMA }],
    ...(withActions
      ? {
          actions: [
            { type: 'executeJavascript', script: DISMISS_CONSENT },
            { type: 'wait', milliseconds: 1200 },
          ],
          // Les marketplaces servent un contenu — et un prix — différents selon le pays.
          location: { country: 'FR', languages: ['fr-FR'] },
        }
      : {}),
  })
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
    const call = (withActions: boolean) => fetch(FIRECRAWL_SCRAPE, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: scrapeBody(url, withActions),
      signal: ctrl.signal,
    })
    let res = await call(true)
    // ⚠ REPLI SANS ACTIONS. Cdiscount et manomano fonctionnaient DÉJÀ sans elles : si le
    // compte ou la version d'API refuse `actions`/`location` (4xx de requête), on ne peut
    // pas laisser cette tentative casser ce qui marchait. On rejoue une fois en nu. Un
    // 402/crédits ou un 5xx ne rejouent PAS — ce n'est pas la requête qui est en cause.
    if (res.status >= 400 && res.status < 500 && res.status !== 402 && res.status !== 429) {
      const body = await res.text().catch(() => '')
      if (isCreditError(res.status, body)) {
        tripCredits('firecrawl', `${res.status} ${body.slice(0, 120)}`)
        return null
      }
      logger.warn(`[firecrawl-product] ${res.status} avec actions pour ${url} — nouvel essai sans : ${body.slice(0, 160)}`)
      res = await call(false)
    }
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      if (isCreditError(res.status, body)) tripCredits('firecrawl', `${res.status} ${body.slice(0, 120)}`)
      else logger.warn(`[firecrawl-product] ${res.status} for ${url}: ${body.slice(0, 200)}`)
      return null
    }
    const json = (await res.json()) as { data?: { json?: GenericProduct } }
    const p = json.data?.json
    if (!p || typeof p !== 'object') return null
    // Normalise les prix (peuvent revenir en string malgré le schéma).
    const rec = p as Record<string, unknown>
    const num = (raw: unknown): number | undefined => {
      const n = typeof raw === 'number' ? raw
        : typeof raw === 'string' ? Number(raw.replace(/[^\d.,-]/g, '').replace(',', '.')) : NaN
      return isFinite(n) && n > 0 ? n : undefined
    }
    return {
      name: typeof p.name === 'string' ? p.name.trim() : undefined,
      price: num(rec.price),
      listPrice: num(rec.listPrice),
      currency: typeof p.currency === 'string' ? p.currency : undefined,
      inStock: typeof p.inStock === 'boolean' ? p.inStock : undefined,
      reference: typeof p.reference === 'string' ? p.reference.trim() : undefined,
      // Borné à 80 caractères : le modèle rend parfois la phrase entière (« Vendu par X et
      // expédié par Y »), qui déborderait la colonne sans rien apprendre de plus.
      seller: typeof p.seller === 'string' && p.seller.trim() ? p.seller.trim().slice(0, 80) : undefined,
      // Seule une adresse ABSOLUE est retenue : un chemin relatif rendu par le modèle
      // pointerait vers l'application elle-même.
      image: typeof p.image === 'string' && /^https?:\/\//i.test(p.image.trim()) ? p.image.trim() : undefined,
    }
  } catch (e) {
    logger.warn(`[firecrawl-product] network error for ${url}: ${e instanceof Error ? e.message : e}`)
    return null
  } finally {
    clearTimeout(t)
  }
}
