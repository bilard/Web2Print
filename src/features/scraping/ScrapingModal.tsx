import { useState, useMemo, useEffect, useRef } from 'react'
import { X, Globe, Download, AlertCircle, Sparkles, Map as MapIcon, FolderSync, Loader2, ExternalLink, Tag } from 'lucide-react'
import { TypedLogConsole } from '@/features/excel/ai-enrichment/TypedLogConsole'
import { useJina, scrapeResultToSheet, enrichedProductToSheet, enrichedProductsToSheet, detectBrandLabelFromUrl } from './useJina'
import type { ScrapingField, ScrapingMode, ScrapeResult, MapLink, CrawlPage, ExtractionTarget } from './useJina'
import type { EnrichedProduct } from '@/features/excel/ai-enrichment/types'
import type { ExcelSheet, ExcelRow } from '@/features/excel/types'
import { buildTaxonomyFromLevels } from '@/features/excel/taxonomyBuilder'
import { ScrapeTab } from './ScrapeTab'
import { MapExtractTab } from './MapExtractTab'
import { CrawlTab } from './CrawlTab'
import { ScrapingPreview } from './ScrapingPreview'
import { ProductEnrichedView } from './ProductEnrichedView'
import { useExcelStore } from '@/stores/excel.store'
import { useProductEnrichment } from '@/features/excel/ai-enrichment/useProductEnrichment'
import { useEnrichmentStore } from '@/features/excel/ai-enrichment/enrichmentStore'
import { enrichmentKey } from '@/features/excel/ai-enrichment/types'
import { ENRICHMENT_COLUMNS, buildEnrichmentColumn, serializeEnriched } from '@/features/excel/ai-enrichment/useSaveEnrichedProduct'
import { matchRows, applyPreview } from '@/features/pim'
import type { MergePreview, Source } from '@/features/pim/types'
import { useUpsertProducts } from '@/features/pim/useProducts'
import { useUpsertSource } from '@/features/pim/useSources'
import { usePimStore } from '@/stores/pim.store'
import { useTaxonomies } from '@/features/taxonomy/useTaxonomies'
import { useBulkAttachToTaxonomy } from '@/features/taxonomy/useBulkAttachToTaxonomy'
import { MatchPreviewModal } from '@/components/pim/MatchPreviewModal'
import { scrapeResultToColumns } from './core/scrapeToRows'
import { toast } from 'sonner'

/** Clé synthétique : la modal de scraping n'a pas de feuille — on isole dans
 *  un namespace dédié pour ne pas polluer les enrichissements de feuilles
 *  Excel réelles. */
const SCRAPE_MODAL_SHEET = '__scrape_modal__'

type Tab = 'scrape' | 'map' | 'crawl'

interface Props {
  open: boolean
  onClose: () => void
  /** Chemin cible dans l'arbre de bases de données (racine = []). */
  targetPath?: string[]
  /** Source existante à re-scraper : son ID est réutilisé (pas de doublon). */
  resyncSource?: Source
}

const TABS: { id: Tab; label: string; Icon: typeof Globe; color: string }[] = [
  { id: 'scrape', label: 'Scrape', Icon: Sparkles, color: 'text-indigo-400' },
  { id: 'map', label: 'Map + Extract', Icon: MapIcon, color: 'text-blue-400' },
  { id: 'crawl', label: 'Crawl', Icon: FolderSync, color: 'text-amber-400' },
]

