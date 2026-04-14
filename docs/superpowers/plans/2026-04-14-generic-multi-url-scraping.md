# Generic Multi-URL Scraping Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Étendre le moteur de scraping Jina pour récupérer automatiquement les onglets routés (ex: Grundfos `?tab=...`) et les PDFs liés, sans profils par site et sans régression sur les sites éprouvés (Milwaukee, Nicoll).

**Architecture:** Pipeline additif en 3 passes greffé sur l'existant. (1) `jinaScrapeMaufacturerPage` existant déjà en mode `X-Engine: browser` avec `injectPageScript` — on lui fait exposer aussi le HTML rendu. (2) Nouvelle fonction `discoverRelatedUrls(html, baseUrl)` qui extrait les onglets routés, PDFs et sous-pages. (3) Nouvel orchestrateur `scrapeProductBundle(url)` qui scrape les URLs liées en parallèle et fusionne les markdowns. Kill-switch `multiUrlEnabled` dans le store Zustand.

**Tech Stack:** TypeScript, Vitest, Zustand, Jina Reader API, DOMParser (natif).

---

## File Structure

**Créations :**
- `src/features/excel/ai-enrichment/relatedUrls.ts` — module pur : `normalizeUrl`, `discoverRelatedUrls`, types `RelatedUrls`
- `src/features/excel/ai-enrichment/relatedUrls.test.ts` — tests Vitest du module pur
- `src/features/excel/ai-enrichment/scrapeBundle.ts` — orchestrateur `scrapeProductBundle` (passes 1+2+3, fusion)

**Modifications :**
- `src/features/excel/ai-enrichment/useProductEnrichment.ts`
  - `jinaScrapeMaufacturerPage` (ligne 1089) : retourner aussi le HTML rendu en plus du markdown
  - Flux principal (ligne ~3309) : remplacer l'appel `jinaScrapeMaufacturerPage(productUrl)` par `scrapeProductBundle(productUrl, log)` si `multiUrlEnabled`
- `src/features/excel/ai-enrichment/enrichmentStore.ts` (146 lignes) : étendre `ScrapeCache` avec `sourcesScrapped: string[]`, ajouter toggle `multiUrlEnabled`
- `src/features/excel/ai-enrichment/types.ts` : exporter `ScrapedBundle`, `RelatedUrls`
- `src/features/excel/ai-enrichment/EnrichmentPanel.tsx` : afficher la liste des URLs scrapées dans le bloc logs (collapsible) + toggle UI optionnel

---

## Task 1 : Module `relatedUrls.ts` — `normalizeUrl` (TDD)

**Files:**
- Create: `src/features/excel/ai-enrichment/relatedUrls.ts`
- Create: `src/features/excel/ai-enrichment/relatedUrls.test.ts`

- [ ] **Step 1.1 : Écrire le test d'échec pour `normalizeUrl`**

Créer `src/features/excel/ai-enrichment/relatedUrls.test.ts` :

```ts
import { describe, it, expect } from 'vitest'
import { normalizeUrl } from './relatedUrls'

describe('normalizeUrl', () => {
  it('lowercases host and trims trailing slash', () => {
    expect(normalizeUrl('https://Example.COM/foo/')).toBe('https://example.com/foo')
  })
  it('sorts query params deterministically', () => {
    expect(normalizeUrl('https://a.com/p?b=2&a=1')).toBe('https://a.com/p?a=1&b=2')
  })
  it('drops tracking params (utm_*, gclid, fbclid)', () => {
    expect(normalizeUrl('https://a.com/p?utm_source=x&id=7&gclid=yyy')).toBe('https://a.com/p?id=7')
  })
  it('drops fragments', () => {
    expect(normalizeUrl('https://a.com/p#section-2')).toBe('https://a.com/p')
  })
  it('keeps fragments if keepHash=true', () => {
    expect(normalizeUrl('https://a.com/p#tab=variants', { keepHash: true })).toBe('https://a.com/p#tab=variants')
  })
  it('returns null for invalid URLs', () => {
    expect(normalizeUrl('not a url')).toBeNull()
  })
})
```

- [ ] **Step 1.2 : Vérifier l'échec**

Run: `npx vitest run src/features/excel/ai-enrichment/relatedUrls.test.ts`
Expected: FAIL — `Cannot find module './relatedUrls'`

- [ ] **Step 1.3 : Créer `relatedUrls.ts` avec l'implémentation minimale**

