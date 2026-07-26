// Récupération du contenu brut d'une page produit : Jina Reader en premier,
// repli HTML direct ensuite.
//
// C'est la porte d'entrée réseau du moteur d'enrichissement. Les replis
// successifs existent parce qu'aucune source n'est fiable seule : Jina rend un
// markdown propre mais échoue sur certains sites, le fetch HTML passe parfois
// là où Jina bute. L'ordre des tentatives se modifie avec précaution.
import { debugLog } from '@/lib/debugLog'
import { getApiKey } from '@/lib/apiKeys'
import { sanitizeJinaMarkdown } from './markdownSanitize'
import { extractSpecsFromHtml as extractSpecsFromHtmlExternal, parseSpecsFromMarkdown } from '@/features/scraping/core/parsers/parseSpecifications'
import { recordScrapeUsage } from '@/features/stats/aiUsageTracking'


/**
 * Scrape une page via Jina Reader (r.jina.ai) → markdown.
 */
export async function jinaScrapeMarkdown(pageUrl: string): Promise<string | null> {
  debugLog('[jina-reader] scraping →', pageUrl)
  const jinaKey = getApiKey('jina')

  // Utiliser le mode JSON (comme useJina.ts) — retourne le markdown + images map + links map
  const headers: Record<string, string> = {
    Accept: 'application/json',
    'X-With-Links-Summary': 'true',
    'X-With-Images-Summary': 'true',
    'X-Wait-For-Selector': 'body',
    'X-Timeout': '30',
    'X-No-Cache': 'true',
  }
  if (jinaKey) {
    headers['Authorization'] = `Bearer ${jinaKey}`
    debugLog('[jina-reader] ✓ using API key (paid mode)')
  }

  const res = await fetch(`https://r.jina.ai/${pageUrl}`, { headers })
  if (!res.ok) {
    console.warn('[jina-reader] HTTP error', res.status)
    return null
  }

  const json = await res.json() as {
    data?: { content?: string; images?: Record<string, string>; links?: Record<string, string>; usage?: { tokens?: number } }
    content?: string; images?: Record<string, string>; links?: Record<string, string>
  }
  let md = json?.data?.content || json?.content || ''
  const imagesMap = json?.data?.images || json?.images
  const linksMap = json?.data?.links || json?.links

  if (!md || md.length < 50) return null
  recordScrapeUsage({ platform: 'jina', tokens: json?.data?.usage?.tokens ?? Math.round(md.length / 4) })

  debugLog('[jina-reader] JSON mode → content:', md.length, 'chars, images:', Object.keys(imagesMap ?? {}).length, ', links:', Object.keys(linksMap ?? {}).length)

  // Nettoyage agressif du markdown avant LLM (cookies, nav, facettes, pricing,
  // catalog listings…). Cf. markdownSanitize.ts pour le détail des patterns.
  md = sanitizeJinaMarkdown(md)

  // Injecter les images trouvées par Jina dans le markdown
  if (imagesMap && typeof imagesMap === 'object') {
    const imgEntries = Object.entries(imagesMap).filter(([, url]) => typeof url === 'string' && url.startsWith('http'))
    if (imgEntries.length > 0) {
      const imgSection = '\n\nJINA_EXTRACTED_IMAGES_START\n'
        + imgEntries.map(([, url]) => url).join('\n')
        + '\nJINA_EXTRACTED_IMAGES_END'
      md += imgSection
      debugLog('[jina-reader] ✓ injected', imgEntries.length, 'images from JSON response')
    }
  }

  // Injecter les liens documents (PDF) trouvés par Jina
  if (linksMap && typeof linksMap === 'object') {
    const DOC_EXT = /\.(pdf|docx?|xlsx?)(\?[^"']*)?$/i
    const docEntries = Object.entries(linksMap).filter(([, href]) => DOC_EXT.test(href))
    if (docEntries.length > 0) {
      const dlSection = '\n\nJINA_EXTRACTED_DOWNLOADS_START\n'
        + docEntries.map(([title, url]) => `${title}##${url}`).join('\n')
        + '\nJINA_EXTRACTED_DOWNLOADS_END'
      md += dlSection
      debugLog('[jina-reader] ✓ injected', docEntries.length, 'documents from JSON response')
    }
  }

  return md
}

/**
 * Fallback multi-stratégie pour les sites fabricants SPA (accordéons JS).
 * 1. Jina Reader avec JSON output (inclut parfois plus de contenu)
 * 2. Proxy CORS via un service tiers pour fetch le HTML brut côté serveur
 * 3. Parse le contenu pour les JSON-LD / sections cachées
 */
export async function scrapeHtmlFallback(pageUrl: string): Promise<string | null> {
  debugLog('[html-fallback] multi-strategy scrape →', pageUrl)

  // ── Stratégie 1 : Jina Reader en mode JSON (contient parfois plus de data) ──
  try {
    const jinaKey = getApiKey('jina')
    const fallbackHeaders: Record<string, string> = {
      Accept: 'application/json',
      'X-Return-Format': 'json',
      'X-Timeout': '45',
      'X-No-Cache': 'true',
      'X-Wait-For-Selector': 'body',
    }
    if (jinaKey) fallbackHeaders['Authorization'] = `Bearer ${jinaKey}`

    const res = await fetch(`https://r.jina.ai/${pageUrl}`, { headers: fallbackHeaders })
    if (res.ok) {
      const json = await res.json()
      const content = json?.data?.content || json?.content || ''
      const html = json?.data?.html || json?.html || ''
      debugLog('[html-fallback] Jina JSON → content:', content?.length, 'chars, html:', html?.length, 'chars')

      // Si on a le HTML rendu, parser le DOM
      if (html && html.length > 500) {
        const result = extractSpecsFromHtmlExternal(html)
        if (result && result.split('\n').filter((l: string) => l.startsWith('|')).length >= 3) {
          debugLog('[html-fallback] ✓ extracted specs from Jina HTML output')
          return result
        }
      }

      // Sinon essayer le content (markdown enrichi)
      if (content && content.length > 500 && content.length > (html?.length || 0)) {
        // Le content JSON peut avoir plus de données que le markdown standard
        const specCount = parseSpecsFromMarkdown(content).length
        if (specCount >= 3) {
          debugLog('[html-fallback] ✓ Jina JSON content has', specCount, 'specs')
          return content
        }
      }
    }
  } catch (err) {
    console.warn('[html-fallback] Jina JSON failed:', err)
  }

  // ── Stratégie 2 : CORS proxy pour fetch HTML brut ──
  const corsProxies = [
    `https://api.allorigins.win/raw?url=${encodeURIComponent(pageUrl)}`,
    `https://corsproxy.io/?${encodeURIComponent(pageUrl)}`,
  ]
  for (const proxyUrl of corsProxies) {
    try {
      const res = await fetch(proxyUrl, { signal: AbortSignal.timeout(20000) })
      if (!res.ok) continue
      const html = await res.text()
      if (!html || html.length < 500) continue
      debugLog('[html-fallback] CORS proxy got', html.length, 'chars from', proxyUrl.split('?')[0])
      const result = extractSpecsFromHtmlExternal(html)
      if (result && result.split('\n').filter((l: string) => l.startsWith('|')).length >= 2) {
        debugLog('[html-fallback] ✓ extracted specs from CORS proxy HTML')
        return result
      }
    } catch { /* proxy failed, try next */ }
  }

  debugLog('[html-fallback] all strategies exhausted')
  return null
}

