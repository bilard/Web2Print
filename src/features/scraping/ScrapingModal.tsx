import { useState, useMemo, useEffect } from 'react'
import { X, Globe, Download, AlertCircle, Sparkles, Map as MapIcon, FolderSync, Loader2, ExternalLink } from 'lucide-react'
import { useJina, scrapeResultToSheet, crawlPagesToSheet, enrichedProductToSheet } from './useJina'
import type { ScrapingField, ScrapingMode, ScrapeResult, MapLink, CrawlPage, ExtractionTarget } from './useJina'
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
  const { scrape, map, extract, crawl, abort, loading, error, progress } = useJina()
  const { setSheets, setCurrentFileName, sheets } = useExcelStore()
  const setCurrentPath = useExcelStore((s) => s.setCurrentPath)

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
    console.log('[ScrapingModal] startPreview called', { rowCount: rows.length, sourceId: source.id })
    const calculatedPreview = matchRows(rows as never, products)
    console.log('[ScrapingModal] startPreview calculated preview', { newMasters: calculatedPreview?.newMasters.length, merged: calculatedPreview?.mergedOnExisting.length, needsDedup: calculatedPreview?.needsDedup.length })
    setPendingRows(rows)
    setPendingSource(source)
    setFrozenPreview(calculatedPreview)
    setPreviewOpen(true)
  }

  const confirmIngest = async () => {
    console.log('[ScrapingModal] confirmIngest called', { pimProjectId, pendingSource: pendingSource?.id, frozenPreview: !!frozenPreview })
    if (!pimProjectId || !pendingSource || !frozenPreview) {
      console.log('[ScrapingModal] confirmIngest early return', { pimProjectId, pendingSource: pendingSource?.id, frozenPreview: !!frozenPreview })
      return
    }
    try {
      const result = applyPreview(frozenPreview, products, pendingSource.id, { now: Date.now() })
      console.log('[ScrapingModal] applyPreview result', { created: result.stats.created, merged: result.stats.merged })
      await upsertSource.mutateAsync(pendingSource)
      console.log('[ScrapingModal] upsertSource completed', pendingSource.id)
      await upsertProducts.mutateAsync(result.products)
      console.log('[ScrapingModal] upsertProducts completed, products count:', result.products.length)
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
      resetEnrich()
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

  const handleMap = async (search?: string): Promise<MapLink[] | null> => {
    return map(url, search)
  }

  const handleExtract = async (urls: string[], fields: ScrapingField[], prompt: string) => {
    setResult(null)
    setLastFields(fields)
    const res = await extract(urls, fields, prompt)
    if (res) setResult(res)
  }

  const handleCrawl = async (opts: { limit: number; includePaths: string; excludePaths: string }) => {
    setCrawlPages([])
    const pages = await crawl(url, opts, (page) => setCrawlPages((prev) => [...prev, page]))
    if (pages) setCrawlPages(pages)
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

  const handleImportResult = () => {
    if (!result) return
    if (pimProjectId) {
      const source: Source = resyncSource
        ? { ...resyncSource, productCount: result.rows.length, lastSyncedAt: Date.now() }
        : {
            id: `src_${hostname}_${Date.now()}`,
            name: hostname,
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
    const sheet = scrapeResultToSheet(result, lastFields, hostname)
    const store = useExcelStore.getState()
    // Scrape depuis le bouton "+" (targetPath défini) → nouvelle BDD :
    // reset docId et remplace les feuilles au lieu d'ajouter un onglet.
    if (targetPath !== undefined) {
      store.setCurrentDocId(null)
      store.setSheetRowId(null)
      setCurrentFileName(hostname)
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
        setCurrentFileName(hostname)
      }
    }
    handleClose()
  }

  const handleImportEnriched = () => {
    console.log('[ScrapingModal] handleImportEnriched called', { hasEnrichEntry: !!enrichEntry?.data, pimProjectId })
    if (!enrichEntry?.data) {
      console.log('[ScrapingModal] handleImportEnriched: no enrichEntry data, returning')
      return
    }
    if (pimProjectId) {
      console.log('[ScrapingModal] handleImportEnriched: PIM mode, preparing source')
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
            name: hostname,
            kind: 'scrape',
            url,
            schema: enrichedColumns,
            productCount: 1,
            enrichedCount: 1,
            lastSyncedAt: Date.now(),
          }
      console.log('[ScrapingModal] handleImportEnriched: calling startPreview', { sourceId: source.id, sourceName: source.name })
      startPreview([row], source)
      return
    }
    const sheet = enrichedProductToSheet(enrichEntry.data, hostname, productTitle)
    const store = useExcelStore.getState()
    if (targetPath !== undefined) {
      store.setCurrentDocId(null)
      store.setSheetRowId(null)
      setCurrentFileName(hostname)
      setCurrentPath(targetPath)
      setSheets([sheet])
      store.setActiveSheet(0)
    } else {
      const { sheets: merged, activeIndex } = mergeSheet(sheets, sheet)
      setSheets(merged)
      store.setActiveSheet(activeIndex)
      store.setSheetRowId(null)
      if (sheets.length === 0) {
        setCurrentFileName(hostname)
      }
    }
    handleClose()
  }

  const handleImportCrawl = () => {
    if (crawlPages.length === 0) return
    if (pimProjectId) {
      const crawlColumns = [
        { key: 'url', label: 'URL', fieldType: 'url' as const, detectedType: 'url' as const, isPrimary: true, width: 280 },
        { key: 'title', label: 'Titre', fieldType: 'text' as const, detectedType: 'text' as const, isPrimary: false, width: 200 },
        { key: 'content', label: 'Contenu', fieldType: 'text_long' as const, detectedType: 'text_long' as const, isPrimary: false, width: 400 },
      ]
      const crawlRows = crawlPages.map((p, i) => ({ _id: `crawl_${i}`, url: p.url, title: p.title, content: p.content }))
      const source: Source = resyncSource
        ? { ...resyncSource, productCount: crawlPages.length, lastSyncedAt: Date.now() }
        : {
            id: `src_${hostname}_${Date.now()}`,
            name: hostname,
            kind: 'scrape',
            url,
            schema: crawlColumns,
            productCount: crawlPages.length,
            enrichedCount: 0,
            lastSyncedAt: Date.now(),
          }
      startPreview(crawlRows, source)
      return
    }
    const sheet = crawlPagesToSheet(crawlPages, hostname)
    const store = useExcelStore.getState()
    // Scrape depuis le bouton "+" (targetPath défini) → nouvelle BDD :
    // reset docId et remplace les feuilles au lieu d'ajouter un onglet.
    if (targetPath !== undefined) {
      store.setCurrentDocId(null)
      store.setSheetRowId(null)
      setCurrentFileName(hostname)
      setCurrentPath(targetPath)
      setSheets([sheet])
      store.setActiveSheet(0)
    } else {
      const { sheets: merged, activeIndex } = mergeSheet(sheets, sheet)
      setSheets(merged)
      store.setActiveSheet(activeIndex)
      store.setSheetRowId(null)
      if (sheets.length === 0) {
        setCurrentFileName(hostname)
      }
    }
    handleClose()
  }

  const handleClose = () => {
    abort()
    setResult(null)
    setCrawlPages([])
    setUrl('')
    setPreviewOpen(false)
    setFrozenPreview(null)
    clearEnrichEntry(SCRAPE_MODAL_SHEET, enrichRowId)
    onClose()
  }

  const canImport = result && result.rows.length > 0
  const canImportCrawl = tab === 'crawl' && crawlPages.length > 0 && !loading
  const canImportEnriched = tab === 'scrape' && !!enrichEntry?.data && !enriching

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
                    <span className="truncate">{hostname}</span>
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

        {/* Tabs */}
        <div className="flex border-b border-white/[0.06] shrink-0">
          {TABS.map(({ id, label, Icon, color }) => (
            <button
              key={id}
              onClick={() => { setTab(id); setResult(null) }}
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
            <ScrapeTab url={urlValid ? url : ''} loading={loading || enriching} onScrape={handleScrape} result={result} onUrlSuggestion={(suggested) => setUrl(suggested)} />
          )}
          {tab === 'map' && (
            <MapExtractTab url={urlValid ? url : ''} loading={loading} onMap={handleMap} onExtract={handleExtract} result={result} />
          )}
          {tab === 'crawl' && (
            <CrawlTab url={urlValid ? url : ''} loading={loading} progress={progress} pages={crawlPages} onCrawl={handleCrawl} onAbort={abort} />
          )}

          {/* Mode "Produit unique" : progression + rendu riche depuis enrichmentStore */}
          {tab === 'scrape' && enrichEntry && enrichEntry.progress.status !== 'idle' && enrichEntry.progress.status !== 'done' && (
            <div className="flex items-start gap-3 p-3 rounded-lg bg-indigo-500/5 border border-indigo-500/20">
              <Loader2 className="w-4 h-4 text-indigo-400 shrink-0 mt-0.5 animate-spin" />
              <div className="flex-1 min-w-0 space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-[12px] text-indigo-300/90 font-medium">{enrichEntry.progress.message}</p>
                  {enrichEntry.llmUsed && (
                    <span className="text-[9.5px] font-mono px-1.5 py-0.5 rounded bg-violet-500/15 text-violet-300 border border-violet-500/20">
                      {enrichEntry.llmUsed.provider} · {enrichEntry.llmUsed.model}
                    </span>
                  )}
                </div>
                {enrichLogs.length > 0 && (
                  <p className="text-[10px] text-white/40 leading-relaxed truncate">{enrichLogs[enrichLogs.length - 1]}</p>
                )}
              </div>
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
        {(canImport || canImportCrawl || canImportEnriched) && (
          <div className="px-5 py-3.5 border-t border-white/[0.06] shrink-0">
            <button
              onClick={() => {
                if (canImportEnriched) return handleImportEnriched()
                if (canImportCrawl) return handleImportCrawl()
                return handleImportResult()
              }}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/20 text-emerald-400 text-sm font-medium transition-colors"
            >
              <Download className="w-4 h-4" />
              {canImportEnriched
                ? 'Importer le produit enrichi'
                : canImportCrawl
                  ? `Importer ${crawlPages.length} pages crawlées`
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