```ts
/** Related-URL discovery utilities (pure, testable). */

const TRACKING_PARAMS = new Set([
  'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',
  'gclid', 'fbclid', 'mc_cid', 'mc_eid', 'msclkid', 'dclid',
])

export interface NormalizeOptions {
  keepHash?: boolean
}

export function normalizeUrl(raw: string, opts: NormalizeOptions = {}): string | null {
  try {
    const u = new URL(raw)
    u.hostname = u.hostname.toLowerCase()
    if (u.pathname.length > 1 && u.pathname.endsWith('/')) {
      u.pathname = u.pathname.slice(0, -1)
    }
    const params = Array.from(u.searchParams.entries())
      .filter(([k]) => !TRACKING_PARAMS.has(k.toLowerCase()))
      .sort(([a], [b]) => a.localeCompare(b))
    u.search = ''
    for (const [k, v] of params) u.searchParams.append(k, v)
    if (!opts.keepHash) u.hash = ''
    return u.toString().replace(/\/$/, '') // second trim for root
  } catch {
    return null
  }
}
```

- [ ] **Step 1.4 : Vérifier le passage des tests**

Run: `npx vitest run src/features/excel/ai-enrichment/relatedUrls.test.ts`
Expected: PASS (6/6)

- [ ] **Step 1.5 : Commit**

```bash
git add src/features/excel/ai-enrichment/relatedUrls.ts src/features/excel/ai-enrichment/relatedUrls.test.ts
git commit -m "feat(enrichment): add normalizeUrl helper for related-url discovery"
```

---

## Task 2 : `discoverRelatedUrls` — onglets routés (TDD)

**Files:**
- Modify: `src/features/excel/ai-enrichment/relatedUrls.ts`
- Modify: `src/features/excel/ai-enrichment/relatedUrls.test.ts`

- [ ] **Step 2.1 : Écrire le test d'échec pour la détection d'onglets**

Ajouter au bas de `relatedUrls.test.ts` :

```ts
import { discoverRelatedUrls } from './relatedUrls'

const grundfosHtml = `
<html><body>
  <header><nav><a href="/fr/categories">Catégories</a></nav></header>
  <div role="tablist">
    <a href="/fr/products/alpha/alpha1-go/alpha1-go-25-40-130-93074186?tab=overview">Vue d'ensemble</a>
    <a href="/fr/products/alpha/alpha1-go/alpha1-go-25-40-130-93074186?tab=variants">Variantes</a>
    <a href="/fr/products/alpha/alpha1-go/alpha1-go-25-40-130-93074186?tab=specifications">Spécifications</a>
    <a href="/fr/products/alpha/alpha1-go/alpha1-go-25-40-130-93074186?tab=variant-curves">Courbes</a>
  </div>
  <footer><a href="/fr/legal">Mentions</a></footer>
</body></html>
`

describe('discoverRelatedUrls - tabs', () => {
  const base = new URL('https://product-selection.grundfos.com/fr/products/alpha/alpha1-go/alpha1-go-25-40-130-93074186?tab=variant-curves')

  it('finds same-path tabs with different query strings', () => {
    const { tabs } = discoverRelatedUrls(grundfosHtml, base)
    expect(tabs).toContain('https://product-selection.grundfos.com/fr/products/alpha/alpha1-go/alpha1-go-25-40-130-93074186?tab=overview')
    expect(tabs).toContain('https://product-selection.grundfos.com/fr/products/alpha/alpha1-go/alpha1-go-25-40-130-93074186?tab=variants')
    expect(tabs).toContain('https://product-selection.grundfos.com/fr/products/alpha/alpha1-go/alpha1-go-25-40-130-93074186?tab=specifications')
  })

  it('excludes the base URL itself from tabs', () => {
    const { tabs } = discoverRelatedUrls(grundfosHtml, base)
    expect(tabs).not.toContain('https://product-selection.grundfos.com/fr/products/alpha/alpha1-go/alpha1-go-25-40-130-93074186?tab=variant-curves')
  })

  it('ignores nav/footer links even if same path', () => {
    const { tabs } = discoverRelatedUrls(grundfosHtml, base)
    expect(tabs.every(u => !u.includes('/legal'))).toBe(true)
    expect(tabs.every(u => !u.includes('/categories'))).toBe(true)
  })
})
```

- [ ] **Step 2.2 : Vérifier l'échec**

Run: `npx vitest run src/features/excel/ai-enrichment/relatedUrls.test.ts`
Expected: FAIL — `discoverRelatedUrls is not a function`

- [ ] **Step 2.3 : Implémenter `discoverRelatedUrls`**

Ajouter à `relatedUrls.ts` :

