/**
 * Scraping léger d'une page produit pour alimenter la génération de design.
 *
 * Flux : URL détectée dans le prompt utilisateur → Jina Reader (r.jina.ai)
 * scrape la page → Claude extrait un petit JSON structuré (titre, prix,
 * features, imageUrl, marque). Les données remplacent le contenu "halluciné"
 * que Nano Banana aurait inventé autrement.
 */

import { getApiKey } from '@/lib/apiKeys'

export interface ScrapedProductData {
  title: string
  brand: string
  /** Domaine racine de la marque (ex: "jardiland.com") — sert à résoudre le logo. */
  brandDomain: string
  /** Prix actuel (ex: "169,99€"). */
  price?: string
  /** Prix barré d'origine (ex: "199,99€"). */
  oldPrice?: string
  /** Bullets de caractéristiques courtes (3-6 max). */
  features: string[]
  /** URL absolue de la photo produit principale. */
  imageUrl?: string
  /** Note moyenne (ex: "4.3"). */
  rating?: string
  /** Nombre d'avis (ex: "128"). */
  reviewCount?: string
  /** URL source — pour traçabilité. */
  sourceUrl: string
}

const URL_IN_TEXT_RE = /https?:\/\/[^\s\])>"'`]+/g

/** Retourne la première URL trouvée dans un texte libre, ou null. */
export function detectUrlInPrompt(prompt: string): string | null {
  const matches = prompt.match(URL_IN_TEXT_RE)
  if (!matches || matches.length === 0) return null
  // Trim ponctuation finale (., ,, !, ?) parfois attrapée par le regex.
  return matches[0].replace(/[.,!?;:]+$/, '')
}

/** Retire une URL exacte du prompt, nettoie les espaces orphelins. */
export function stripUrlFromPrompt(prompt: string, url: string): string {
  return prompt.replace(url, '').replace(/\s{2,}/g, ' ').trim()
}

function extractBrandDomain(url: string): string {
  try {
    const host = new URL(url).hostname.replace(/^www\./, '')
    return host
  } catch {
    return ''
  }
}

async function fetchJinaMarkdown(url: string): Promise<string | null> {
  const jinaKey = getApiKey('jina')
  const headers: Record<string, string> = {
    Accept: 'text/plain',
    'X-With-Images-Summary': 'true',
    'X-With-Links-Summary': 'true',
  }
  if (jinaKey) headers['Authorization'] = `Bearer ${jinaKey}`

  try {
    const res = await fetch(`https://r.jina.ai/${url}`, { headers })
    if (!res.ok) {
      console.warn(`[scrapeProductForDesign] Jina ${res.status}`, await res.text().catch(() => ''))
      return null
    }
    return await res.text()
  } catch (err) {
    console.warn('[scrapeProductForDesign] Jina fetch failed', err)
    return null
  }
}

const EXTRACTION_PROMPT = `Tu es un extracteur de données produit. À partir du markdown scrapé d'une page produit e-commerce, extrait un JSON strict avec les infos clés pour générer une affiche promotionnelle.

Règles :
- N'invente rien. Si un champ est absent, retourne null.
- title : titre COMPLET du produit (ex: "Tondeuse électrique 1800 W 40 cm RLM18E40H - RYOBI").
- brand : nom de la marque PRINCIPALE du produit (pas le revendeur). Ex: "RYOBI", pas "Jardiland".
- price : prix actuel promo avec le symbole (ex: "169,99€").
- oldPrice : prix barré d'origine si présent (ex: "199,99€"). null sinon.
- features : 3-6 bullets courts et factuels extraits des specs/caractéristiques produit (ex: "Puissance 1800 W", "Largeur de coupe 40 cm"). Pas de marketing vague.
- imageUrl : URL ABSOLUE (https://…) de la photo produit principale, haute résolution si possible. Choisis l'image héro, pas une miniature ou une bannière de site.
- rating : note sur 5 (ex: "4.3"). null si absent.
- reviewCount : nombre d'avis client (ex: "128"). null si absent.

Retourne UNIQUEMENT le JSON, pas de markdown, pas de narration :
{"title":"...","brand":"...","price":"...","oldPrice":"...","features":["...","..."],"imageUrl":"...","rating":"...","reviewCount":"..."}`

interface RawExtraction {
  title?: string | null
  brand?: string | null
  price?: string | null
  oldPrice?: string | null
  features?: unknown
  imageUrl?: string | null
  rating?: string | null
  reviewCount?: string | null
}

async function extractWithClaude(markdown: string): Promise<RawExtraction | null> {
  // Claude Opus a un context large ; 16k tokens de markdown = ~60k chars.
  // On limite pour éviter les pages énormes avec nav/footer/sidebar.
  const trimmed = markdown.slice(0, 60_000)

  const res = await fetch('/api/claude-vision', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'claude-opus-4-7',
      max_tokens: 2048,
      messages: [
        { role: 'user', content: `${EXTRACTION_PROMPT}\n\nMARKDOWN:\n${trimmed}` },
      ],
    }),
  })

  if (!res.ok) {
    console.warn('[scrapeProductForDesign] Claude extraction failed', res.status)
    return null
  }

  const data = (await res.json()) as { content?: Array<{ type: string; text?: string }> }
  const text = data.content?.find((c) => c.type === 'text')?.text?.trim()
  if (!text) return null

  let clean = text.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '')
  const start = clean.indexOf('{')
  const end = clean.lastIndexOf('}')
  if (start < 0 || end < 0) return null
  clean = clean.slice(start, end + 1)

  try {
    return JSON.parse(clean) as RawExtraction
  } catch (err) {
    console.warn('[scrapeProductForDesign] JSON parse failed', err)
    return null
  }
}

function normalizeFeatures(raw: unknown): string[] {
  if (!Array.isArray(raw)) return []
  return raw
    .filter((v): v is string => typeof v === 'string')
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && s.length < 200)
    .slice(0, 6)
}

export async function scrapeProductForDesign(url: string): Promise<ScrapedProductData | null> {
  console.log('[scrapeProductForDesign] scraping', url)

  const markdown = await fetchJinaMarkdown(url)
  if (!markdown) return null

  const extracted = await extractWithClaude(markdown)
  if (!extracted) return null

  const brandDomain = extractBrandDomain(url)

  const result: ScrapedProductData = {
    title: extracted.title?.trim() || '',
    brand: extracted.brand?.trim() || '',
    brandDomain,
    price: extracted.price?.trim() || undefined,
    oldPrice: extracted.oldPrice?.trim() || undefined,
    features: normalizeFeatures(extracted.features),
    imageUrl: extracted.imageUrl?.trim() || undefined,
    rating: extracted.rating?.trim() || undefined,
    reviewCount: extracted.reviewCount?.trim() || undefined,
    sourceUrl: url,
  }

  console.log('[scrapeProductForDesign] extracted', {
    title: result.title,
    brand: result.brand,
    brandDomain: result.brandDomain,
    price: result.price,
    features: result.features.length,
    imageUrl: result.imageUrl ? result.imageUrl.slice(0, 80) + '…' : '(none)',
  })

  return result
}