export function ScrapingModal({ open, onClose, targetPath, resyncSource }: Props) {
  const [tab, setTab] = useState<Tab>('scrape')
  const [url, setUrl] = useState(resyncSource?.url ?? '')
  const [result, setResult] = useState<ScrapeResult | null>(null)
  const [lastFields, setLastFields] = useState<ScrapingField[]>([])
  const [crawlPages, setCrawlPages] = useState<CrawlPage[]>([])

  /** Batch d'enrichissement multi-URLs (Map+Extract et Crawl) :
   *  applique la pipeline `enrich()` (Produit complet) à chaque URL. */
  interface BatchItem {
    url: string
    title: string
    rowId: string
    product?: EnrichedProduct
    error?: string
    status: 'pending' | 'running' | 'done' | 'failed'
  }
  const [batch, setBatch] = useState<BatchItem[]>([])
  const [batchRunning, setBatchRunning] = useState(false)
  const [batchCurrentIdx, setBatchCurrentIdx] = useState<number | null>(null)
  /** Annulation demandée — affichée immédiatement dans l'UI même si
   *  l'item courant continue (enrich() n'accepte pas d'AbortSignal). */
  const [batchAborting, setBatchAborting] = useState(false)
  /** Index de l'item du batch dont la fiche détaillée (`ProductEnrichedView`)
   *  est actuellement affichée. null = liste seule. */
  const [batchPreviewIdx, setBatchPreviewIdx] = useState<number | null>(null)
  const batchAbortRef = useRef(false)
  const { scrape, map, abort, loading, error } = useJina()
  const { setSheets, setCurrentFileName, sheets } = useExcelStore()
  const setCurrentPath = useExcelStore((s) => s.setCurrentPath)

  // Auto-classement IA après import : taxonomie cible (optionnelle).
  const { data: taxonomies } = useTaxonomies()
  const bulkAttach = useBulkAttachToTaxonomy()
  const [importTaxoId, setImportTaxoId] = useState<string>('')

  // Pipeline d'enrichissement réutilisée pour le mode "Produit unique" :
  // produit la structure riche (advantages groupés, variants, specs communes
  // par groupe) directement depuis l'URL, sans passer par une feuille Excel.
  const { enrich, running: enriching, reset: resetEnrich } = useProductEnrichment()
  const clearEnrichEntry = useEnrichmentStore((s) => s.clear)
  const enrichRowId = (() => {
    try { return new URL(url).pathname.replace(/[^a-z0-9]/gi, '_').slice(0, 80) || 'pending' }
    catch { return 'pending' }
  })()
  const enrichKey = enrichmentKey(SCRAPE_MODAL_SHEET, enrichRowId)
  const enrichEntry = useEnrichmentStore((s) => s.entries[enrichKey])
  const enrichLogs = useEnrichmentStore((s) => s.logs[enrichKey] ?? [])

  // Subscribe live au progress de l'item courant du batch (texte qui change
  // pendant une itération unique d'`enrich()`).
  const allEntries = useEnrichmentStore((s) => s.entries)

  // Logs temps réel de l'item courant du batch (pile cascade Jina/Firecrawl/BrightData).
  const batchCurrentRowId = batchRunning && batchCurrentIdx !== null
    ? (batch[batchCurrentIdx]?.rowId ?? null)
    : null
  const batchCurrentLogs = useEnrichmentStore((s) =>
    batchCurrentRowId ? (s.logs[enrichmentKey(SCRAPE_MODAL_SHEET, batchCurrentRowId)] ?? []) : [],
  )

  // ── PIM branch ───────────────────────────────────────────────────────────
  const pimProjectId = usePimStore((s) => s.currentProjectId)
  const products = usePimStore((s) => s.products)
  const projects = usePimStore((s) => s.projects)
  const selectedSourceIds = usePimStore((s) => s.selectedSourceIds)
  const upsertProducts = useUpsertProducts(pimProjectId ?? '')
  const upsertSource = useUpsertSource(pimProjectId ?? '')

  /** Source(s) PIM sélectionnée(s) dans la sidebar — affichée en header pour
   *  rappeler à l'utilisateur dans quelle BDD le scrape sera ingéré.
   *  Recherche dans TOUS les projets, indépendamment du currentProjectId du modal,
   *  pour montrer le contexte sidebar même quand ouvert via "Scraper le web".
   *  Cherche aussi par hostname (ex: nicoll.fr) si l'ID n'est pas un UUID. */
  const selectedSources = useMemo(() => {
    if (selectedSourceIds.length === 0) return []
    // Cherche les sources sélectionnées dans tous les projets
    for (const project of projects) {
      // Cherche par ID ou par hostname/name
      const found = project.sources.filter((s) =>
        selectedSourceIds.includes(s.id) || selectedSourceIds.includes(s.name)
      )
      if (found.length > 0) return found
    }
    return []
  }, [projects, selectedSourceIds])


  const [previewOpen, setPreviewOpen] = useState(false)
  const [pendingRows, setPendingRows] = useState<Record<string, unknown>[]>([])
  const [pendingSource, setPendingSource] = useState<Source | null>(null)
  const [frozenPreview, setFrozenPreview] = useState<MergePreview | null>(null)

  const preview: MergePreview | null = useMemo(() => {
    if (!previewOpen || pendingRows.length === 0) return null
    return matchRows(pendingRows as never, products)
  }, [previewOpen, pendingRows, products])

  const startPreview = (rows: Record<string, unknown>[], source: Source) => {
    setPendingRows(rows)
    setPendingSource(source)
    setFrozenPreview(matchRows(rows as never, products))
    setPreviewOpen(true)
  }

  const confirmIngest = async () => {
    if (!pimProjectId || !pendingSource || !frozenPreview) return
    try {
      const result = applyPreview(frozenPreview, products, pendingSource.id, { now: Date.now() })
      await upsertSource.mutateAsync(pendingSource)
      await upsertProducts.mutateAsync(result.products)
      toast.success(`${result.stats.created} ajoutés · ${result.stats.merged} mergés`)
      setPreviewOpen(false)
      setFrozenPreview(null)
      onClose()
    } catch (err) {
      console.error('[ScrapingModal] confirmIngest error', err)
      toast.error(`Erreur d'import: ${err instanceof Error ? err.message : 'erreur inconnue'}`)
    }
  }
  // ─────────────────────────────────────────────────────────────────────────

  if (!open) return null

  const urlValid = (() => { try { new URL(url); return true } catch { return false } })()
  const hostname = (() => { try { return new URL(url).hostname.replace('www.', '') } catch { return 'scraped' } })()
  /** Nom affichable de la source : marque détectée (« Milwaukee », « DeWalt »…)
   *  si reconnue depuis l'URL, sinon le hostname. Utilisé pour le chip header
   *  ET comme nom de feuille / fichier / source à l'import. */
  const displayName = (() => {
    const brand = url ? detectBrandLabelFromUrl(url) : null
    return brand ?? hostname
  })()
  /** Titre dérivé du slug URL : `caniveau-avec-grille-acier-heel-c250-l100-int-kenadrain` →
   *  `caniveau avec grille acier heel c250 l100 int kenadrain`. Ce même titre
   *  est passé à enrich() (input.title) et réutilisé comme nom de produit
   *  pour la colonne primary `name` de la sheet importée. */
  const productTitle = (() => {
    try {
      const path = new URL(url).pathname.split('/').filter(Boolean).pop() ?? ''
      return path.replace(/[-_]+/g, ' ').replace(/\.\w{2,4}$/, '').trim() || hostname
    } catch { return hostname }
  })()

  const handleScrape = async (mode: ScrapingMode, fields: ScrapingField[], prompt: string, opts: { target?: ExtractionTarget; waitFor?: number; noCache?: boolean; manualBreadcrumb?: string[] }) => {
    // Mode "Produit unique" : route vers la pipeline d'enrichissement riche
    // (advantages groupés, variants table, specs communes) au lieu de l'extraction
    // Gemini → ligne plate. Les inputs schema/template/prompt sont ignorés ici :
    // on utilise le pipeline AUTO IA généraliste de useProductEnrichment.
    if (opts.target === 'single') {
      setResult(null)
      setLastFields([])
      // Reset de l'entrée précédente pour éviter d'afficher un résultat périmé
      clearEnrichEntry(SCRAPE_MODAL_SHEET, enrichRowId)
      resetEnrich(SCRAPE_MODAL_SHEET, enrichRowId)
      // Titre dérivé du slug URL — la pipeline le raffinera ensuite
      await enrich({
        sheetName: SCRAPE_MODAL_SHEET,
        rowId: enrichRowId,
        title: productTitle,
        knownUrl: url,
        mode: 'auto',
      })
      return
    }
    setResult(null)
    setLastFields(fields)
    const res = await scrape(url, mode, fields, prompt, opts)
    if (res) setResult(res)
  }

  const handleMap = async (search?: string, rootUrl?: string): Promise<MapLink[] | null> => {
    return map(rootUrl ?? url, search)
  }

  /** Découvre les produits sur la page fournie en UN SEUL appel Jina + IA :
   *  `scrape()` lit la page (jinaRead) ET demande au LLM d'extraire le nom +
   *  l'URL de chaque carte produit visible. Plus rapide que l'ancien flow à
   *  deux passes (map + scrape). Anti-hallucination par filtres URL côté
   *  client (host, regex include/exclude) — l'utilisateur peut compléter
   *  via la sélection manuelle. */
  const handleCrawl = async (opts: { limit: number; includePaths: string; excludePaths: string }, rootUrl?: string) => {
    const targetUrl = rootUrl ?? url
    // Si on est dans un loop multi-URL, on accumule plutôt qu'on reset
    if (!rootUrl) setCrawlPages([])

    let baseHost = ''
    try { baseHost = new URL(targetUrl).hostname } catch { /* URL invalide */ }
    const includeRe = opts.includePaths.trim() ? safeRegex(opts.includePaths.trim()) : null
    const excludeRe = opts.excludePaths.trim() ? safeRegex(opts.excludePaths.trim()) : null
    const startPath = (() => { try { return new URL(targetUrl).pathname } catch { return '' } })()

    // Schéma minimal (name + url uniquement) → moins de tokens LLM → plus rapide.
    const minimalListingFields = [
      { key: 'name', label: 'Nom', description: 'Nom du produit tel qu\'écrit sur la carte', type: 'string' as const },
      { key: 'url', label: 'URL', description: 'URL absolue du lien vers la fiche produit', type: 'string' as const },
    ]
    const aiRes = await scrape(
      targetUrl,
      'schema',
      minimalListingFields,
      "Pour CHAQUE produit affiché dans la grille principale de cette page, extrais son nom EXACT (tel qu'écrit sur la carte) et son URL ABSOLUE. Ignore le menu, le header, le footer, les suggestions latérales. Ne pas inventer de produits, n'extraire que ce qui est visible sur la page.",
      { target: 'multiple' },
    )
    if (!aiRes || aiRes.rows.length === 0) return

    const seen = new Set<string>()
    const products: CrawlPage[] = []
    for (const row of aiRes.rows) {
      const r = row as Record<string, unknown>
      const rawUrl = String(r.url ?? '')
      const name = String(r.name ?? '').trim()
      if (!rawUrl) continue
      try {
        const u = new URL(rawUrl, targetUrl)
        const absolute = u.toString()
        if (seen.has(absolute)) continue
        if (baseHost && !u.hostname.includes(baseHost)) continue
        if (u.pathname === startPath && u.hash) continue
        if (includeRe && !includeRe.test(u.pathname)) continue
        if (excludeRe && excludeRe.test(u.pathname)) continue
        seen.add(absolute)
        products.push({
          url: absolute,
          title: name || u.pathname,
          content: '',
        })
        if (products.length >= opts.limit) break
      } catch { /* URL invalide */ }
    }
    // Multi-URL : accumule, dédoublonne par URL absolue.
    setCrawlPages((prev) => {
      if (!rootUrl) return products
      const merged = [...prev]
      const seen = new Set(prev.map((p) => p.url))
      for (const p of products) {
        if (!seen.has(p.url)) { merged.push(p); seen.add(p.url) }
      }
      return merged
    })
  }

  /** Compile une regex en silence — retourne null si la chaîne est invalide. */
  const safeRegex = (s: string): RegExp | null => {
    try { return new RegExp(s) } catch { return null }
  }

  /** Dérive un titre lisible depuis l'URL (slug → "produit xyz"). */
  const deriveTitleFromUrl = (u: string): string => {
    try {
      const path = new URL(u).pathname.split('/').filter(Boolean).pop() ?? ''
      return path.replace(/[-_]+/g, ' ').replace(/\.\w{2,4}$/, '').trim() || new URL(u).hostname
    } catch { return u }
  }

  /** Dérive un rowId stable et unique pour chaque URL du batch (préfixe par
   *  index pour éviter les collisions sur slugs tronqués similaires). */
  const deriveBatchRowId = (u: string, i: number): string => {
    let slug = ''
    try { slug = new URL(u).pathname.replace(/[^a-z0-9]/gi, '_').slice(0, 60) }
    catch { slug = 'pending' }
    return `batch_${i}_${slug || 'item'}`
  }

  /** Lance la pipeline `enrich()` (Produit complet) sur N URLs séquentiellement.
   *  Mise à jour de `batch` après chaque produit pour un feedback live. */
  const handleEnrichMany = async (urls: string[]) => {
    if (urls.length === 0) return
    batchAbortRef.current = false
    setBatchAborting(false)
    setResult(null)
    setBatchRunning(true)
    setBatchCurrentIdx(null)

    // Initialise les items dans l'ordre — UI visible pendant le run
    const initial: BatchItem[] = urls.map((u, i) => ({
      url: u,
      title: deriveTitleFromUrl(u),
      rowId: deriveBatchRowId(u, i),
      status: 'pending',
    }))
    setBatch(initial)

    try {
      for (let i = 0; i < initial.length; i++) {
        if (batchAbortRef.current) break
        setBatchCurrentIdx(i)
        const item = initial[i]
        setBatch((prev) => prev.map((b, idx) => (idx === i ? { ...b, status: 'running' } : b)))

        try {
          const product = await enrich({
            sheetName: SCRAPE_MODAL_SHEET,
            rowId: item.rowId,
            title: item.title,
            knownUrl: item.url,
            mode: 'auto',
          })
          // Si une annulation a été demandée pendant cet enrich(), rejette le
          // résultat : l'utilisateur attend que ça s'arrête, on ne garde pas
          // ce produit qui n'aurait jamais existé sans le délai d'annulation.
          if (batchAbortRef.current) {
            setBatch((prev) => prev.map((b, idx) =>
              idx === i ? { ...b, status: 'failed', error: 'Annulé' } : b
            ))
          } else if (product) {
            setBatch((prev) => prev.map((b, idx) =>
              idx === i ? { ...b, status: 'done', product } : b
            ))
            // Auto-sélectionne le premier produit terminé pour aperçu live
            setBatchPreviewIdx((prev) => (prev === null ? i : prev))
          } else {
            setBatch((prev) => prev.map((b, idx) =>
              idx === i ? { ...b, status: 'failed', error: 'Aucun produit extrait' } : b
            ))
          }
        } catch (e) {
          setBatch((prev) => prev.map((b, idx) =>
            idx === i ? { ...b, status: 'failed', error: batchAbortRef.current ? 'Annulé' : (e instanceof Error ? e.message : 'Erreur') } : b
          ))
        }

        // Léger rate-limit Jina (cohérent avec extract())
        if (i < initial.length - 1 && !batchAbortRef.current) await new Promise((r) => setTimeout(r, 500))
      }
    } finally {
      setBatchCurrentIdx(null)
      setBatchRunning(false)
      setBatchAborting(false)
    }
  }

  const abortBatch = () => {
    batchAbortRef.current = true
    setBatchAborting(true)
    abort() // interrompt les requêtes Jina/scrape qui acceptent un signal
    // Feedback instantané : marque tous les items 'pending' comme annulés.
    // L'item 'running' continue (enrich() n'accepte pas d'AbortSignal) — son
    // résultat sera ignoré à la fin de l'itération via le check batchAbortRef.
    setBatch((prev) => prev.map((b) =>
      b.status === 'pending' ? { ...b, status: 'failed', error: 'Annulé' } : b
    ))
  }

  /** Normalise une valeur de clé pour la comparaison (trim, lowercase, strip). */
  const normalizeKey = (v: unknown): string => {
    if (v == null) return ''
    const s = String(v).trim().toLowerCase()
    return s
  }

  /** Merge `next` dans `prev` (même domaine re-scrapé). Union des colonnes
   *  (prev en premier, nouvelles colonnes ajoutées à la fin).
   *  Stratégie ligne :
   *   - Si une colonne `isPrimary` existe dans `prev` et que la valeur de cette
   *     clé dans une ligne `next` matche une ligne `prev` → UPDATE en place
   *     (préserve le `_id` et fusionne les nouveaux champs).
   *   - Sinon → append avec un `_id` rebasé pour éviter les collisions.
   *   La taxonomie est reconstruite après merge. */
  const appendSheetRows = (prev: ExcelSheet, next: ExcelSheet): ExcelSheet => {
    const prevKeys = new Set(prev.columns.map((c) => c.key))
    const addedColumns = next.columns.filter((c) => !prevKeys.has(c.key))
    const columns = [...prev.columns, ...addedColumns]

    const primaryCol = prev.columns.find((c) => c.isPrimary)
    const primaryKey = primaryCol?.key

    let mergedRows: ExcelRow[]
    if (primaryKey) {
      // Index les lignes prev par valeur de clé primaire (seulement quand non vide).
      const prevByKey = new Map<string, number>()
      prev.rows.forEach((r, idx) => {
        const k = normalizeKey(r[primaryKey])
        if (k) prevByKey.set(k, idx)
      })
      mergedRows = [...prev.rows]
      let appendCount = 0
      for (const nr of next.rows) {
        const k = normalizeKey(nr[primaryKey])
        const matchIdx = k ? prevByKey.get(k) : undefined
        if (matchIdx !== undefined) {
          // UPDATE : fusionne les champs, préserve l'_id existant.
          const existing = mergedRows[matchIdx]
          mergedRows[matchIdx] = { ...existing, ...nr, _id: existing._id }
        } else {
          // APPEND : nouvel _id pour éviter la collision.
          mergedRows.push({ ...nr, _id: `scraped_${prev.rows.length + appendCount}` })
          appendCount++
        }
      }
    } else {
      // Pas de clé primaire → append systématique.
      const offset = prev.rows.length
      const rebased = next.rows.map((r, i) => ({ ...r, _id: `scraped_${offset + i}` }))
      mergedRows = [...prev.rows, ...rebased]
    }

    const taxonomyLevels = prev.taxonomyLevels ?? next.taxonomyLevels
    const sheet: ExcelSheet = { ...prev, columns, rows: mergedRows, taxonomy: [] }
    if (taxonomyLevels) {
      sheet.taxonomyLevels = taxonomyLevels
      sheet.taxonomy = buildTaxonomyFromLevels(sheet, taxonomyLevels)
    }
    return sheet
  }

  /** Stratégie :
   *  1. Si une feuille porte déjà ce nom → AJOUT des nouvelles lignes en fin
   *     de la feuille existante (préserve les produits déjà scrapés).
   *  2. Si la seule feuille présente est vide (0 ligne, créée par « Creer vide »)
   *     → on la remplace plutôt que d'ajouter un onglet orphelin à côté.
   *  3. Sinon → ajout en fin. */
  const mergeSheet = (existing: ExcelSheet[], next: ExcelSheet): { sheets: ExcelSheet[]; activeIndex: number } => {
    const existingIdx = existing.findIndex((s) => s.name === next.name)
    if (existingIdx >= 0) {
      const merged = [...existing]
      merged[existingIdx] = appendSheetRows(existing[existingIdx], next)
      return { sheets: merged, activeIndex: existingIdx }
    }
    if (existing.length === 1 && existing[0].rows.length === 0) {
      return { sheets: [next], activeIndex: 0 }
    }
    return { sheets: [...existing, next], activeIndex: existing.length }
  }

  /** Lance la classification IA en lot sur les rowIds nouvellement importés
   *  vers la taxonomie sélectionnée. Fire-and-forget : la classification
   *  continue après fermeture du modal (le store reçoit les updateCell). */
  const triggerAutoClassify = (rowIds: string[]) => {
    if (!importTaxoId || rowIds.length === 0 || !taxonomies) return
    const target = taxonomies.find((t) => t.id === importTaxoId)
    if (!target) return
    void bulkAttach.run(target, { minConfidence: 0.5, overwriteLinked: true, rowIds })
  }

  const handleImportResult = () => {
    if (!result) return
    if (pimProjectId) {
      const source: Source = resyncSource
        ? { ...resyncSource, productCount: result.rows.length, lastSyncedAt: Date.now() }
        : {
            id: `src_${hostname}_${Date.now()}`,
            name: displayName,
            kind: 'scrape',
            url,
            schema: scrapeResultToColumns(result, lastFields),
            productCount: result.rows.length,
            enrichedCount: 0,
            lastSyncedAt: Date.now(),
          }
      startPreview(result.rows as Record<string, unknown>[], source)
      return
    }
    const sheet = scrapeResultToSheet(result, lastFields, displayName)
    const newRowIds = sheet.rows.map((r) => r._id)
    const store = useExcelStore.getState()
    // Scrape depuis le bouton "+" (targetPath défini) → nouvelle BDD :
    // reset docId et remplace les feuilles au lieu d'ajouter un onglet.
    if (targetPath !== undefined) {
      store.setCurrentDocId(null)
      store.setSheetRowId(null)
      setCurrentFileName(displayName)
      setCurrentPath(targetPath)
      setSheets([sheet])
      store.setActiveSheet(0)
    } else {
      // Préserver les feuilles existantes : remplacer l'onglet de même nom
      // (re-scrape du même domaine) ou ajouter un nouvel onglet.
      const { sheets: merged, activeIndex } = mergeSheet(sheets, sheet)
      setSheets(merged)
      store.setActiveSheet(activeIndex)
      store.setSheetRowId(null)
      if (sheets.length === 0) {
        setCurrentFileName(displayName)
      }
    }
    triggerAutoClassify(newRowIds)
    handleClose()
  }

  const handleImportEnriched = () => {
    if (!enrichEntry?.data) return
    if (pimProjectId) {
      const enrichedColumns = [
        { key: 'name', label: 'Nom', fieldType: 'text' as const, detectedType: 'text' as const, isPrimary: true, width: 240 },
        ...ENRICHMENT_COLUMNS.map(buildEnrichmentColumn),
      ]
      const serialized = serializeEnriched(enrichEntry.data, null)
      const row: Record<string, unknown> = { _id: 'enriched_0', name: productTitle, ...serialized }
      const source: Source = resyncSource
        ? { ...resyncSource, productCount: 1, enrichedCount: 1, lastSyncedAt: Date.now() }
        : {
            id: `src_${hostname}_${Date.now()}`,
            name: displayName,
            kind: 'scrape',
            url,
            schema: enrichedColumns,
            productCount: 1,
            enrichedCount: 1,
            lastSyncedAt: Date.now(),
          }
      startPreview([row], source)
      return
    }
    const sheet = enrichedProductToSheet(enrichEntry.data, displayName, productTitle)
    const newRowIds = sheet.rows.map((r) => r._id)
    const store = useExcelStore.getState()
    if (targetPath !== undefined) {
      store.setCurrentDocId(null)
      store.setSheetRowId(null)
      setCurrentFileName(displayName)
      setCurrentPath(targetPath)
      setSheets([sheet])
      store.setActiveSheet(0)
    } else {
      const { sheets: merged, activeIndex } = mergeSheet(sheets, sheet)
      setSheets(merged)
      store.setActiveSheet(activeIndex)
      store.setSheetRowId(null)
      if (sheets.length === 0) {
        setCurrentFileName(displayName)
      }
    }
    triggerAutoClassify(newRowIds)
    handleClose()
  }

  const handleImportBatch = () => {
    const successful = batch.filter((b) => b.product)
    if (successful.length === 0) return
    const products = successful.map((b) => b.product!) as EnrichedProduct[]
    const titles = successful.map((b) => b.product?.name || b.title)

    if (pimProjectId) {
      const enrichedColumns = [
        { key: 'name', label: 'Nom', fieldType: 'text' as const, detectedType: 'text' as const, isPrimary: true, width: 240 },
        ...ENRICHMENT_COLUMNS.map(buildEnrichmentColumn),
      ]
      const rows = products.map((product, i) => {
        const serialized = serializeEnriched(product, null)
        return { _id: `enriched_${i}`, name: titles[i], ...serialized } as Record<string, unknown>
      })
      const source: Source = resyncSource
        ? { ...resyncSource, productCount: products.length, enrichedCount: products.length, lastSyncedAt: Date.now() }
        : {
            id: `src_${hostname}_${Date.now()}`,
            name: displayName,
            kind: 'scrape',
            url,
            schema: enrichedColumns,
            productCount: products.length,
            enrichedCount: products.length,
            lastSyncedAt: Date.now(),
          }
      startPreview(rows, source)
      return
    }

    const sheet = enrichedProductsToSheet(products, displayName, titles)
    const newRowIds = sheet.rows.map((r) => r._id)
    const store = useExcelStore.getState()
    if (targetPath !== undefined) {
      store.setCurrentDocId(null)
      store.setSheetRowId(null)
      setCurrentFileName(displayName)
      setCurrentPath(targetPath)
      setSheets([sheet])
      store.setActiveSheet(0)
    } else {
      const { sheets: merged, activeIndex } = mergeSheet(sheets, sheet)
      setSheets(merged)
      store.setActiveSheet(activeIndex)
      store.setSheetRowId(null)
      if (sheets.length === 0) {
        setCurrentFileName(displayName)
      }
    }
    triggerAutoClassify(newRowIds)
    handleClose()
  }

  const handleClose = () => {
    abort()
    batchAbortRef.current = true
    setResult(null)
    setCrawlPages([])
    // Nettoie les entrées du store enrichmentStore créées par le batch
    for (const item of batch) {
      clearEnrichEntry(SCRAPE_MODAL_SHEET, item.rowId)
    }
    setBatch([])
    setBatchRunning(false)
    setBatchAborting(false)
    setBatchPreviewIdx(null)
    setUrl('')
    setPreviewOpen(false)
    setFrozenPreview(null)
    clearEnrichEntry(SCRAPE_MODAL_SHEET, enrichRowId)
    onClose()
  }

  const canImport = result && result.rows.length > 0
  const canImportEnriched = tab === 'scrape' && !!enrichEntry?.data && !enriching
  const successfulBatchCount = batch.filter((b) => b.product).length
  const canImportBatch = successfulBatchCount > 0 && !batchRunning

  return (
    <>
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-[#161616] border border-white/10 rounded-2xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-white/[0.06] shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <Globe className="w-4 h-4 text-indigo-400 shrink-0" />
            <h2 className="text-sm font-semibold text-white/80 shrink-0">Web Scraping</h2>
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20 shrink-0">
              Jina AI
            </span>
            {(() => {
              // Mode PIM : affiche source sélectionnée depuis SheetsColumn
              if (selectedSourceIds.length > 0) {
                const sourceId = selectedSourceIds[0]
                const primary = selectedSources[0]
                const className = "inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-md bg-white/[0.04] border border-white/[0.08] text-white/60 hover:text-indigo-300 hover:border-indigo-500/30 hover:bg-indigo-500/10 transition-colors truncate max-w-[280px]"
                return (
                  <span className={className} title={`Source : ${sourceId}`}>
                    <span className="truncate">{sourceId}</span>
                  </span>
                )
              }
              // Mode Scraping classique : affiche URL avec lien
              if (urlValid) {
                return (
                  <a
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-md bg-white/[0.04] border border-white/[0.08] text-white/60 hover:text-indigo-300 hover:border-indigo-500/30 hover:bg-indigo-500/10 transition-colors truncate max-w-[280px]"
                    title={`Ouvrir la source : ${url}`}
                  >
                    <span className="truncate">{displayName}</span>
                    <ExternalLink className="w-3 h-3 shrink-0" />
                  </a>
                )
              }
              return null
            })()}
          </div>
          <button onClick={handleClose} className="p-1 text-white/30 hover:text-white/60 transition-colors shrink-0">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* URL input */}
        <div className="px-5 py-3 border-b border-white/[0.06] shrink-0">
          <div className="flex items-center gap-2 bg-black/30 border border-white/10 rounded-lg px-3 py-2.5 focus-within:border-indigo-500/50 transition-colors">
            <Globe className="w-3.5 h-3.5 text-white/20 shrink-0" />
            <input
              type="url" value={url} onChange={(e) => setUrl(e.target.value)}
              placeholder="https://exemple.com"
              className="flex-1 bg-transparent text-sm text-white placeholder:text-white/20 outline-none"
              onKeyDown={(e) => e.key === 'Enter' && urlValid && tab === 'scrape' && handleScrape('schema', [], '', {})}
            />
          </div>
        </div>

        {/* Auto-classement IA — taxonomie cible (optionnelle).
             Si renseignée, chaque produit importé est classé automatiquement
             dans le bon nœud après la fin du scrape. */}
        {taxonomies && taxonomies.length > 0 && (
          <div className="px-5 py-2.5 border-b border-white/[0.06] shrink-0 flex items-center gap-2">
            <Tag className="w-3.5 h-3.5 text-white/30 shrink-0" />
            <span className="text-[11px] text-white/45 shrink-0">Auto-classer dans</span>
            <select
              value={importTaxoId}
              onChange={(e) => setImportTaxoId(e.target.value)}
              className="flex-1 bg-black/30 border border-white/10 rounded-md px-2 py-1 text-[11px] text-white/75 outline-none focus:border-indigo-500/50 transition-colors cursor-pointer"
              title="Classer automatiquement les produits importés dans cette taxonomie"
            >
              <option value="" className="bg-[#1a1a1a]">— Pas d'auto-classement</option>
              {taxonomies.map((t) => {
                const count = Object.keys(t.nodes).length
                return (
                  <option key={t.id} value={t.id} className="bg-[#1a1a1a]">
                    {t.name} ({count} nœuds)
                  </option>
                )
              })}
            </select>
            {importTaxoId && (
              <span className="text-[10px] text-indigo-300/70 shrink-0">IA</span>
            )}
          </div>
        )}

        {/* Tabs */}
        <div className="flex border-b border-white/[0.06] shrink-0">
          {TABS.map(({ id, label, Icon, color }) => (
            <button
              key={id}
              onClick={() => {
                setTab(id)
                setResult(null)
                // Réinitialise le batch lors du changement d'onglet (évite la
                // confusion : batch Map+Extract qui reste visible en passant à Crawl).
                if (!batchRunning) {
                  for (const item of batch) clearEnrichEntry(SCRAPE_MODAL_SHEET, item.rowId)
                  setBatch([])
                  setBatchPreviewIdx(null)
                }
              }}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-medium transition-colors ${
                tab === id ? `${color} border-b-2 border-current` : 'text-white/30 hover:text-white/60'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {label}
            </button>
          ))}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {error && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/20">
              <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
              <p className="text-xs text-red-300">{error}</p>
            </div>
          )}

          {tab === 'scrape' && (
            <ScrapeTab
              url={urlValid ? url : ''}
              loading={loading || enriching}
              onScrape={handleScrape}
              result={result}
              onUrlSuggestion={(suggested) => setUrl(suggested)}
              onEnrichMany={handleEnrichMany}
              batchRunning={batchRunning}
              logs={batchRunning ? [] : enrichLogs}
            />
          )}
          {tab === 'map' && (
            <MapExtractTab
              url={urlValid ? url : ''}
              loading={loading}
              onMap={handleMap}
              onEnrichMany={handleEnrichMany}
              batchRunning={batchRunning}
              onUrlSuggestion={(suggested) => setUrl(suggested)}
            />
          )}
          {tab === 'crawl' && (
            <CrawlTab
              url={urlValid ? url : ''}
              loading={loading}
              pages={crawlPages}
              onCrawl={handleCrawl}
              onAbort={abort}
              onEnrichMany={handleEnrichMany}
              batchRunning={batchRunning}
              onUrlSuggestion={(suggested) => setUrl(suggested)}
            />
          )}

          {/* Progression du batch d'enrichissement multi-URLs (tous tabs incluant scrape) */}
          {batch.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="text-[11px] text-white/50">
                    Enrichissement {batch.filter((b) => b.status === 'done' || b.status === 'failed').length} / {batch.length}
                  </span>
                  {successfulBatchCount > 0 && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-300/80 border border-emerald-500/20">
                      {successfulBatchCount} OK
                    </span>
                  )}
                  {batch.filter((b) => b.status === 'failed').length > 0 && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-500/10 text-red-300/80 border border-red-500/20">
                      {batch.filter((b) => b.status === 'failed').length} échec(s)
                    </span>
                  )}
                </div>
                {batchRunning && !batchAborting && (
                  <button
                    onClick={abortBatch}
                    className="text-[11px] text-red-400/70 hover:text-red-400 transition-colors"
                  >
                    Annuler
                  </button>
                )}
                {batchAborting && (
                  <span className="flex items-center gap-1.5 text-[10px] text-amber-400/80">
                    <Loader2 className="w-3 h-3 animate-spin" />
                    Annulation… (attente fin de l'item courant)
                  </span>
                )}
              </div>
              <div className="h-1 bg-white/5 rounded-full overflow-hidden">
                <div
                  className="h-full bg-indigo-500 rounded-full transition-all duration-300"
                  style={{ width: `${(batch.filter((b) => b.status === 'done' || b.status === 'failed').length / batch.length) * 100}%` }}
                />
              </div>
              {/* Item courant : reflète le progress du store enrichment */}
              {batchRunning && batchCurrentIdx !== null && (() => {
                const item = batch[batchCurrentIdx]
                if (!item) return null
                const entry = allEntries[enrichmentKey(SCRAPE_MODAL_SHEET, item.rowId)]
                return (
                  <div className="flex items-start gap-2 p-2 rounded-lg bg-indigo-500/5 border border-indigo-500/20">
                    <Loader2 className="w-3.5 h-3.5 text-indigo-400 shrink-0 mt-0.5 animate-spin" />
                    <div className="flex-1 min-w-0">
                      <p className="text-[11px] text-indigo-300/90 font-medium truncate">{item.title}</p>
                      <p className="text-[10px] text-white/40 truncate">{entry?.progress?.message ?? 'En attente…'}</p>
                    </div>
                  </div>
                )
              })()}
              {/* Console de logs — affichée une seule fois pour tout le batch */}
              {batchCurrentLogs.length > 0 && (
                <TypedLogConsole logs={batchCurrentLogs} maxHeight="16rem" />
              )}
              {/* Liste cliquable des items — masquée quand 1 seul (item card suffit) */}
              {batch.length > 1 && (
              <div className="max-h-48 overflow-y-auto space-y-0.5 border border-white/[0.06] rounded-lg p-1">
                {batch.map((item, i) => {
                  const isPreviewed = batchPreviewIdx === i
                  const clickable = item.status === 'done' && !!item.product
                  return (
                    <button
                      key={i}
                      type="button"
                      onClick={() => clickable && setBatchPreviewIdx(i)}
                      disabled={!clickable}
                      className={`w-full flex items-center gap-2 px-2 py-1 rounded text-[11px] text-left transition-colors ${
                        isPreviewed
                          ? 'bg-indigo-500/15 ring-1 ring-indigo-500/30'
                          : item.status === 'running'
                            ? 'bg-indigo-500/10'
                            : clickable
                              ? 'hover:bg-white/[0.04] cursor-pointer'
                              : 'cursor-default'
                      }`}
                    >
                      {item.status === 'pending' && <span className="w-2 h-2 rounded-full bg-white/15 shrink-0" />}
                      {item.status === 'running' && <Loader2 className="w-3 h-3 text-indigo-400 shrink-0 animate-spin" />}
                      {item.status === 'done' && <span className="w-2 h-2 rounded-full bg-emerald-400 shrink-0" />}
                      {item.status === 'failed' && <AlertCircle className="w-3 h-3 text-red-400/70 shrink-0" />}
                      <span className={`truncate flex-1 ${item.status === 'failed' ? 'text-red-300/60' : 'text-white/60'}`} title={item.url}>
                        {item.product?.name || item.title}
                      </span>
                      {item.status === 'failed' && item.error && (
                        <span className="text-[9px] text-red-400/50 truncate max-w-[120px]" title={item.error}>{item.error}</span>
                      )}
                    </button>
                  )
                })}
              </div>
              )}

              {/* Aperçu détaillé du produit sélectionné — même rendu que Scrape/Produit unique */}
              {batchPreviewIdx !== null && batch[batchPreviewIdx]?.product && (
                <div className="rounded-lg border border-white/[0.06] bg-white/[0.01] p-3">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider text-white/30">
                      <Sparkles className="w-3 h-3 text-violet-400/70" />
                      Aperçu
                      <span className="font-mono text-white/40 normal-case">
                        {batchPreviewIdx + 1} / {successfulBatchCount}
                      </span>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => {
                          // Précédent produit réussi
                          for (let k = batchPreviewIdx - 1; k >= 0; k--) {
                            if (batch[k].product) { setBatchPreviewIdx(k); return }
                          }
                        }}
                        className="text-[11px] px-2 py-0.5 rounded text-white/40 hover:text-white/70 hover:bg-white/5 transition-colors"
                      >
                        ← Précédent
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          for (let k = batchPreviewIdx + 1; k < batch.length; k++) {
                            if (batch[k].product) { setBatchPreviewIdx(k); return }
                          }
                        }}
                        className="text-[11px] px-2 py-0.5 rounded text-white/40 hover:text-white/70 hover:bg-white/5 transition-colors"
                      >
                        Suivant →
                      </button>
                    </div>
                  </div>
                  <p className="text-[13px] font-semibold text-white/90 mb-3 truncate" title={batch[batchPreviewIdx].product?.name}>
                    {batch[batchPreviewIdx].product?.name || batch[batchPreviewIdx].title}
                  </p>
                  <ProductEnrichedView product={batch[batchPreviewIdx].product!} />
                </div>
              )}
            </div>
          )}

          {tab === 'scrape' && enrichEntry?.error && !enriching && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/20">
              <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
              <p className="text-xs text-red-300">{enrichEntry.error}</p>
            </div>
          )}
          {tab === 'scrape' && enrichEntry?.data && (
            <ProductEnrichedView product={enrichEntry.data} />
          )}

          {result && <ScrapingPreview result={result} />}
        </div>

        {/* Footer */}
        {(canImport || canImportEnriched || canImportBatch) && (
          <div className="px-5 py-3.5 border-t border-white/[0.06] shrink-0">
            <button
              onClick={() => {
                if (canImportBatch) return handleImportBatch()
                if (canImportEnriched) return handleImportEnriched()
                return handleImportResult()
              }}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/20 text-emerald-400 text-sm font-medium transition-colors"
            >
              <Download className="w-4 h-4" />
              {canImportBatch
                ? `Importer ${successfulBatchCount} produit${successfulBatchCount > 1 ? 's' : ''} enrichi${successfulBatchCount > 1 ? 's' : ''}`
                : canImportEnriched
                  ? 'Importer le produit enrichi'
                  : `Importer ${result?.rows.length} ligne${(result?.rows.length ?? 0) > 1 ? 's' : ''}`}
            </button>
          </div>
        )}
      </div>
    </div>

    {pendingSource && (
      <MatchPreviewModal
        open={previewOpen}
        preview={frozenPreview}
        loading={false}
        sourceName={pendingSource.name}
        onConfirm={confirmIngest}
        onClose={() => { setPreviewOpen(false); setFrozenPreview(null) }}
      />
    )}
    </>
  )
}