```ts
export interface RelatedUrls {
  tabs: string[]
  pdfs: string[]
  subpages: string[]
}

const NAV_ANCESTOR_SELECTORS = [
  'header', 'footer',
  'nav[role="navigation"]',
  '[class*="breadcrumb" i]',
  '[class*="sidebar" i]',
  '[class*="mega-menu" i]',
  '[class*="site-nav" i]',
]

function isInsideNav(el: Element): boolean {
  let cur: Element | null = el
  while (cur) {
    for (const sel of NAV_ANCESTOR_SELECTORS) {
      if (cur.matches?.(sel)) return true
    }
    cur = cur.parentElement
  }
  return false
}

export function discoverRelatedUrls(html: string, baseUrl: URL): RelatedUrls {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const baseKey = normalizeUrl(baseUrl.toString())
  const baseHost = baseUrl.hostname.toLowerCase()
  const basePath = baseUrl.pathname

  const tabs = new Set<string>()
  const pdfs = new Set<string>()
  const subpages = new Set<string>()

  const anchors = doc.querySelectorAll('a[href]')
  for (const a of Array.from(anchors)) {
    const href = a.getAttribute('href') ?? ''
    if (!href || href.startsWith('mailto:') || href.startsWith('tel:') || href.startsWith('javascript:')) continue
    if (href === '#' || href.startsWith('?lang=') || href.startsWith('?currency=')) continue

    let resolved: URL
    try { resolved = new URL(href, baseUrl) } catch { continue }
    if (resolved.hostname.toLowerCase() !== baseHost) {
      // external PDFs on CDN documentaire are still candidates
      if (/\.pdf($|\?)/i.test(resolved.pathname + resolved.search)) {
        const n = normalizeUrl(resolved.toString())
        if (n) pdfs.add(n)
      }
      continue
    }

    if (isInsideNav(a)) continue

    const normalized = normalizeUrl(resolved.toString())
    if (!normalized || normalized === baseKey) continue

    // PDFs
    if (/\.pdf($|\?)/i.test(resolved.pathname + resolved.search)) {
      pdfs.add(normalized)
      continue
    }

    // Tabs: même pathname, query ou hash différent
    if (resolved.pathname === basePath && (resolved.search || resolved.hash)) {
      tabs.add(normalized)
      continue
    }

    // Subpages: même dossier racine, profondeur ≤ +1
    const baseSegs = basePath.split('/').filter(Boolean)
    const curSegs = resolved.pathname.split('/').filter(Boolean)
    if (baseSegs.length > 0 && curSegs.length <= baseSegs.length + 1) {
      const sharedPrefix = baseSegs.slice(0, baseSegs.length - 1).join('/')
      if (sharedPrefix && resolved.pathname.startsWith('/' + sharedPrefix + '/')) {
        subpages.add(normalized)
      }
    }
  }

  return {
    tabs: Array.from(tabs),
    pdfs: Array.from(pdfs),
    subpages: Array.from(subpages),
  }
}
```

- [ ] **Step 2.4 : Vérifier le passage des tests**

Run: `npx vitest run src/features/excel/ai-enrichment/relatedUrls.test.ts`
Expected: PASS (9/9)

- [ ] **Step 2.5 : Commit**

```bash
git add src/features/excel/ai-enrichment/relatedUrls.ts src/features/excel/ai-enrichment/relatedUrls.test.ts
git commit -m "feat(enrichment): discoverRelatedUrls detects routed tabs from HTML"
```

---

## Task 3 : `discoverRelatedUrls` — PDFs et sous-pages (TDD)

**Files:**
- Modify: `src/features/excel/ai-enrichment/relatedUrls.test.ts`

- [ ] **Step 3.1 : Ajouter les tests PDFs et sous-pages**

Ajouter à `relatedUrls.test.ts` :

```ts
const htmlWithPdfs = `
<html><body>
  <main>
    <a href="/docs/datasheet-alpha1.pdf">Datasheet</a>
    <a href="/docs/manual-fr.pdf?v=2">Manuel</a>
    <a href="https://cdn.grundfos.com/api/binary/d123.pdf">Certificat</a>
  </main>
</body></html>
`

describe('discoverRelatedUrls - pdfs', () => {
  const base = new URL('https://www.grundfos.com/fr/products/alpha/alpha1-go/alpha1-go-25-40-130-93074186')

  it('collects internal pdf links', () => {
    const { pdfs } = discoverRelatedUrls(htmlWithPdfs, base)
    expect(pdfs).toContain('https://www.grundfos.com/docs/datasheet-alpha1.pdf')
    expect(pdfs.some(u => u.includes('manual-fr.pdf'))).toBe(true)
  })

  it('collects external pdf links from CDNs', () => {
    const { pdfs } = discoverRelatedUrls(htmlWithPdfs, base)
    expect(pdfs).toContain('https://cdn.grundfos.com/api/binary/d123.pdf')
  })
})

const htmlWithSubpages = `
<html><body>
  <main>
    <a href="/fr/products/alpha/alpha1-go/alpha1-go-25-40-180-93074187">Alpha1 GO 25-40 180</a>
    <a href="/fr/products/scala">Scala</a>
    <a href="/fr/products/alpha/alpha1-go/alpha1-go-25-40-130-93074186/specifications">Specs</a>
  </main>
