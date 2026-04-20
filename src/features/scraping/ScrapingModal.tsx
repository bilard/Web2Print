import { useState } from 'react'
import { X, Globe, Download, AlertCircle, Sparkles, Map as MapIcon, FolderSync } from 'lucide-react'
import { useJina, scrapeResultToSheet, crawlPagesToSheet } from './useJina'
import type { ScrapingField, ScrapingMode, ScrapeResult, MapLink, CrawlPage, ExtractionTarget } from './useJina'
import type { ExcelSheet, ExcelRow } from '@/features/excel/types'
import { buildTaxonomyFromLevels } from '@/features/excel/taxonomyBuilder'
import { ScrapeTab } from './ScrapeTab'
import { MapExtractTab } from './MapExtractTab'
import { CrawlTab } from './CrawlTab'
import { ScrapingPreview } from './ScrapingPreview'
import { useExcelStore } from '@/stores/excel.store'

type Tab = 'scrape' | 'map' | 'crawl'

interface Props {
  open: boolean
  onClose: () => void
  /** Chemin cible dans l'arbre de bases de données (racine = []). */
  targetPath?: string[]
}

const TABS: { id: Tab; label: string; Icon: typeof Globe; color: string }[] = [
  { id: 'scrape', label: 'Scrape', Icon: Sparkles, color: 'text-indigo-400' },
  { id: 'map', label: 'Map + Extract', Icon: MapIcon, color: 'text-blue-400' },
  { id: 'crawl', label: 'Crawl', Icon: FolderSync, color: 'text-amber-400' },
]

export function ScrapingModal({ open, onClose, targetPath }: Props) {
  const [tab, setTab] = useState<Tab>('scrape')
  const [url, setUrl] = useState('')
  const [result, setResult] = useState<ScrapeResult | null>(null)
  const [lastFields, setLastFields] = useState<ScrapingField[]>([])
  const [crawlPages, setCrawlPages] = useState<CrawlPage[]>([])
  const { scrape, map, extract, crawl, abort, loading, error, progress } = useJina()
  const { setSheets, setCurrentFileName, sheets } = useExcelStore()
  const setCurrentPath = useExcelStore((s) => s.setCurrentPath)

  if (!open) return null

  const urlValid = (() => { try { new URL(url); return true } catch { return false } })()
  const hostname = (() => { try { return new URL(url).hostname.replace('www.', '') } catch { return 'scraped' } })()

  const handleScrape = async (mode: ScrapingMode, fields: ScrapingField[], prompt: string, opts: { target?: ExtractionTarget; waitFor?: number; noCache?: boolean; manualBreadcrumb?: string[] }) => {
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

  const handleImportCrawl = () => {
    if (crawlPages.length === 0) return
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
    onClose()
  }

  const canImport = result && result.rows.length > 0
  const canImportCrawl = tab === 'crawl' && crawlPages.length > 0 && !loading

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-[#161616] border border-white/10 rounded-2xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-white/[0.06] shrink-0">
          <div className="flex items-center gap-2.5">
            <Globe className="w-4 h-4 text-indigo-400" />
            <h2 className="text-sm font-semibold text-white/80">Web Scraping</h2>
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20">
              Jina AI
            </span>
          </div>
          <button onClick={handleClose} className="p-1 text-white/30 hover:text-white/60 transition-colors">
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
            <ScrapeTab url={urlValid ? url : ''} loading={loading} onScrape={handleScrape} result={result} onUrlSuggestion={(suggested) => setUrl(suggested)} />
          )}
          {tab === 'map' && (
            <MapExtractTab url={urlValid ? url : ''} loading={loading} onMap={handleMap} onExtract={handleExtract} result={result} />
          )}
          {tab === 'crawl' && (
            <CrawlTab url={urlValid ? url : ''} loading={loading} progress={progress} pages={crawlPages} onCrawl={handleCrawl} onAbort={abort} />
          )}

          {result && <ScrapingPreview result={result} />}
        </div>

        {/* Footer */}
        {(canImport || canImportCrawl) && (
          <div className="px-5 py-3.5 border-t border-white/[0.06] shrink-0">
            <button
              onClick={() => canImportCrawl ? handleImportCrawl() : handleImportResult()}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/20 text-emerald-400 text-sm font-medium transition-colors"
            >
              <Download className="w-4 h-4" />
              {canImportCrawl
                ? `Importer ${crawlPages.length} pages crawlées`
                : `Importer ${result?.rows.length} ligne${(result?.rows.length ?? 0) > 1 ? 's' : ''}`}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
