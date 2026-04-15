import { getApiKey } from '@/lib/apiKeys'
import { extractSpecsBlockFromHtml, extractDocumentsBlockFromHtml } from './htmlSpecsExtractor'
import { isGarbageContent, parseSpecsFromMarkdown } from './markdownParsers'
import type { SearchResult } from './urlScoring'

// ── Jina Reader — scraping principal ────────────────────────────────────────

/**
 * Recherche web via DuckDuckGo Lite + Jina Reader (gratuit, sans clé API).
 * Scrape la page de résultats DuckDuckGo Lite via r.jina.ai et parse les URLs.
 */
export async function jinaSearch(query: string, limit = 10): Promise<SearchResult[]> {
  console.log('[jina-search] →', { query, limit })
  const jinaKey = getApiKey('jina')
  const ddgUrl = `https://lite.duckduckgo.com/lite/?q=${encodeURIComponent(query)}`
  const headers: Record<string, string> = {
    Accept: 'text/markdown',
    'X-Retain-Images': 'none',
    'X-No-Cache': 'true',
  }
  if (jinaKey) headers['Authorization'] = `Bearer ${jinaKey}`
  const res = await fetch(`https://r.jina.ai/${ddgUrl}`, { headers })
  if (!res.ok) {
    const body = await res.text()
    console.error('[jina-search] HTTP error', res.status, body.slice(0, 300))
    throw new Error(`Recherche web échouée (${res.status}) : ${body.slice(0, 200)}`)
  }
  const md = await res.text()

  // Parser les URLs depuis les redirections DuckDuckGo (uddg=URL encodée)
  const results: SearchResult[] = []
  const seen = new Set<string>()
  const uddgRe = /uddg=([^&\s)]+)/g
  let match: RegExpExecArray | null
  while ((match = uddgRe.exec(md)) !== null) {
    try {
      const url = decodeURIComponent(match[1])
      if (!url.startsWith('http') || seen.has(url)) continue
      seen.add(url)
      // Extraire le titre depuis le markdown (lien précédant l'uddg)
      const titleRe = new RegExp(`\\[([^\\]]+)\\]\\([^)]*uddg=${match[1].replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`)
      const titleMatch = md.match(titleRe)
      results.push({
        url,
        title: titleMatch?.[1]?.replace(/\*\*/g, '').trim(),
      })
    } catch { /* ignore malformed URLs */ }
    if (results.length >= limit) break
  }

  // Fallback : parser les URLs markdown classiques [titre](url)
  if (results.length === 0) {
    const linkRe = /\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g
    while ((match = linkRe.exec(md)) !== null) {
      const url = match[2]
      if (seen.has(url) || /duckduckgo\.com/i.test(url)) continue
      seen.add(url)
      results.push({ url, title: match[1].replace(/\*\*/g, '').trim() })
      if (results.length >= limit) break
    }
  }

  console.log('[jina-search] parsed', results.length, 'results:', results.map((r) => r.url))
  return results
}

/**
 * Scrape une page via Jina Reader (r.jina.ai) → markdown.
 * Scrape une page via Jina Reader (r.jina.ai) → markdown.
 */