</body></html>
`

describe('discoverRelatedUrls - subpages', () => {
  const base = new URL('https://www.grundfos.com/fr/products/alpha/alpha1-go/alpha1-go-25-40-130-93074186')

  it('collects sibling pages at same depth', () => {
    const { subpages } = discoverRelatedUrls(htmlWithSubpages, base)
    expect(subpages.some(u => u.endsWith('/alpha1-go-25-40-180-93074187'))).toBe(true)
  })

  it('ignores pages outside the product slug root', () => {
    const { subpages } = discoverRelatedUrls(htmlWithSubpages, base)
    expect(subpages.every(u => !u.endsWith('/scala'))).toBe(true)
  })
})
```

- [ ] **Step 3.2 : Vérifier le passage**

Run: `npx vitest run src/features/excel/ai-enrichment/relatedUrls.test.ts`
Expected: PASS (13/13)
Si échec : ajuster les heuristiques dans `discoverRelatedUrls` en conséquence (CDN externe, filtres). La logique actuelle est calibrée pour passer ces cas.

- [ ] **Step 3.3 : Commit**

```bash
git add src/features/excel/ai-enrichment/relatedUrls.test.ts
git commit -m "test(enrichment): cover pdf and subpage discovery"
```

---

## Task 4 : Exposer le HTML depuis `jinaScrapeMaufacturerPage`

**Files:**
- Modify: `src/features/excel/ai-enrichment/useProductEnrichment.ts:1089-1654`

Actuellement `jinaScrapeMaufacturerPage` retourne `Promise<string | null>` (markdown seulement). Pour la découverte d'URLs liées, on a besoin aussi du HTML rendu retourné par Jina (`json.data.html`).

- [ ] **Step 4.1 : Créer un nouveau type de retour structuré**

Dans `src/features/excel/ai-enrichment/useProductEnrichment.ts` juste au-dessus de `jinaScrapeMaufacturerPage` (vers la ligne 1085), ajouter :

```ts
export interface DeepScrapeResult {
  markdown: string
  html: string | null
  source: 'post-browser' | 'get-fallback' | 'basic-merged'
}
```

- [ ] **Step 4.2 : Modifier la signature et capturer le HTML dans le POST**

Modifier `jinaScrapeMaufacturerPage` (ligne 1089) :
- Nouvelle signature : `async function jinaScrapeMaufacturerPage(pageUrl: string): Promise<DeepScrapeResult | null>`
- Dans le POST `fetch('https://r.jina.ai/', ...)` (ligne 1571), garder `X-Engine: browser`, ajouter body field `respondWith: 'content'` n'est PAS nécessaire car le JSON response contient déjà `data.html` quand `Accept: application/json`. Ajouter le header `X-Return-Format: html,markdown` pour forcer les deux.
- À la réception du JSON (ligne 1595), capturer aussi `json?.data?.html`.
- À la fin (ligne 1649), retourner `{ markdown: md, html: capturedHtml, source: 'post-browser' }`.
- En cas de fallback, retourner `{ markdown, html: null, source: 'get-fallback' }`.

Ajouter les headers manquants pour maximiser la capture :

```ts
// Dans les headers du POST (autour ligne 1573)
'X-With-Iframe': 'true',
'X-With-Shadow-Dom': 'true',
'X-Return-Format': 'html,markdown',
```

Exemple de modification du bloc de retour :

```ts
// Remplacer : return md
return { markdown: md, html: (json?.data as { html?: string } | undefined)?.html ?? null, source: 'post-browser' as const }
```

Et pour chaque `return jinaScrapeMarkdown(pageUrl)` dans les fallbacks (lignes 1566, 1592, 1602, 1652), wrapper en :

```ts
const fallbackMd = await jinaScrapeMarkdown(pageUrl)
return fallbackMd ? { markdown: fallbackMd, html: null, source: 'get-fallback' as const } : null
```

- [ ] **Step 4.3 : Adapter l'appelant (ligne 3309)**

Modifier le bloc qui utilise `jinaScrapeMaufacturerPage` :

