import { discoverRelatedUrls, type RelatedUrls } from './relatedUrls'

export interface ScrapedBundle {
  primaryUrl: string
  primaryMarkdown: string
  primaryHtml: string | null  // HTML rendu de la page primary (pour parsing microdonnées)
  sourcesScrapped: string[]   // toutes les URLs effectivement scrapées (incluant primary)
  mergedMarkdown: string       // markdown final envoyé au LLM
  pdfsFound: string[]
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

const MAX_ADDITIONAL_URLS = 6
const URL_TIMEOUT_MS = 30_000

/**
 * Extrait un token de référence produit depuis le slug/pathname pour filtrer
 * les subpages non liées. Ex: "gsr-18v-110-c-06019G0108" → "gsr-18v-110-c"
 */
function extractProductSlug(pathname: string): string | null {
  const segs = pathname.split('/').filter(Boolean)
  const last = segs[segs.length - 1] ?? ''
  if (!last) return null
  // Retirer un suffixe alphanum long (souvent la ref SKU) : "gsr-18v-110-c-06019G0108" → "gsr-18v-110-c"
  const m = last.match(/^(.+?)-[A-Z0-9]{6,}$/i)
  const slug = (m ? m[1] : last).toLowerCase()
  return slug.length >= 4 ? slug : null
}

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

function prioritizeUrls(r: RelatedUrls, primaryUrl: string): string[] {
  // PDFs exclus du scraping — ils contiennent des manuels multilingues (safety warnings,
  // instructions) qui polluent le markdown sans apport produit. Ils restent dans pdfsFound
  // pour affichage dans la fiche.
  // Subpages filtrées : doivent partager le slug produit du primary
  // (ex: même "gsr-18v-110-c" pour éviter d'inclure gli-18v-2200-c).
  let primarySlug: string | null = null
  try { primarySlug = extractProductSlug(new URL(primaryUrl).pathname) } catch { /* ignore */ }
  const filteredSubpages = primarySlug
    ? r.subpages.filter((u) => {
        try {
          const s = extractProductSlug(new URL(u).pathname)
          return s !== null && (s === primarySlug || s.startsWith(primarySlug!) || primarySlug!.startsWith(s))
        } catch { return false }
      })
    : []
  return [...r.tabs, ...filteredSubpages].slice(0, MAX_ADDITIONAL_URLS)
}

export async function scrapeProductBundle(
  productUrl: string,
  deps: BundleDeps,
): Promise<ScrapedBundle> {
  const { deepScrape, fastScrape, log } = deps
  const errors: Array<{ url: string; error: string }> = []
  log?.(`🔷 JINA · [bundle] passe 1 — deep scrape primary: ${productUrl}`)

  const primary = await deepScrape(productUrl)
  if (!primary) {
    return {
      primaryUrl: productUrl,
      primaryMarkdown: '',
      primaryHtml: null,
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

  const prioritized = prioritizeUrls(related, productUrl)
  log?.(`🔷 JINA · [bundle] passe 2 — URLs liées détectées : ${related.tabs.length} onglets, ${related.pdfs.length} PDFs (non scrapés, listés seulement), ${related.subpages.length} sous-pages (scrape plafonné à ${prioritized.length})`)

  const sections: Array<{ label: string; markdown: string }> = [
    { label: productUrl, markdown: primary.markdown },
  ]

  if (prioritized.length > 0) {
    log?.(`🔷 JINA · [bundle] passe 3 — scraping parallèle de ${prioritized.length} URL(s)…`)
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
        log?.(`🔷 JINA · [bundle] ✓ ${url} → ${r.value.md.length} chars`)
      } else {
        const reason = r.status === 'rejected' ? String(r.reason).slice(0, 200) : 'empty'
        errors.push({ url, error: reason })
        log?.(`🔷 JINA · [bundle] ✗ ${url} → ${reason}`)
      }
    }
  }

  const merged = dedupParagraphs(sections)
  const sourcesScrapped = [productUrl, ...sections.slice(1).map((s) => s.label)]

  return {
    primaryUrl: productUrl,
    primaryMarkdown: primary.markdown,
    primaryHtml: primary.html,
    sourcesScrapped,
    mergedMarkdown: merged,
    pdfsFound: related.pdfs,
    errors,
  }
}
