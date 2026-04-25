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

const EXTRACTION_PROMPT = `Tu es un extracteur strict de données produit e-commerce. À partir du markdown scrapé d'une page produit, extrait UNIQUEMENT les valeurs réellement présentes dans le texte fourni.

RÈGLES ABSOLUES :
- N'invente JAMAIS. Si une valeur n'est pas littéralement dans le markdown, retourne null.
- N'invente JAMAIS de prix, de note, ou de nombre d'avis. Recopie verbatim ce qui est dans le markdown.
- Ne déduis pas, ne calcule pas, ne suppose pas.
- Si tu hésites, retourne null plutôt qu'une valeur approximative.

Champs à extraire :

- title : titre COMPLET et exact du produit tel qu'il apparaît dans le markdown (généralement le H1 ou la première ligne sous "Title:").

- brand : nom de la marque PRINCIPALE (fabricant), PAS du revendeur. Repérable dans le titre ou les specs. Si non identifiable, retourne null.

- price : prix actuel exact, format "XXX,XX €" ou "XX,XX€". Localise-le près du titre produit ou dans la zone "Points forts" / "promo". Si plusieurs prix sont visibles (offres partenaires, etc.), prends le PREMIER affiché à proximité du titre principal. Recopie EXACTEMENT (espaces et symbole inclus). null si absent.

- oldPrice : prix d'origine barré (avant promo). Apparaît juste à côté du prix actuel, souvent suivi d'un montant de réduction (ex: "- 11,00 €"). Recopie EXACTEMENT. null si pas de promo visible.

- features : 3-6 caractéristiques courtes extraites de la section "Points forts" / "Caractéristiques" / "Description". Recopie textuellement les bullets. Pas de paraphrasage marketing.

- imageUrl : la PREMIÈRE URL d'image produit dans le markdown (format markdown ![alt](url)). Vérifie que l'URL commence par https:// et pointe vers un CDN d'image (jpg/png/webp). Si la page contient plusieurs images du même produit, prends la PREMIÈRE listée.

- rating : note moyenne du produit, format "X.X" ou "X.XX". Cherche un pattern "X.X/5", "X.XX/5", ou phrase type "Note moyenne". Recopie le chiffre tel quel. ATTENTION : ne confonds pas avec une note d'un avis individuel ("5/5" d'un client unique) ; cherche la moyenne globale. null si absente.

- reviewCount : nombre total d'avis clients. Cherche un pattern type "Note moyenne sur X de nos clients" ou "X avis". Extrais l'entier. null si absent.

Retourne UNIQUEMENT le JSON valide, sans markdown ni narration :
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

function isValidUrl(urlStr: string): boolean {
  try {
    const url = new URL(urlStr)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}

/** Fallback regex : extrait la PREMIÈRE URL d'image du markdown si Claude a raté. */
function extractFirstImageUrlFromMarkdown(markdown: string): string | null {
  // Format markdown: ![alt](https://...jpg|png|webp)
  const re = /!\[[^\]]*\]\((https?:\/\/[^\s)]+\.(?:jpg|jpeg|png|webp)(?:\?[^\s)]*)?)\)/i
  const match = markdown.match(re)
  return match ? match[1] : null
}

/** Fallback : extrait le titre depuis "Title:" header ou premier H1 du markdown. */
function extractTitleFromMarkdown(markdown: string): string | null {
  const titleMatch = markdown.match(/^Title:\s*(.+)$/m)
  if (titleMatch) return titleMatch[1].trim()
  const h1Match = markdown.match(/^#\s+(.+)$/m)
  if (h1Match) return h1Match[1].trim()
  return null
}

export async function scrapeProductForDesign(url: string): Promise<ScrapedProductData | null> {
  if (!isValidUrl(url)) {
    console.warn('[scrapeProductForDesign] Invalid URL format:', url)
    return null
  }

  console.log('[scrapeProductForDesign] scraping', url)

  const markdown = await fetchJinaMarkdown(url)
  if (!markdown) {
    console.warn('[scrapeProductForDesign] Jina returned empty markdown')
    return null
  }

  const extracted = await extractWithClaude(markdown)
  // On NE bloque pas si extracted est null — on utilise les fallbacks regex pour title/imageUrl

  // Fallback regex pour les champs critiques si Claude a manqué
  const finalTitle = extracted?.title?.trim() || extractTitleFromMarkdown(markdown) || ''
  const finalImageUrl = extracted?.imageUrl?.trim() || extractFirstImageUrlFromMarkdown(markdown) || undefined

  if (!finalTitle || !finalImageUrl) {
    console.warn('[scrapeProductForDesign] Missing required fields after fallback (title or imageUrl)', {
      claudeTitle: extracted?.title,
      regexTitle: extractTitleFromMarkdown(markdown),
      claudeImage: extracted?.imageUrl,
      regexImage: extractFirstImageUrlFromMarkdown(markdown),
    })
    return null
  }

  const brandDomain = extractBrandDomain(url)

  const result: ScrapedProductData = {
    title: finalTitle,
    brand: extracted?.brand?.trim() || '',
    brandDomain,
    price: extracted?.price?.trim() || undefined,
    oldPrice: extracted?.oldPrice?.trim() || undefined,
    features: normalizeFeatures(extracted?.features),
    imageUrl: finalImageUrl,
    rating: extracted?.rating?.trim() || undefined,
    reviewCount: extracted?.reviewCount?.trim() || undefined,
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