```ts
// Avant :
// markdownContent = await jinaScrapeMaufacturerPage(productUrl)

// Après :
const deepResult = await jinaScrapeMaufacturerPage(productUrl)
markdownContent = deepResult?.markdown ?? null
// deepResult.html sera utilisé par scrapeProductBundle (task 5)
```

- [ ] **Step 4.4 : Vérifier la compilation TypeScript**

Run: `npx tsc --noEmit`
Expected: 0 erreurs liées à `DeepScrapeResult` ou `jinaScrapeMaufacturerPage`.

- [ ] **Step 4.5 : Commit**

```bash
git add src/features/excel/ai-enrichment/useProductEnrichment.ts
git commit -m "refactor(enrichment): expose rendered HTML from manufacturer deep scrape"
```

---

## Task 5 : Orchestrateur `scrapeProductBundle`

**Files:**
- Create: `src/features/excel/ai-enrichment/scrapeBundle.ts`

- [ ] **Step 5.1 : Créer le module d'orchestration**

Créer `src/features/excel/ai-enrichment/scrapeBundle.ts` :

```ts
import { discoverRelatedUrls, normalizeUrl, type RelatedUrls } from './relatedUrls'

export interface ScrapedBundle {
  primaryUrl: string
  primaryMarkdown: string
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
  return [...r.tabs, ...r.pdfs, ...r.subpages].slice(0, MAX_ADDITIONAL_URLS)
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
```

- [ ] **Step 5.2 : Tests unitaires de l'orchestrateur (mocks)**

Créer `src/features/excel/ai-enrichment/scrapeBundle.test.ts` :

```ts
import { describe, it, expect, vi } from 'vitest'
import { scrapeProductBundle } from './scrapeBundle'

describe('scrapeProductBundle', () => {
  it('returns primary-only when no related URLs found', async () => {
    const deepScrape = vi.fn().mockResolvedValue({ markdown: '# Primary content', html: '<html><body><p>x</p></body></html>' })
    const fastScrape = vi.fn()
    const bundle = await scrapeProductBundle('https://example.com/product', { deepScrape, fastScrape })
    expect(bundle.sourcesScrapped).toEqual(['https://example.com/product'])
    expect(bundle.mergedMarkdown).toContain('# Primary content')
    expect(fastScrape).not.toHaveBeenCalled()
  })

  it('scrapes discovered tabs in parallel and merges', async () => {
    const html = `
      <html><body>
        <main><div role="tablist">
          <a href="/p?tab=a">A</a>
          <a href="/p?tab=b">B</a>
        </div></main>
      </body></html>`
    const deepScrape = vi.fn().mockResolvedValue({ markdown: '# Main', html })
    const fastScrape = vi.fn()
      .mockResolvedValueOnce('## Tab A content that is long enough to pass the length gate')
      .mockResolvedValueOnce('## Tab B content that is long enough to pass the length gate')
    const bundle = await scrapeProductBundle('https://example.com/p', { deepScrape, fastScrape })
    expect(bundle.sourcesScrapped).toHaveLength(3)
    expect(bundle.mergedMarkdown).toContain('Tab A content')
    expect(bundle.mergedMarkdown).toContain('Tab B content')
  })

  it('handles partial failures gracefully (Promise.allSettled)', async () => {
    const html = `<html><body><main><div role="tablist"><a href="/p?tab=a">A</a><a href="/p?tab=b">B</a></div></main></body></html>`
    const deepScrape = vi.fn().mockResolvedValue({ markdown: '# Main', html })
    const fastScrape = vi.fn()
      .mockRejectedValueOnce(new Error('timeout'))
      .mockResolvedValueOnce('## Tab B content long enough to pass the gate')
    const bundle = await scrapeProductBundle('https://example.com/p', { deepScrape, fastScrape })
    expect(bundle.errors).toHaveLength(1)
    expect(bundle.errors[0].error).toContain('timeout')
    expect(bundle.mergedMarkdown).toContain('Tab B content')
  })

  it('returns empty bundle when deepScrape fails', async () => {
    const deepScrape = vi.fn().mockResolvedValue(null)
    const fastScrape = vi.fn()
    const bundle = await scrapeProductBundle('https://example.com/p', { deepScrape, fastScrape })
    expect(bundle.errors[0].error).toBe('Deep scrape returned null')
    expect(bundle.mergedMarkdown).toBe('')
  })
})
```

- [ ] **Step 5.3 : Vérifier le passage**

Run: `npx vitest run src/features/excel/ai-enrichment/scrapeBundle.test.ts`
Expected: PASS (4/4)

- [ ] **Step 5.4 : Commit**

