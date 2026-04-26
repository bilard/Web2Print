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

/**
 * Récupère le HTML brut via Jina (X-Return-Format: html). Utilisé en fallback
 * quand le markdown Jina filtre les images (Brico Dépôt, etc.) — le HTML conserve
 * les balises <img> et meta tags qui contiennent l'URL produit.
 */
async function fetchJinaHtml(url: string): Promise<string | null> {
  const jinaKey = getApiKey('jina')
  const headers: Record<string, string> = {
    Accept: 'text/html',
    'X-Return-Format': 'html',
  }
  if (jinaKey) headers['Authorization'] = `Bearer ${jinaKey}`

  try {
    const res = await fetch(`https://r.jina.ai/${url}`, { headers })
    if (!res.ok) {
      console.warn(`[scrapeProductForDesign] Jina HTML ${res.status}`)
      return null
    }
    return await res.text()
  } catch (err) {
    console.warn('[scrapeProductForDesign] Jina HTML fetch failed', err)
    return null
  }
}

/**
 * Extrait l'URL d'image produit depuis le HTML brut, par ordre de fiabilité :
 *  1. <img itemprop="image"> — microdata schema.org Product
 *  2. <meta property="og:image"> — Open Graph
 *  3. JSON-LD "image" — JSON structuré schema.org
 *  4. Première <img> avec URL "produit-like" (.jpg/.png/.webp, hors logos/banners)
 *
 * Retourne null si aucun candidat plausible. Aucun matching vendor-spécifique.
 */
