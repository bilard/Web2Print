import { discoverRelatedUrls, type RelatedUrls } from './relatedUrls'
import type { EnrichedDocument } from './types'

export interface ScrapedBundle {
  primaryUrl: string
  primaryMarkdown: string
  sourcesScrapped: string[]   // toutes les URLs effectivement scrapées (incluant primary)
  mergedMarkdown: string       // markdown final envoyé au LLM
  pdfsFound: EnrichedDocument[]
  errors: Array<{ url: string; error: string }>
}

export interface BundleDeps {
  /** Deep scrape (POST browser + injection JS) — doit retourner { markdown, html } */
  deepScrape: (url: string) => Promise<{ markdown: string; html: string | null } | null>
  /** Fast scrape (markdown only) pour les onglets secondaires et PDFs */
  fastScrape: (url: string) => Promise<string | null>
  /** Callback de log optionnel */
  log?: (msg: string) => void
}

const MAX_ADDITIONAL_URLS = 8
const URL_TIMEOUT_MS = 30_000

/** Hash simple pour dédoublonner les paragraphes dupliqués sur plusieurs onglets */
function hashParagraph(p: string): string {
  const trimmed = p.trim().toLowerCase().replace(/\s+/g, ' ')
  let h = 0
  for (let i = 0; i < trimmed.length; i++) h = ((h << 5) - h + trimmed.charCodeAt(i)) | 0
  return `${trimmed.length}:${h}`
}

function dedupParagraphs(sections: Array<{ label: string; markdown: string }>): string {
  const seen = new Set<string>()
  const output: string[] = []
  for (const s of sections) {
    output.push(`## [Source: ${s.label}]`)
    const paragraphs = s.markdown.split(/\n\n+/)
    for (const p of paragraphs) {
      if (!p.trim()) continue
      // Ne jamais dédupliquer les blocs JINA_EXTRACTED_* (listes images/PDFs)
      if (p.includes('JINA_EXTRACTED_')) { output.push(p); continue }
      const h = hashParagraph(p)
      if (seen.has(h)) continue
      seen.add(h)
      output.push(p)
    }
  }
  return output.join('\n\n').trim()
}

function prioritizeUrls(r: RelatedUrls): string[] {
  // tabs > pdfs > subpages, plafonné
  return [...r.tabs, ...r.pdfs.map((p) => p.url), ...r.subpages].slice(0, MAX_ADDITIONAL_URLS)
}

export async function scrapeProductBundle(
  productUrl: string,
  deps: BundleDeps,
): Promise<ScrapedBundle> {
  const { deepScrape, fastScrape, log } = deps
  const errors: Array<{ url: string; error: string }> = []
  log?.(`[bundle] passe 1 — deep scrape primary: ${productUrl}`)

  const primary = await deepScrape(productUrl)
  if (!primary) {
    return {
      primaryUrl: productUrl,
      primaryMarkdown: '',
      sourcesScrapped: [],
      mergedMarkdown: '',
      pdfsFound: [],
      errors: [{ url: productUrl, error: 'Deep scrape returned null' }],
    }
  }

  const baseUrl = new URL(productUrl)
  const related: RelatedUrls = primary.html
    ? discoverRelatedUrls(primary.html, baseUrl)
    : { tabs: [], pdfs: [], subpages: [] }

  const prioritized = prioritizeUrls(related)
  log?.(`[bundle] passe 2 — URLs liées détectées : ${related.tabs.length} onglets, ${related.pdfs.length} PDFs, ${related.subpages.length} sous-pages (plafonné à ${prioritized.length})`)

  const sections: Array<{ label: string; markdown: string }> = [
    { label: productUrl, markdown: primary.markdown },
  ]

  if (prioritized.length > 0) {
    log?.(`[bundle] passe 3 — scraping parallèle de ${prioritized.length} URL(s)…`)
    const results = await Promise.allSettled(
      prioritized.map(async (url) => {
        const ctrl = new AbortController()
        const timeout = setTimeout(() => ctrl.abort(), URL_TIMEOUT_MS)
        try {
          const md = await fastScrape(url)
          clearTimeout(timeout)
          return { url, md }
        } catch (err) {
          clearTimeout(timeout)
          throw err
        }
      }),
    )
    for (let i = 0; i < results.length; i++) {
      const url = prioritized[i]
      const r = results[i]
      if (r.status === 'fulfilled' && r.value.md && r.value.md.length > 100) {
        sections.push({ label: url, markdown: r.value.md })
        log?.(`[bundle] ✓ ${url} → ${r.value.md.length} chars`)
      } else {
        const reason = r.status === 'rejected' ? String(r.reason).slice(0, 200) : 'empty'
        errors.push({ url, error: reason })
        log?.(`[bundle] ✗ ${url} → ${reason}`)
      }
    }
  }

  const merged = dedupParagraphs(sections)
  const sourcesScrapped = [productUrl, ...sections.slice(1).map((s) => s.label)]

  return {
    primaryUrl: productUrl,
    primaryMarkdown: primary.markdown,
    sourcesScrapped,
    mergedMarkdown: merged,
    pdfsFound: related.pdfs,
    errors,
  }
}