```bash
git add src/features/excel/ai-enrichment/scrapeBundle.ts src/features/excel/ai-enrichment/scrapeBundle.test.ts
git commit -m "feat(enrichment): scrapeProductBundle orchestrates multi-url scraping"
```

---

## Task 6 : Étendre store avec toggle et cache par URL

**Files:**
- Modify: `src/features/excel/ai-enrichment/enrichmentStore.ts:7-12, 14-33`

- [ ] **Step 6.1 : Étendre l'interface `ScrapeCache`**

Dans `enrichmentStore.ts` ligne 7, remplacer :

```ts
export interface ScrapeCache {
  productUrl: string
  additionalSources: string[]
  markdownContent: string | null
  scrapeProvider: string
}
```

par :

```ts
export interface ScrapeCache {
  productUrl: string
  additionalSources: string[]
  markdownContent: string | null
  scrapeProvider: string
  /** URLs effectivement scrapées par le bundle (onglets, PDFs…) — informatif pour l'UI. */
  sourcesScrapped?: string[]
}
```

- [ ] **Step 6.2 : Ajouter le toggle `multiUrlEnabled`**

Modifier l'interface `EnrichmentState` (ligne 14) — ajouter :

```ts
  /** Kill-switch : désactiver la découverte d'URLs liées (fallback scrape single-URL). */
  multiUrlEnabled: boolean
  setMultiUrlEnabled: (v: boolean) => void
```

Puis dans le factory (après `logs: {},` ligne 50) :

```ts
  multiUrlEnabled: true,
  setMultiUrlEnabled: (v) => set({ multiUrlEnabled: v }),
```

- [ ] **Step 6.3 : Vérifier la compilation**

Run: `npx tsc --noEmit`
Expected: 0 erreurs.

- [ ] **Step 6.4 : Commit**

```bash
git add src/features/excel/ai-enrichment/enrichmentStore.ts
git commit -m "feat(enrichment): add multiUrlEnabled kill-switch and sourcesScrapped cache"
```

---

## Task 7 : Brancher `scrapeProductBundle` dans le flux principal

**Files:**
- Modify: `src/features/excel/ai-enrichment/useProductEnrichment.ts:3295-3380`

- [ ] **Step 7.1 : Importer `scrapeProductBundle`**

En haut de `useProductEnrichment.ts` (section imports), ajouter :

```ts
import { scrapeProductBundle } from './scrapeBundle'
```

- [ ] **Step 7.2 : Remplacer l'appel single-URL par le bundle**

Localiser le bloc autour de la ligne 3295 (`if (productUrl && !usedCache) {`) jusqu'à la ligne 3342 (fin du `if (primaryScore < 10 && additionalSources.length > 0) { … }`).

Remplacer le bloc :

```ts
          try {
            log(`Deep scrape (X-Engine: browser, tabs, window.*) → ${productUrl}`)
            markdownContent = await jinaScrapeMaufacturerPage(productUrl)
            …
          } catch (err) { … }
          …
          // fallback alt sources
```

par :

```ts
          const multiEnabled = useEnrichmentStore.getState().multiUrlEnabled
          try {
            if (multiEnabled) {
              log(`Multi-URL bundle (X-Engine: browser + onglets auto) → ${productUrl}`)
              const bundle = await scrapeProductBundle(productUrl, {
                deepScrape: async (url) => {
                  const r = await jinaScrapeMaufacturerPage(url)
                  return r ? { markdown: r.markdown, html: r.html } : null
                },
                fastScrape: (url) => jinaScrapeMarkdown(url),
                log,
              })
              markdownContent = bundle.mergedMarkdown || null
              if (bundle.sourcesScrapped.length > 1) {
                log(`✓ Bundle : ${bundle.sourcesScrapped.length} sources fusionnées (${bundle.pdfsFound.length} PDFs)`)
              }
              // Stocker sourcesScrapped dans le cache (géré plus bas ligne 3371)
              ;(bundle as unknown as { __forCache: { sourcesScrapped: string[] } }).__forCache = { sourcesScrapped: bundle.sourcesScrapped }
              ;(globalThis as unknown as { __lastBundle?: unknown }).__lastBundle = bundle
            } else {
              log(`Scrape single-URL (multi-URL désactivé) → ${productUrl}`)
              const r = await jinaScrapeMaufacturerPage(productUrl)
              markdownContent = r?.markdown ?? null
            }
          } catch (err) {
            console.warn('[enrichment] scrape failed', err)
            log(`✗ Scrape échec : ${String(err).slice(0, 200)}`)
          }
```

Le fallback « alternative sources » (lignes 3325-3341, boucle `altUrl`) reste **inchangé** — il se déclenche toujours si le score est bas.