export function extractImageFromHtml(html: string): string | null {
  // 1. Schema.org microdata
  const microdataMatch = html.match(/<img[^>]+itemprop=["']image["'][^>]*\bsrc=["']([^"']+)["']/i)
                       || html.match(/<img[^>]+\bsrc=["']([^"']+)["'][^>]+itemprop=["']image["']/i)
  if (microdataMatch && isLikelyProductImage(microdataMatch[1])) {
    return cleanImageUrl(microdataMatch[1])
  }

  // 2. Open Graph
  const ogMatch = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i)
                || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i)
  if (ogMatch && isLikelyProductImage(ogMatch[1])) {
    return cleanImageUrl(ogMatch[1])
  }

  // 3. JSON-LD "image" (peut être une string ou un array de strings)
  const jsonLdMatch = html.match(/"image"\s*:\s*"([^"]+)"/)
                    || html.match(/"image"\s*:\s*\[\s*"([^"]+)"/)
  if (jsonLdMatch && isLikelyProductImage(jsonLdMatch[1])) {
    return cleanImageUrl(jsonLdMatch[1])
  }

  // 4. Heuristique : première <img> avec extension image et URL "longue"
  // (filtre logos courts et trackers).
  const imgRe = /<img[^>]+\bsrc=["']([^"']+\.(?:jpg|jpeg|png|webp)(?:\?[^"']*)?)["']/gi
  let m: RegExpExecArray | null
  while ((m = imgRe.exec(html)) !== null) {
    if (isLikelyProductImage(m[1])) {
      return cleanImageUrl(m[1])
    }
  }

  return null
}

/**
 * Filtre les URLs qui ressemblent à des logos, trackers, banners, icons.
 * Heuristique générique sans liste de marques.
 */
export function isLikelyProductImage(url: string): boolean {
  if (!url || !url.startsWith('http')) return false
  const lower = url.toLowerCase()
  // Exclure logos, favicons, bannières, trackers, badges, illustrations annexes.
  // Couvre EN + FR : "banner"/"bandeau"/"bannière", "logo"/"didomi", etc.
  const exclusionPatterns = [
    'logo', 'favicon', 'sprite', 'pixel', 'tracker', 'analytics',
    'didomi', 'cookies', 'banner', 'bandeau', 'banniere', 'bannière',
    'placeholder', '.svg', 'arrivages',
  ]
  if (exclusionPatterns.some((p) => lower.includes(p))) return false
  // Exclure les URLs avec dimensions petites (icônes 16x16 → 100x100)
  if (lower.match(/\b(100x100|50x50|32x32|16x16|24x24|74x74)\b/)) return false
  // Exclure les fichiers trop petits identifiables par taille typique de logo (≤120px)
  if (lower.match(/\b(\d{2,3})x(\d{2,3})\b/)) {
    const [, w, h] = lower.match(/\b(\d{2,3})x(\d{2,3})\b/)!
    if (parseInt(w, 10) <= 120 && parseInt(h, 10) <= 120) return false
  }
  return true
}

function cleanImageUrl(url: string): string {
  // Garde les query strings (souvent des cache busters utiles)
  // mais trim espaces accidentels.
  return url.trim()
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

const FEATURE_BLACKLIST_PATTERNS: RegExp[] = [
  /^#+\s/,                                      // markdown headings
  /^★+/,                                        // strings starting with stars only
  /\bAvis\s+clients?\b/i,                       // "Avis client" / "Avis clients"
  /\bAucun(?:e)?\s+(?:valeur|avis|note)\b/i,    // "Aucune valeur de notation", "Aucun avis"
  /\bNote\s+moyenne\b/i,                        // "Note moyenne"
  /\bFiltrer\s+par\b/i,                         // "Filtrer par Note"
  /\b[Éé]valuation\b/i,                         // "Évaluation"
  /^\s*\d+\s*$/,                                // lines that are JUST numbers
  /^(?:Caractéristiques?|Description|Spécifications?|Détails)\s*:?\s*$/i,  // section labels alone
]

function isParasiticFeature(s: string): boolean {
  return FEATURE_BLACKLIST_PATTERNS.some((re) => re.test(s))
}

function normalizeFeatures(raw: unknown): string[] {
  if (!Array.isArray(raw)) return []
  return raw
    .filter((v): v is string => typeof v === 'string')
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && s.length < 200)
    .filter((s) => !isParasiticFeature(s))
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

/**
 * Fallback regex pour le prix. Couvre les principaux formats français :
 *  - "699€00" (Brico Dépôt)
 *  - "699,00 €" / "699,00€" (Jardiland, Castorama, Leroy Merlin)
 *  - "1 299,99 €" (chiffres avec espace)
 * Cherche la PREMIÈRE occurrence (la plus proche du titre dans le markdown).
 */
function extractPriceFromMarkdown(markdown: string): string | null {
  // Format Brico Dépôt : 699€00
  const m1 = markdown.match(/\b(\d{1,4})€(\d{2})\b/)
  if (m1) return `${m1[1]}€${m1[2]}`
  // Format standard : 699,00 € ou 699,00€ ou 1 299,99 €
  const m2 = markdown.match(/\b(\d{1,3}(?:[\s ]\d{3})*),(\d{2})\s*€/)
  if (m2) return `${m2[1]},${m2[2]} €`
  // Format simple : 699 € (sans cents)
  const m3 = markdown.match(/\b(\d{2,5})\s*€\b/)
  if (m3) return `${m3[1]} €`
  return null
}

/**
 * Fallback regex pour features. Beaucoup de pages e-commerce listent les
 * caractéristiques sans bullet markdown. On extrait les lignes courtes (< 200
 * chars) après les sections typiques. Heuristique générique sans vendor-spécifique.
 */
function extractFeaturesFromMarkdown(markdown: string): string[] {
  const sectionRe = /(?:^|\n)\s*(?:Description|Caractéristiques|Points forts|Spécifications|Points-clés|Points cl[ée]s)\s*:?\s*\n+([\s\S]+?)(?:\n\n[A-Z][^\n]{0,40}\n|$)/i
  const m = markdown.match(sectionRe)
  if (!m) return []
  const block = m[1]
  return block
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && l.length < 200)
    .filter((l) => !l.startsWith('*') && !l.match(/^\(\d/) && !l.match(/^https?:\/\//))
    .slice(0, 6)
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

  // Image URL : pipeline avec VALIDATION à chaque étape.
  // Claude peut halluciner des URLs (logos cookie banners, assets génériques) —
  // on ne lui fait pas confiance aveuglément, on filtre via isLikelyProductImage.
  let finalImageUrl: string | undefined
  let finalImageSource: 'claude' | 'markdown-regex' | 'html-fallback' | 'none' = 'none'
  const claudeImg = extracted?.imageUrl?.trim()
  if (claudeImg && isLikelyProductImage(claudeImg)) {
    finalImageUrl = claudeImg
    finalImageSource = 'claude'
    console.log('[scrapeProductForDesign] Image source: Claude extraction →', claudeImg)
  } else if (claudeImg) {
    console.warn('[scrapeProductForDesign] Claude returned suspicious imageUrl, rejected:', claudeImg)
  }

  if (!finalImageUrl) {
    const regexImg = extractFirstImageUrlFromMarkdown(markdown)
    if (regexImg && isLikelyProductImage(regexImg)) {
      finalImageUrl = regexImg
      finalImageSource = 'markdown-regex'
      console.log('[scrapeProductForDesign] Image source: markdown regex →', regexImg)
    } else if (regexImg) {
      console.warn('[scrapeProductForDesign] Markdown regex returned suspicious imageUrl, rejected:', regexImg)
    }
  }

  // Fallback HTML : Jina filtre parfois les images du markdown (Brico Dépôt).
  // Le HTML brut contient encore les <img itemprop="image">, og:image, JSON-LD.
  if (!finalImageUrl) {
    console.log('[scrapeProductForDesign] No image in markdown, trying HTML fallback')
    const html = await fetchJinaHtml(url)
    if (html) {
      const fromHtml = extractImageFromHtml(html)
      if (fromHtml && isLikelyProductImage(fromHtml)) {
        finalImageUrl = fromHtml
        finalImageSource = 'html-fallback'
        console.log('[scrapeProductForDesign] Image source: HTML fallback →', fromHtml)
      } else if (fromHtml) {
        console.warn('[scrapeProductForDesign] HTML fallback returned suspicious imageUrl, rejected:', fromHtml)
      }
    }
  }

  // Garde-fou final : si une URL fautive a fuité (regex bug, branche manquante,
  // etc.), on la bloque ici. Mieux vaut undefined que "logo géant à la place
  // de la photo produit".
  if (finalImageUrl && !isLikelyProductImage(finalImageUrl)) {
    console.error('[scrapeProductForDesign] FINAL imageUrl failed isLikelyProductImage check, dropping:', finalImageUrl)
    finalImageUrl = undefined
    finalImageSource = 'none'
  }
  console.log('[scrapeProductForDesign] resolved imageUrl:', { source: finalImageSource, url: finalImageUrl ?? '(none)' })

  // Le titre est le seul champ vraiment indispensable. Sans titre, on ne peut
  // rien composer. Sans imageUrl, compose-direct peut quand même rendre le
  // design avec un placeholder image (price/features/avis sont alors visibles).
  if (!finalTitle) {
    console.warn('[scrapeProductForDesign] Missing required field: title', {
      claudeTitle: extracted?.title,
      regexTitle: extractTitleFromMarkdown(markdown),
    })
    return null
  }

  const brandDomain = extractBrandDomain(url)

  // Fallbacks regex pour prix et features si Claude extraction a manqué.
  // En production opus-4-7 peut renvoyer null sur certains formats non
  // standards (Brico Dépôt 699€00) ou être quota-limited.
  const finalPrice = extracted?.price?.trim() || extractPriceFromMarkdown(markdown) || undefined
  const claudeFeatures = normalizeFeatures(extracted?.features)
  const finalFeatures = claudeFeatures.length > 0 ? claudeFeatures : extractFeaturesFromMarkdown(markdown)

  const result: ScrapedProductData = {
    title: finalTitle,
    brand: extracted?.brand?.trim() || '',
    brandDomain,
    price: finalPrice,
    oldPrice: extracted?.oldPrice?.trim() || undefined,
    features: finalFeatures,
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
    priceSource: extracted?.price ? 'claude' : (finalPrice ? 'regex' : 'none'),
    oldPrice: result.oldPrice,
    rating: result.rating,
    reviewCount: result.reviewCount,
    features: result.features.length,
    featuresSource: claudeFeatures.length > 0 ? 'claude' : (finalFeatures.length > 0 ? 'regex' : 'none'),
    imageUrl: result.imageUrl ? result.imageUrl.slice(0, 80) + '…' : '(none)',
  })

  return result
}