export async function jinaScrapeMarkdown(pageUrl: string): Promise<string | null> {
  console.log('[jina-reader] scraping →', pageUrl)
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
    console.log('[jina-reader] ✓ using API key (paid mode)')
  }

  const res = await fetch(`https://r.jina.ai/${pageUrl}`, { headers })
  if (!res.ok) {
    console.warn('[jina-reader] HTTP error', res.status)
    return null
  }

  const json = await res.json() as {
    data?: { content?: string; images?: Record<string, string>; links?: Record<string, string> }
    content?: string; images?: Record<string, string>; links?: Record<string, string>
  }
  let md = json?.data?.content || json?.content || ''
  const imagesMap = json?.data?.images || json?.images
  const linksMap = json?.data?.links || json?.links

  if (!md || md.length < 50) return null

  console.log('[jina-reader] JSON mode → content:', md.length, 'chars, images:', Object.keys(imagesMap ?? {}).length, ', links:', Object.keys(linksMap ?? {}).length)

  // Nettoyer les sections cookie/GDPR
  md = md
    .replace(/#{1,4}\s*(Your Privacy|Cookie|GDPR|Manage Preferences)[\s\S]*?(?=\n#{1,4}\s|\n\n---|\n\n\*\*|$)/gi, '')
    .replace(/^[-*•]\s*.*?(cookie|privacy|captcha|recaptcha|consent|targeting|functional|necessary).*$/gim, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()

  // Injecter les images trouvées par Jina dans le markdown
  if (imagesMap && typeof imagesMap === 'object') {
    const imgEntries = Object.entries(imagesMap).filter(([, url]) => typeof url === 'string' && url.startsWith('http'))
    if (imgEntries.length > 0) {
      const imgSection = '\n\nJINA_EXTRACTED_IMAGES_START\n'
        + imgEntries.map(([, url]) => url).join('\n')
        + '\nJINA_EXTRACTED_IMAGES_END'
      md += imgSection
      console.log('[jina-reader] ✓ injected', imgEntries.length, 'images from JSON response')
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
      console.log('[jina-reader] ✓ injected', docEntries.length, 'documents from JSON response')
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
  console.log('[html-fallback] multi-strategy scrape →', pageUrl)

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
      console.log('[html-fallback] Jina JSON → content:', content?.length, 'chars, html:', html?.length, 'chars')

      // Si on a le HTML rendu, parser le DOM
      if (html && html.length > 500) {
        const result = extractSpecsFromHtml(html)
        if (result && result.split('\n').filter((l: string) => l.startsWith('|')).length >= 3) {
          console.log('[html-fallback] ✓ extracted specs from Jina HTML output')
          return result
        }
      }

      // Sinon essayer le content (markdown enrichi)
      if (content && content.length > 500 && content.length > (html?.length || 0)) {
        // Le content JSON peut avoir plus de données que le markdown standard
        const specCount = parseSpecsFromMarkdown(content).length
        if (specCount >= 3) {
          console.log('[html-fallback] ✓ Jina JSON content has', specCount, 'specs')
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
      console.log('[html-fallback] CORS proxy got', html.length, 'chars from', proxyUrl.split('?')[0])
      const result = extractSpecsFromHtml(html)
      if (result && result.split('\n').filter((l: string) => l.startsWith('|')).length >= 2) {
        console.log('[html-fallback] ✓ extracted specs from CORS proxy HTML')
        return result
      }
    } catch { /* proxy failed, try next */ }
  }

  console.log('[html-fallback] all strategies exhausted')
  return null
}

/** Parse le HTML (via DOMParser) et extrait les specs en markdown */
function extractSpecsFromHtml(html: string): string | null {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const mdParts: string[] = []

  // ── 1. JSON-LD structured data (Product schema) ──
  const jsonLdScripts = doc.querySelectorAll('script[type="application/ld+json"]')
  for (const script of jsonLdScripts) {
    try {
      let data = JSON.parse(script.textContent ?? '')
      // Gérer @graph (wrapper courant)
      if (data['@graph']) data = data['@graph']
      const items = Array.isArray(data) ? data : [data]
      for (const item of items) {
        const type = item['@type']
        if (type !== 'Product' && !(Array.isArray(type) && type.includes('Product'))) continue
        if (item.name) mdParts.push(`# ${item.name}`)
        if (item.description) mdParts.push(`\n${item.description}`)
        // additionalProperty = specs
        if (Array.isArray(item.additionalProperty)) {
          mdParts.push('\n## Spécifications (JSON-LD)')
          for (const prop of item.additionalProperty) {
            if (prop.name && prop.value != null) {
              mdParts.push(`| ${prop.name} | ${prop.value}${prop.unitText ? ' ' + prop.unitText : ''} |`)
            }
          }
        }
        // weight, width, height, depth
        for (const dim of ['weight', 'width', 'height', 'depth']) {
          const val = item[dim]
          if (val?.value != null) {
            mdParts.push(`| ${dim} | ${val.value}${val.unitText ? ' ' + val.unitText : ''} |`)
          }
        }
      }
    } catch { /* JSON-LD invalide */ }
  }

  // ── 2. Extraire TOUT le contenu textuel structuré (accordéons inclus) ──
  // Sur les SPA, le contenu est dans le DOM même si masqué par CSS.
  // DOMParser ne filtre PAS par display:none — on récupère tout.
  const processedEls = new Set<Element>()

  const accordionSelectors = [
    // Générique accordéon
    '[data-accordion-content]', '[data-accordion-body]', '[data-collapse-content]',
    '.accordion-content', '.accordion-body', '.accordion__body', '.accordion__content',
    '.accordion-panel', '.accordion__panel',
    '.collapse-content', '.collapsible-content', '.panel-collapse',
    // Tabs
    '.tab-content', '.tab-pane', '[role="tabpanel"]',
    // Specs spécifiques
    '.product-specs', '.product-specifications', '.specifications-table',
    '.specs-content', '.spec-table', '.technical-data', '.technical-specs',
    // Wildcard (attrape Milwaukee, Bosch, Makita, DeWalt, etc.)
    '[class*="accordion"]', '[class*="Accordion"]',
    '[class*="collapse"]', '[class*="Collapse"]',
    '[class*="specification"]', '[class*="Specification"]',
    '[class*="spec-"]', '[class*="Spec-"]',
    '[class*="technical"]', '[class*="Technical"]',
    '[class*="product-detail"]', '[class*="ProductDetail"]',
    '[class*="feature"]', '[class*="Feature"]',
  ]

  /** Extraire les paires clé/valeur d'un élément DOM */
  function extractKvFromElement(el: Element, heading?: string): void {
    if (heading && heading.length < 80 && !isGarbageContent(heading)) {
      mdParts.push(`\n## ${heading}`)
    }

    // Tables internes
    const tables = el.querySelectorAll('table')
    for (const table of tables) {
      processedEls.add(table)
      const rows = table.querySelectorAll('tr')
      for (const row of rows) {
        const cells = row.querySelectorAll('td, th')
        if (cells.length >= 2) {
          const n = cells[0].textContent?.trim()
          const v = cells[1].textContent?.trim()
          if (n && v && !/^[-:]+$/.test(n)) mdParts.push(`| ${n} | ${v} |`)
        }
      }
    }

    // dt/dd
    const dts = el.querySelectorAll('dt')
    const dds = el.querySelectorAll('dd')
    if (dts.length > 0 && dds.length > 0) {
      const count = Math.min(dts.length, dds.length)
      for (let i = 0; i < count; i++) {
        const n = dts[i].textContent?.trim()
        const v = dds[i].textContent?.trim()
        if (n && v) mdParts.push(`| ${n} | ${v} |`)
      }
    }

    // li contenant des specs
    const lis = el.querySelectorAll('li')
    for (const li of lis) {
      const text = li.textContent?.trim()
      if (!text || text.length < 5 || text.length > 300 || isGarbageContent(text)) continue
      // "Nom : Valeur" dans un <li>
      const kv = text.match(/^([^:]{2,50})\s*:\s+(.{1,200})$/)
      if (kv) {
        mdParts.push(`| ${kv[1].trim()} | ${kv[2].trim()} |`)
      } else {
        // Chercher un <strong>/<b> suivi de texte
        const strong = li.querySelector('strong, b, span[class*="label"], span[class*="name"]')
        if (strong) {
          const name = strong.textContent?.trim()
          const rest = text.replace(name ?? '', '').replace(/^[\s:–—-]+/, '').trim()
          if (name && rest && rest.length > 1) mdParts.push(`| ${name} | ${rest} |`)
        }
      }
    }

    // Si pas de table/dt/li, fallback texte brut
    if (tables.length === 0 && dts.length === 0 && lis.length === 0) {
      const text = el.textContent?.trim()
      if (!text) return
      const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 2 && l.length < 200)
      for (const line of lines) {
        if (isGarbageContent(line)) continue
        const kv = line.match(/^([^:]{2,50})\s*:\s+(.{1,200})$/)
          || line.match(/^(.{2,50})\t+(.{1,200})$/)
        if (kv) mdParts.push(`| ${kv[1].trim()} | ${kv[2].trim()} |`)
      }
    }
  }

  for (const sel of accordionSelectors) {
    try {
      const els = doc.querySelectorAll(sel)
      for (const el of els) {
        if (processedEls.has(el)) continue
        processedEls.add(el)
        const text = el.textContent?.trim()
        if (!text || text.length < 5 || isGarbageContent(text)) continue

        // Trouver le heading de l'accordéon
        const parentBtn = el.previousElementSibling
        const heading = parentBtn?.textContent?.trim()
          || el.closest('[data-accordion-item], [class*="accordion-item"], [class*="AccordionItem"]')
              ?.querySelector('button, h2, h3, h4, [class*="title"], [class*="header"], [class*="trigger"]')
              ?.textContent?.trim()

        extractKvFromElement(el, heading)
      }
    } catch { /* sélecteur invalide */ }
  }

  // ── 3. Tables de specs orphelines (pas dans un accordéon) ──
  const allTables = doc.querySelectorAll('table')
  for (const table of allTables) {
    if (processedEls.has(table)) continue
    const tableText = table.textContent?.trim() ?? ''
    if (tableText.length < 20 || tableText.length > 10000 || isGarbageContent(tableText)) continue

    const rows = table.querySelectorAll('tr')
    let specCount = 0
    const tableLines: string[] = []
    for (const row of rows) {
      const cells = row.querySelectorAll('td, th')
      if (cells.length === 2) {
        const n = cells[0].textContent?.trim()
        const v = cells[1].textContent?.trim()
        if (n && v && n.length < 60 && v.length < 200 && !/^[-:]+$/.test(n)) {
          tableLines.push(`| ${n} | ${v} |`)
          if (/\d/.test(v) || /\b(mm|cm|kg|nm|rpm|v|ah|w|hz|db|°|%)\b/i.test(v)) specCount++
        }
      }
    }
    if (specCount >= 2 && tableLines.length >= 2) {
      mdParts.push('\n## Spécifications (table)')
      mdParts.push(...tableLines)
    }
  }

  // ── 4. dl/dt/dd orphelines ──
  const dlElements = doc.querySelectorAll('dl')
  for (const dl of dlElements) {
    if (processedEls.has(dl)) continue
    const dts = dl.querySelectorAll('dt')
    const dds = dl.querySelectorAll('dd')
    if (dts.length >= 2) {
      const count = Math.min(dts.length, dds.length)
      let specCount = 0
      const dlLines: string[] = []
      for (let i = 0; i < count; i++) {
        const n = dts[i].textContent?.trim()
        const v = dds[i].textContent?.trim()
        if (n && v) {
          dlLines.push(`| ${n} | ${v} |`)
          if (/\d/.test(v)) specCount++
        }
      }
      if (specCount >= 2) {
        mdParts.push('\n## Spécifications (définitions)')
        mdParts.push(...dlLines)
      }
    }
  }

  // ── 5. Dernier recours : chercher les paires .label / .value dans le body ──
  if (mdParts.filter(l => l.startsWith('|')).length < 3) {
    const labelValueSelectors = [
      // Paires label+value communes sur les SPA fabricants
      { label: '[class*="spec-label"], [class*="spec-name"], [class*="SpecLabel"], [class*="SpecName"]',
        value: '[class*="spec-value"], [class*="spec-data"], [class*="SpecValue"], [class*="SpecData"]' },
      { label: '[class*="attr-label"], [class*="attr-name"], [class*="AttrLabel"]',
        value: '[class*="attr-value"], [class*="attr-data"], [class*="AttrValue"]' },
      { label: '[class*="feature-label"], [class*="feature-name"]',
        value: '[class*="feature-value"], [class*="feature-data"]' },
      { label: '[class*="property-label"], [class*="property-name"]',
        value: '[class*="property-value"], [class*="property-data"]' },
    ]
    for (const { label: lSel, value: vSel } of labelValueSelectors) {
      try {
        const labels = doc.querySelectorAll(lSel)
        const values = doc.querySelectorAll(vSel)
        if (labels.length >= 2 && labels.length === values.length) {
          mdParts.push('\n## Spécifications (DOM)')
          for (let i = 0; i < labels.length; i++) {
            const n = labels[i].textContent?.trim()
            const v = values[i].textContent?.trim()
            if (n && v) mdParts.push(`| ${n} | ${v} |`)
          }
          break
        }
      } catch { /* sélecteur invalide */ }
    }
  }

  if (mdParts.length === 0) {
    console.log('[html-fallback] no structured data found in HTML')
    return null
  }

  const result = mdParts.join('\n').trim()
  const specLines = result.split('\n').filter(l => l.startsWith('|')).length
  console.log('[html-fallback] extracted', result.length, 'chars,', specLines, 'spec lines')
  return result
}

/**
 * CORS-proxy fallback : fetch le HTML brut du fabricant et extrait specs/docs.
 * Utile quand Jina ne livre pas le DOM complet (tabs lazy-loaded, SPA partielle).
 * Lancé APRÈS enrichResultWithHtmlExtraction, déclenché uniquement si les blocs
 * JINA_EXTRACTED_SPECS/DOCUMENTS sont toujours absents ou faibles.
 */
export async function fetchAndExtractFromRawHtml(pageUrl: string): Promise<{ specs: string; docs: string } | null> {
  const proxies = [
    `https://api.allorigins.win/raw?url=${encodeURIComponent(pageUrl)}`,
    `https://corsproxy.io/?${encodeURIComponent(pageUrl)}`,
  ]
  for (const proxy of proxies) {
    try {
      const res = await fetch(proxy, { signal: AbortSignal.timeout(20000) })
      if (!res.ok) continue
      const html = await res.text()
      if (!html || html.length < 2000) continue
      console.log('[cors-proxy-extract] got', html.length, 'chars from', proxy.split('?')[0])
      const specs = extractSpecsBlockFromHtml(html)
      const docs = extractDocumentsBlockFromHtml(html, pageUrl)
      if (specs || docs) {
        console.log('[cors-proxy-extract] ✓ specs:', specs.length, 'chars, docs:', docs.length, 'chars')
        return { specs, docs }
      }
    } catch { /* try next */ }
  }
  return null
}