- [ ] **Step 7.3 : Enrichir le cache avec `sourcesScrapped`**

Autour de la ligne 3371 (bloc `if (!usedCache && productUrl)` qui écrit dans `setScrapeCache`), modifier :

```ts
          if (!usedCache && productUrl) {
            const lastBundle = (globalThis as unknown as { __lastBundle?: { sourcesScrapped?: string[] } }).__lastBundle
            setScrapeCache(sheetName, rowId, {
              productUrl,
              additionalSources,
              markdownContent,
              scrapeProvider: 'Jina',
              sourcesScrapped: lastBundle?.sourcesScrapped,
            })
            ;(globalThis as unknown as { __lastBundle?: unknown }).__lastBundle = undefined
            console.log('[enrichment] ★ scrape cache saved for', enrichmentKey(sheetName, rowId))
          }
```

- [ ] **Step 7.4 : Vérifier la compilation**

Run: `npx tsc --noEmit`
Expected: 0 erreurs.

- [ ] **Step 7.5 : Build dev et smoke test manuel**

Run: `npm run dev`
Ouvrir l'app, charger un Excel avec une URL produit Grundfos, cliquer « Enrichir ». Vérifier dans la console browser que les logs affichent :
- `[bundle] passe 1 — deep scrape primary:`
- `[bundle] passe 2 — URLs liées détectées : N onglets, M PDFs, …`
- `[bundle] passe 3 — scraping parallèle de K URL(s)…`
- `[bundle] ✓ <url> → <n> chars` pour chaque onglet

Si le bundle remonte 0 onglets pour Grundfos : vérifier dans l'onglet Network que Jina retourne bien `data.html` dans la réponse POST (sinon, ajuster les headers en task 4).

- [ ] **Step 7.6 : Commit**

```bash
git add src/features/excel/ai-enrichment/useProductEnrichment.ts
git commit -m "feat(enrichment): wire scrapeProductBundle into main enrichment flow"
```

---

## Task 8 : UI — afficher les URLs scrapées dans les logs

**Files:**
- Modify: `src/features/excel/ai-enrichment/EnrichmentPanel.tsx`

- [ ] **Step 8.1 : Localiser le bloc logs existant**

Run: `grep -n "logs\[" src/features/excel/ai-enrichment/EnrichmentPanel.tsx`
Noter les numéros de lignes du bloc d'affichage logs.

- [ ] **Step 8.2 : Ajouter l'affichage des `sourcesScrapped`**

Dans le bloc qui affiche le cache `ScrapeCache` (rechercher `productUrl` et `additionalSources`), ajouter un sous-bloc :

```tsx
{cache?.sourcesScrapped && cache.sourcesScrapped.length > 1 && (
  <details className="mt-2">
    <summary className="text-xs text-neutral-400 cursor-pointer hover:text-neutral-200">
      {cache.sourcesScrapped.length} sources scrapées
    </summary>
    <ul className="mt-1 space-y-1">
      {cache.sourcesScrapped.map((url, i) => (
        <li key={i} className="text-xs text-neutral-500 truncate">
          <a href={url} target="_blank" rel="noreferrer" className="hover:text-indigo-400">
            {url}
          </a>
        </li>
      ))}
    </ul>
  </details>
)}
```

Placer ce bloc juste après l'affichage existant de `productUrl`.

- [ ] **Step 8.3 : Vérifier visuellement**

Run: `npm run dev`
Ouvrir un produit enrichi avec plusieurs onglets (cas Grundfos). Cliquer sur le détails « N sources scrapées » — la liste doit s'ouvrir.

- [ ] **Step 8.4 : Commit**

```bash
git add src/features/excel/ai-enrichment/EnrichmentPanel.tsx
git commit -m "feat(enrichment): show list of scraped sources in panel"
```

---

## Task 9 : Tests de régression Milwaukee / Nicoll / Grundfos

**Files:**
- Aucune modification de code. Validation manuelle bloquante avant merge.

- [ ] **Step 9.1 : Préparer le panier de test**

Créer `docs/superpowers/plans/2026-04-14-regression-checklist.md` avec 3 URLs figées :
- Milwaukee : URL d'un produit éprouvé (demander à l'utilisateur la référence précise du dernier enrichissement réussi)
- Nicoll : URL d'un produit éprouvé
- Grundfos : `https://product-selection.grundfos.com/fr/products/alpha/alpha1-go/alpha1-go-25-40-130-93074186?pumpsystemid=2848327458&tab=variant-curves`

- [ ] **Step 9.2 : Snapshot AVANT (branche master)**

