import { useState, useCallback, useRef } from 'react'
import type { ExcelColumn, ExcelRow, ExcelSheet } from '@/features/excel/types'
import { getApiKey } from '@/lib/apiKeys'

const FIRECRAWL_BASE = 'https://api.firecrawl.dev/v1'

const headers = () => ({
  'Content-Type': 'application/json',
  Authorization: `Bearer ${getApiKey('firecrawl')}`,
})

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ScrapingField {
  key: string
  label: string
  description: string
  type: 'string' | 'number' | 'boolean' | 'dict' | 'specs' | 'strings'
}

export interface ScrapeResult {
  rows: Record<string, unknown>[]
  columns: string[]
  screenshot?: string
}

export interface MapLink {
  url: string
  title?: string
}

export interface CrawlPage {
  url: string
  title: string
  content: string
}

export type ScrapingMode = 'auto' | 'schema'

// ─── Templates ────────────────────────────────────────────────────────────────

export const FIELD_TEMPLATES: Record<string, { label: string; fields: ScrapingField[] }> = {
  product: {
    label: 'Produit',
    fields: [
      { key: 'name', label: 'Nom', description: 'Nom complet du produit principal uniquement', type: 'string' },
      { key: 'reference', label: 'Référence', description: 'Code référence ou SKU du produit principal', type: 'string' },
      { key: 'price', label: 'Prix', description: 'Prix de vente TTC affiché (ex: 299,00 €)', type: 'string' },
      { key: 'description', label: 'Description', description: 'Description ou accroche principale du produit, pas les accessoires', type: 'string' },
      { key: 'category', label: 'Catégorie', description: 'Catégorie ou famille de produit', type: 'string' },
      { key: 'brand', label: 'Marque', description: 'Marque ou fabricant', type: 'string' },
      { key: 'availability', label: 'Disponibilité', description: 'Disponibilité ou état du stock', type: 'string' },
      { key: 'ean', label: 'EAN', description: 'Code EAN ou code-barres du produit', type: 'string' },
      { key: 'image_url', label: 'Image', description: 'URL complète de la photo principale du produit', type: 'string' },
      { key: 'specifications', label: 'Spécifications', description: 'Toutes les spécifications techniques en tableau [{name, value}]. Inclure chaque ligne du tableau technique sans exception.', type: 'specs' },
    ],
  },
  product_tech: {
    label: 'Produit tech',
    fields: [
      { key: 'name', label: 'Nom', description: 'Nom complet du produit principal', type: 'string' },
      { key: 'reference', label: 'Référence', description: 'Code référence (ex: DUH752Z)', type: 'string' },
      { key: 'price', label: 'Prix', description: 'Prix de vente affiché', type: 'string' },
      { key: 'description', label: 'Description', description: 'Description courte du produit principal uniquement', type: 'string' },
      { key: 'brand', label: 'Marque', description: 'Marque ou fabricant', type: 'string' },
      { key: 'availability', label: 'Disponibilité', description: 'Stock ou disponibilité', type: 'string' },
      { key: 'ean', label: 'EAN', description: 'Code EAN ou code-barres', type: 'string' },
      { key: 'image_url', label: 'Image URL', description: 'URL complète de la photo principale du produit', type: 'string' },
      { key: 'specifications', label: 'Spécifications techniques', description: 'Capturer TOUTES les lignes du tableau des spécifications techniques sous forme [{name, value}]. Inclure CHAQUE ligne : Énergie, SPM, longueur lame, diamètre max, poids, dimensions, niveau sonore, vibrations, etc.', type: 'specs' },
    ],
  },
  product_full: {
    label: 'Produit complet',
    fields: [
      { key: 'name', label: 'Nom', description: 'Nom complet du produit principal', type: 'string' },
      { key: 'reference', label: 'Référence', description: 'Code référence ou SKU (ex: DUH752Z)', type: 'string' },
      { key: 'subtitle', label: 'Sous-titre', description: 'Sous-titre ou accroche courte du produit (ex: "18 V Li-Ion - 75 cm - Produit seul")', type: 'string' },
      { key: 'description', label: 'Description', description: 'Description complète du produit principal : toutes les phrases descriptives, accroche, caractéristiques principales. NE PAS tronquer.', type: 'string' },
      { key: 'advantages', label: 'Avantages', description: 'Liste de TOUS les avantages utilisateur mentionnés (chaque bullet point), sous forme de tableau de strings', type: 'strings' },
      { key: 'brand', label: 'Marque', description: 'Marque ou fabricant', type: 'string' },
      { key: 'availability', label: 'Disponibilité', description: 'Stock ou disponibilité (ex: "En stock", "En rupture de stock")', type: 'string' },
      { key: 'ean', label: 'EAN', description: 'Code EAN ou code-barres', type: 'string' },
      { key: 'images', label: 'Images', description: 'URLs COMPLÈTES de TOUTES les images produit (photos sous différents angles, vues). Inclure chaque URL d\'image produit trouvée sur la page, sous forme de tableau de strings.', type: 'strings' },
      { key: 'specifications', label: 'Spécifications techniques', description: 'TOUTES les lignes de TOUTES les sections de spécifications sous forme [{name, value}]. Inclure CHAQUE section (Informations, Poids, Puissance, Décibels, Vibrations, Dimensions, Batterie, etc.) et CHAQUE ligne de chaque section. Capturer aussi les specs dans les accordéons ou sections repliables. Sans exception, sans limite.', type: 'specs' },
      { key: 'documents', label: 'Documents', description: 'URLs ABSOLUES et COMPLÈTES (commençant par https://) de tous les fichiers téléchargeables présents sur la page : PDF, notices, fiches techniques, déclarations de conformité CE, manuels d\'utilisation. Chercher les attributs href des balises <a> dont le lien se termine par .pdf ou pointe vers un téléchargement. Ne retourner QUE les URLs, jamais les titres textuels.', type: 'strings' },
    ],
  },
  listing: {
    label: 'Catalogue',
    fields: [
      { key: 'name', label: 'Nom', description: 'Nom du produit ou article', type: 'string' },
      { key: 'price', label: 'Prix', description: 'Prix affiché', type: 'string' },
      { key: 'url', label: 'URL', description: 'Lien vers la page détail', type: 'string' },
      { key: 'image', label: 'Image', description: "URL de l'image principale", type: 'string' },
    ],
  },
  article: {
    label: 'Article',
    fields: [
      { key: 'title', label: 'Titre', description: "Titre de l'article", type: 'string' },
      { key: 'date', label: 'Date', description: 'Date de publication', type: 'string' },
      { key: 'author', label: 'Auteur', description: "Nom de l'auteur", type: 'string' },
      { key: 'summary', label: 'Résumé', description: "Résumé ou extrait de l'article", type: 'string' },
      { key: 'url', label: 'URL', description: "Lien vers l'article", type: 'string' },
    ],
  },
  contact: {
    label: 'Contact',
    fields: [
      { key: 'name', label: 'Nom', description: 'Nom de la personne ou entreprise', type: 'string' },
      { key: 'email', label: 'Email', description: 'Adresse email', type: 'string' },
      { key: 'phone', label: 'Téléphone', description: 'Numéro de téléphone', type: 'string' },
      { key: 'address', label: 'Adresse', description: 'Adresse postale complète', type: 'string' },
    ],
  },
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

export type ExtractionTarget = 'single' | 'multiple'

function buildJsonSchema(fields: ScrapingField[], target: ExtractionTarget = 'multiple') {
  const properties: Record<string, unknown> = {}
  for (const f of fields) {
    if (f.type === 'dict') {
      properties[f.key] = {
        type: 'object',
        description: f.description,
        additionalProperties: { type: 'string' },
      }
    } else if (f.type === 'strings') {
      properties[f.key] = {
        type: 'array',
        description: f.description,
        items: { type: 'string' },
      }
    } else if (f.type === 'specs') {
      // Array de {name, value} — le plus fiable pour les tableaux de specs
      properties[f.key] = {
        type: 'array',
        description: f.description,
        items: {
          type: 'object',
          properties: {
            name: { type: 'string', description: 'Nom de la spécification' },
            value: { type: 'string', description: 'Valeur de la spécification' },
          },
          required: ['name', 'value'],
        },
      }
    } else {
      properties[f.key] = { type: f.type, description: f.description }
    }
  }
  // Page produit / fiche unique → schema plat (pas d'items[])
  if (target === 'single') {
    return { type: 'object', properties, required: fields.map((f) => f.key) }
  }
  // Catalogue / listing → tableau d'items
  return {
    type: 'object',
    properties: {
      items: {
        type: 'array',
        description: 'Liste exhaustive de TOUS les éléments trouvés sur la page',
        items: { type: 'object', properties, required: fields.map((f) => f.key) },
      },
    },
    required: ['items'],
  }
}

function normalizeToRows(
  data: unknown,
  fields: ScrapingField[],
  target: ExtractionTarget = 'multiple',
): Omit<ScrapeResult, 'screenshot'> {
  if (!data || typeof data !== 'object') return { rows: [], columns: [] }
  const d = data as Record<string, unknown>
  const cols = fields.length > 0 ? fields.map((f) => f.key) : Object.keys(d)

  // Mode "produit unique" : l'objet entier EST la ligne — ne pas chercher de tableau imbriqué
  if (target === 'single') {
    return { rows: [d], columns: cols }
  }

  // Mode "multiple" : chercher un tableau d'items
  const toColumns = (rows: Record<string, unknown>[]) =>
    fields.length > 0 ? fields.map((f) => f.key) : Object.keys(rows[0] ?? {})

  if (Array.isArray(d.items) && d.items.length > 0) {
    const rows = d.items as Record<string, unknown>[]
    return { rows, columns: toColumns(rows) }
  }
  if (Array.isArray(data) && (data as unknown[]).length > 0) {
    const rows = data as Record<string, unknown>[]
    return { rows, columns: toColumns(rows) }
  }
  // Chercher le premier tableau dans l'objet (hors champs specs et strings)
  for (const [key, v] of Object.entries(d)) {
    if (key === 'specifications') continue
    if (Array.isArray(v) && v.length > 0 && typeof v[0] === 'string') continue // tableau de strings → pas des lignes
    if (Array.isArray(v) && v.length > 0 && typeof (v[0] as Record<string,unknown>)?.name !== 'string') {
      const rows = v as Record<string, unknown>[]
      return { rows, columns: toColumns(rows) }
    }
  }
  return { rows: [d], columns: cols }
}

export function scrapeResultToSheet(result: ScrapeResult, fields: ScrapingField[], name: string): ExcelSheet {
  const labelMap = Object.fromEntries(fields.map((f) => [f.key, f.label]))

  const isSpecsArray = (v: unknown): v is { name: string; value: string }[] =>
    Array.isArray(v) && v.length > 0 && typeof (v[0] as Record<string, unknown>)?.name === 'string'

  const isStringsArray = (v: unknown): v is string[] =>
    Array.isArray(v) && (v.length === 0 || typeof v[0] === 'string')

  const serializeCell = (v: unknown): string | null => {
    if (v == null) return null
    if (isSpecsArray(v)) return v.map((s) => `${s.name}: ${s.value}`).join(' | ')
    if (isStringsArray(v)) return v.join(' | ')
    if (typeof v === 'object') {
      return Object.entries(v as Record<string, unknown>).map(([k, val]) => `${k}: ${val}`).join(' | ')
    }
    return String(v)
  }

  // 1. Construire les colonnes de specs dynamiques (une colonne par spec)
  const specsColumns: ExcelColumn[] = []
  const specsData: Map<string, string[]> = new Map()

  for (const row of result.rows) {
    for (const col of result.columns) {
      const v = row[col]
      if (!isSpecsArray(v)) continue
      for (const spec of v) {
        const key = `spec_${spec.name.toLowerCase().replace(/[^a-z0-9]+/g, '_').slice(0, 40)}`
        if (!specsData.has(key)) {
          specsData.set(key, [])
          specsColumns.push({ key, label: spec.name, fieldType: 'text', detectedType: 'text', isPrimary: false, width: 160 })
        }
        specsData.get(key)!.push(spec.value)
      }
    }
  }

  // Helper: détecter si une colonne contient des URLs d'images
  const IMG_EXTS = /\.(jpe?g|png|webp|gif|avif|svg)(\?.*)?$/i
  const isImageCol = (key: string): boolean => {
    for (const r of result.rows) {
      const v = r[key]
      // String directe
      if (typeof v === 'string' && v.startsWith('http')) return IMG_EXTS.test(v)
      // Tableau de strings (ex: field type 'strings')
      if (Array.isArray(v) && v.length > 0) {
        const first = v.find(x => typeof x === 'string' && (x as string).startsWith('http'))
        if (first) return IMG_EXTS.test(first as string)
      }
    }
    return false
  }

  // 2. Colonnes standard (sauf celles remplacées par des specs)
  const specsKeys = new Set(specsColumns.map((s) => s.key))
  const baseColumns: ExcelColumn[] = result.columns
    .filter((key) => !isSpecsArray(result.rows[0]?.[key]) && !(isStringsArray(result.rows[0]?.[key]) && specsKeys.has(key)))
    .map((key, i) => {
      const imgCol = isImageCol(key)
      return {
        key, label: labelMap[key] ?? key,
        fieldType: imgCol ? 'image' as const : 'text' as const,
        detectedType: imgCol ? 'image' as const : 'text' as const,
        isPrimary: i === 0 && specsKeys.size === 0,
        width: imgCol ? 120 : 180,
      }
    })

  const columns = [...baseColumns, ...specsColumns]
  if (columns.length > 0) columns[0].isPrimary = true

  // 3. Lignes
  const rows: ExcelRow[] = result.rows.map((r, i) => {
    const base: ExcelRow = {
      _id: `scraped_${i}`,
      ...Object.fromEntries(
        result.columns
          .filter((k) => !isSpecsArray(r[k]))
          .map((k) => [k, serializeCell(r[k])])
      ),
    }
    for (const [key, values] of specsData.entries()) {
      base[key] = values[i] ?? null
    }
    return base
  })

  return { name, columns, rows, taxonomy: [] }
}

export function crawlPagesToSheet(pages: CrawlPage[], name: string): ExcelSheet {
  return {
    name,
    columns: [
      { key: 'url', label: 'URL', fieldType: 'url', detectedType: 'url', isPrimary: true, width: 280 },
      { key: 'title', label: 'Titre', fieldType: 'text', detectedType: 'text', isPrimary: false, width: 200 },
      { key: 'content', label: 'Contenu', fieldType: 'text_long', detectedType: 'text_long', isPrimary: false, width: 400 },
    ],
    rows: pages.map((p, i) => ({ _id: `crawl_${i}`, url: p.url, title: p.title, content: p.content })),
    taxonomy: [],
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

// Extrait les liens de fichiers téléchargeables (PDF, docs, vidéos) depuis le HTML brut
function extractDocLinksFromHtml(html: string, pageUrl: string): string[] {
  if (!html) return []
  const DOC_EXT = /\.(pdf|docx?|xlsx?|pptx?|zip|mp4|webm)(\?[^"']*)?$/i
  const matches = [...html.matchAll(/href=["']([^"'#\s]+)["']/gi)]
  const links = matches
    .map(m => {
      const href = m[1]
      if (href.startsWith('http')) return href
      // Résoudre les URLs relatives
      try { return new URL(href, pageUrl).href } catch { return null }
    })
    .filter((l): l is string => !!l && DOC_EXT.test(l))
  return [...new Set(links)]
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useFirecrawl() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)
  const abortRef = useRef(false)

  const reset = () => { setError(null); setProgress(null); abortRef.current = false }

  // ── Scrape (single URL, synchronous) ──────────────────────────────────────
  const scrape = useCallback(async (
    url: string, mode: ScrapingMode, fields: ScrapingField[],
    prompt: string, opts: { mobile?: boolean; screenshot?: boolean; proxy?: 'basic' | 'enhanced' | 'auto'; target?: ExtractionTarget; waitFor?: number } = {},
  ): Promise<ScrapeResult | null> => {
    setLoading(true); reset()
    try {
      const hasFields = mode === 'schema' && fields.length > 0
      const target = opts.target ?? 'multiple'
      // Toujours inclure html pour récupérer les liens PDF depuis le DOM
      const formats = ['extract', 'html', ...(opts.screenshot ? ['screenshot'] : [])]
      const extract: Record<string, unknown> = {}
      if (hasFields) extract.schema = buildJsonSchema(fields, target)
      const isSingle = target === 'single'
      const antiHallucination = `RÈGLE ABSOLUE : n'invente JAMAIS de données. Si une information n'est pas clairement lisible sur la page, retourne null ou une chaîne vide pour ce champ. Ne déduis pas, n'invente pas, ne complète pas avec des valeurs génériques ou fictives.`
      extract.prompt = prompt.trim() || (
        isSingle
          ? `Extrais UNIQUEMENT les données du produit PRINCIPAL visible sur cette page. Ignore les produits similaires, accessoires, navigation et footer. Retourne un objet unique (PAS une liste). ${antiHallucination}`
          : hasFields
            ? `Extrais TOUS les éléments de la liste sur cette page sous forme de tableau "items". Ignore menus et footer. ${antiHallucination}`
            : `Extrais les données structurées PRINCIPALES de cette page sous forme de tableau "items". ${antiHallucination}`
      )
      console.log('[Firecrawl] request →', { url, target, mode, hasFields, schema: extract.schema, prompt: extract.prompt })

      const body: Record<string, unknown> = {
        url, formats, extract,
        onlyMainContent: true,
        excludeTags: ['nav', 'header', 'footer', 'script', 'style', 'noscript'],
        ...(opts.waitFor && opts.waitFor > 0 && { waitFor: opts.waitFor }),
        ...(opts.mobile && { mobile: true }),
        ...(opts.proxy && { proxy: opts.proxy }),
      }

      const res = await fetch(`${FIRECRAWL_BASE}/scrape`, { method: 'POST', headers: headers(), body: JSON.stringify(body) })
      if (!res.ok) throw new Error((await res.json() as { error?: string }).error ?? `HTTP ${res.status}`)
      const json = await res.json() as { success: boolean; data?: { extract?: unknown; html?: string; screenshot?: string }; error?: string }
      if (!json.success) throw new Error(json.error ?? 'Firecrawl error')
      if (!json.data?.extract) throw new Error('Aucune donnée extraite — affine le schéma ou le prompt')

      // Extraire les liens de fichiers depuis le HTML brut (PDF, docs, vidéos)
      const htmlDocLinks = extractDocLinksFromHtml(json.data.html ?? '', url)
      console.log('[Firecrawl] doc links from HTML →', htmlDocLinks)

      // Injecter les liens dans le champ "documents" si l'extraction IA l'a manqué
      const rawExtract = json.data.extract as Record<string, unknown>
      if (htmlDocLinks.length > 0 && fields.some(f => f.key === 'documents')) {
        const existing = rawExtract.documents
        const isEmpty = !existing || (Array.isArray(existing) && existing.length === 0)
        if (isEmpty) rawExtract.documents = htmlDocLinks
      }

      console.log('[Firecrawl] raw extract →', rawExtract)

      // Détecter les données hallucinées / fictives évidentes
      const allValues = Object.values(rawExtract).filter(v => typeof v === 'string').map(v => String(v))
      const hallucinationPatterns = /^(produit principal|marque x|nom du produit|product name|example|lorem ipsum|n\/a|non disponible|non spécifié|not available|your product|test product)$/i
      const fakeEan = /^(1234567890123|0000000000000|9999999999999)$/
      const hasHallucination = allValues.some(v => hallucinationPatterns.test(v.trim()) || fakeEan.test(v.trim()))
      if (hasHallucination) {
        throw new Error('Les données extraites semblent fictives (le site bloque probablement le scraping). Essayez avec un proxy renforcé ou waitFor 5s.')
      }

      const { rows, columns } = normalizeToRows(rawExtract, fields, target)
      console.log('[Firecrawl] normalized →', { rows: rows.length, columns, target })
      if (rows.length === 0) throw new Error('Aucune ligne extraite — affine le schéma ou le prompt')
      return { rows, columns, screenshot: json.data.screenshot }
    } catch (e) { setError(e instanceof Error ? e.message : 'Erreur'); return null }
    finally { setLoading(false) }
  }, [])

  // ── Map (discover URLs) ────────────────────────────────────────────────────
  const map = useCallback(async (url: string, search?: string): Promise<MapLink[] | null> => {
    setLoading(true); reset()
    try {
      const body: Record<string, unknown> = { url, limit: 500, ignoreSitemap: false }
      if (search?.trim()) body.search = search.trim()
      const res = await fetch(`${FIRECRAWL_BASE}/map`, { method: 'POST', headers: headers(), body: JSON.stringify(body) })
      if (!res.ok) throw new Error((await res.json() as { error?: string }).error ?? `HTTP ${res.status}`)
      const json = await res.json() as { success: boolean; links?: (string | MapLink)[]; error?: string }
      if (!json.success) throw new Error(json.error ?? 'Map error')
      return (json.links ?? []).map((l) => typeof l === 'string' ? { url: l } : l)
    } catch (e) { setError(e instanceof Error ? e.message : 'Erreur'); return null }
    finally { setLoading(false) }
  }, [])

  // ── Extract async (multi-URL) ──────────────────────────────────────────────
  const extract = useCallback(async (
    urls: string[], fields: ScrapingField[], prompt: string,
    opts: { enableWebSearch?: boolean } = {},
  ): Promise<ScrapeResult | null> => {
    setLoading(true); reset()
    try {
      const body: Record<string, unknown> = {
        urls,
        ...(fields.length > 0 && { schema: buildJsonSchema(fields) }),
        prompt: prompt.trim() || 'Extrais les données structurées de chaque page.',
        ...(opts.enableWebSearch && { enableWebSearch: true }),
      }
      const startRes = await fetch(`${FIRECRAWL_BASE}/extract`, { method: 'POST', headers: headers(), body: JSON.stringify(body) })
      if (!startRes.ok) throw new Error((await startRes.json() as { error?: string }).error ?? `HTTP ${startRes.status}`)
      const { id } = await startRes.json() as { id: string }

      // Poll
      while (!abortRef.current) {
        await sleep(2500)
        const pollRes = await fetch(`${FIRECRAWL_BASE}/extract/${id}`, { headers: headers() })
        const poll = await pollRes.json() as { status: string; data?: unknown; error?: string }
        if (poll.status === 'completed') {
          const { rows, columns } = normalizeToRows(poll.data, fields)
          if (rows.length === 0) throw new Error('Aucun résultat extrait')
          return { rows, columns }
        }
        if (poll.status === 'failed') throw new Error(poll.error ?? 'Extraction échouée')
      }
      return null
    } catch (e) { setError(e instanceof Error ? e.message : 'Erreur'); return null }
    finally { setLoading(false) }
  }, [])

  // ── Crawl async (full site) ────────────────────────────────────────────────
  const crawl = useCallback(async (
    url: string,
    opts: { limit?: number; includePaths?: string; excludePaths?: string } = {},
    onPage?: (page: CrawlPage) => void,
  ): Promise<CrawlPage[] | null> => {
    setLoading(true); reset()
    try {
      const body: Record<string, unknown> = {
        url,
        limit: opts.limit ?? 50,
        scrapeOptions: { formats: ['markdown'], onlyMainContent: true },
        ...(opts.includePaths?.trim() && { includePaths: [opts.includePaths.trim()] }),
        ...(opts.excludePaths?.trim() && { excludePaths: [opts.excludePaths.trim()] }),
      }
      const startRes = await fetch(`${FIRECRAWL_BASE}/crawl`, { method: 'POST', headers: headers(), body: JSON.stringify(body) })
      if (!startRes.ok) throw new Error((await startRes.json() as { error?: string }).error ?? `HTTP ${startRes.status}`)
      const { id } = await startRes.json() as { id: string }
      const pages: CrawlPage[] = []

      while (!abortRef.current) {
        await sleep(2500)
        const pollRes = await fetch(`${FIRECRAWL_BASE}/crawl/${id}`, { headers: headers() })
        const poll = await pollRes.json() as {
          status: string; total: number; completed: number; error?: string
          data?: { metadata?: { url?: string; title?: string }; markdown?: string }[]
        }
        setProgress({ done: poll.completed ?? 0, total: poll.total ?? 0 })
        if (poll.data) {
          for (const page of poll.data) {
            const p: CrawlPage = {
              url: page.metadata?.url ?? '',
              title: page.metadata?.title ?? '',
              content: (page.markdown ?? '').slice(0, 2000),
            }
            if (!pages.find((x) => x.url === p.url)) { pages.push(p); onPage?.(p) }
          }
        }
        if (poll.status === 'completed') return pages
        if (poll.status === 'failed') throw new Error(poll.error ?? 'Crawl échoué')
      }
      return pages.length > 0 ? pages : null
    } catch (e) { setError(e instanceof Error ? e.message : 'Erreur'); return null }
    finally { setLoading(false) }
  }, [])

  const abort = () => { abortRef.current = true }

  return { scrape, map, extract, crawl, abort, loading, error, progress }
}