```bash
git stash
# Revenir sur master si nécessaire : git checkout master
npm run dev
```

Pour chaque URL du panier :
1. Enrichir le produit
2. Copier le JSON `EnrichedProduct` affiché dans `EnrichmentPanel` (bouton « Copier JSON » s'il existe, sinon DevTools → Zustand store `__enrichStore.getState().entries`)
3. Sauvegarder dans `/tmp/regression-before/<brand>.json`

- [ ] **Step 9.3 : Snapshot APRÈS (branche feature)**

```bash
# Revenir sur la branche feature
git checkout <feature-branch>
git stash pop  # si modifs non commitées
npm run dev
```

Répéter l'enrichissement pour les 3 URLs → `/tmp/regression-after/<brand>.json`.

- [ ] **Step 9.4 : Diff structurel**

Pour chaque couple (avant/après) :

```bash
diff -u /tmp/regression-before/milwaukee.json /tmp/regression-after/milwaukee.json
diff -u /tmp/regression-before/nicoll.json /tmp/regression-after/nicoll.json
diff -u /tmp/regression-before/grundfos.json /tmp/regression-after/grundfos.json
```

**Critères de validation** :
- Milwaukee : clés identiques OU valeurs additionnelles (specs ajoutées, jamais retirées). Aucune spec existante modifiée.
- Nicoll : idem Milwaukee.
- Grundfos : enrichissement **significatif** attendu (≥ 5 specs supplémentaires, PDFs détectés dans `manufacturerDownloads`, description enrichie avec contenu des onglets Variantes/Courbes).

- [ ] **Step 9.5 : Si régression détectée**

Activer le kill-switch pour isoler la cause :
- Dans DevTools console : `window.__enrichStore.getState().setMultiUrlEnabled(false)`
- Re-enrichir le produit
- Le JSON doit revenir identique au snapshot AVANT
- Si oui → bug dans la logique multi-URL, diagnostiquer via les logs `[bundle] *` et les URLs découvertes
- Si non → régression indépendante du multi-URL (à chercher ailleurs)

- [ ] **Step 9.6 : Documenter les résultats**

Écrire un court résumé dans `docs/superpowers/plans/2026-04-14-regression-results.md` :
- Résultat pour chaque URL (OK / régression)
- Métriques quantitatives Grundfos : nb specs avant / après, nb PDFs, taille markdown final

- [ ] **Step 9.7 : Commit final**

```bash
git add docs/superpowers/plans/2026-04-14-regression-checklist.md docs/superpowers/plans/2026-04-14-regression-results.md
git commit -m "test(enrichment): regression checklist Milwaukee/Nicoll/Grundfos"
```

---

## Self-Review Complete

**Spec coverage check:**
- ✅ Passe 1 (browser mode, retour HTML) → Task 4
- ✅ Passe 2 (découverte URLs liées, tabs/pdfs/subpages) → Tasks 2-3
- ✅ Passe 3 (scrape parallèle + fusion + dédup) → Task 5
- ✅ Cache par URL (sourcesScrapped) → Task 6
- ✅ Toggle multiUrlEnabled → Task 6
- ✅ Plafond 8 URLs additionnelles → Task 5 (`MAX_ADDITIONAL_URLS`)
- ✅ Fallback direct mode si browser échoue → Déjà présent dans `jinaScrapeMaufacturerPageFallback`, préservé
- ✅ Tests de régression Milwaukee/Nicoll/Grundfos bloquants → Task 9
- ✅ UI affichage URLs scrapées → Task 8
- ✅ Hash dédup paragraphes → Task 5 (`hashParagraph`)
- ✅ Filtres anti-bruit nav/footer → Task 2 (`isInsideNav`)

**Placeholder scan:** Aucun TBD/TODO/« handle edge cases » sans code. Chaque step code est accompagné de son implémentation complète.

**Type consistency:**
- `DeepScrapeResult { markdown, html, source }` introduit en Task 4, consommé en Task 7 via `{ markdown, html }`.
- `RelatedUrls { tabs, pdfs, subpages }` défini en Task 2, consommé en Task 5.
- `ScrapedBundle { primaryUrl, primaryMarkdown, sourcesScrapped, mergedMarkdown, pdfsFound, errors }` défini en Task 5, consommé en Task 7.
- `ScrapeCache.sourcesScrapped?: string[]` ajouté en Task 6, consommé en Task 8.
- `multiUrlEnabled: boolean` + `setMultiUrlEnabled` défini en Task 6, lu en Task 7 via `useEnrichmentStore.getState().multiUrlEnabled`, exposé runtime pour DevTools en Task 9.
