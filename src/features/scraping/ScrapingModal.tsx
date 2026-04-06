import { useState } from 'react'
import { X, Globe, Download, AlertCircle, Sparkles, Map, FolderSync } from 'lucide-react'
import { useFirecrawl, scrapeResultToSheet, crawlPagesToSheet } from './useFirecrawl'
import type { ScrapingField, ScrapingMode, ScrapeResult, MapLink, CrawlPage, ExtractionTarget } from './useFirecrawl'
import { ScrapeTab } from './ScrapeTab'
import { MapExtractTab } from './MapExtractTab'
import { CrawlTab } from './CrawlTab'
import { ScrapingPreview } from './ScrapingPreview'
import { useExcelStore } from '@/stores/excel.store'

type Tab = 'scrape' | 'map' | 'crawl'

interface Props {
  open: boolean
  onClose: () => void
}

const TABS: { id: Tab; label: string; Icon: typeof Globe; color: string }[] = [
  { id: 'scrape', label: 'Scrape', Icon: Sparkles, color: 'text-indigo-400' },
  { id: 'map', label: 'Map + Extract', Icon: Map, color: 'text-blue-400' },
  { id: 'crawl', label: 'Crawl', Icon: FolderSync, color: 'text-amber-400' },
]

export function ScrapingModal({ open, onClose }: Props) {
  const [tab, setTab] = useState<Tab>('scrape')
  const [url, setUrl] = useState('')
  const [result, setResult] = useState<ScrapeResult | null>(null)
  const [crawlPages, setCrawlPages] = useState<CrawlPage[]>([])
  const { scrape, map, extract, crawl, abort, loading, error, progress } = useFirecrawl()
  const { setSheets, setCurrentFileName, sheets } = useExcelStore()

  if (!open) return null

  const urlValid = (() => { try { new URL(url); return true } catch { return false } })()
  const hostname = (() => { try { return new URL(url).hostname.replace('www.', '') } catch { return 'scraped' } })()

  const handleScrape = async (mode: ScrapingMode, fields: ScrapingField[], prompt: string, opts: { mobile?: boolean; screenshot?: boolean; proxy?: 'basic' | 'enhanced' | 'auto'; target?: ExtractionTarget }) => {
    setResult(null)
    const res = await scrape(url, mode, fields, prompt, opts)
    if (res) setResult(res)
  }

  const handleMap = async (search?: string): Promise<MapLink[] | null> => {
    return map(url, search)
  }

  const handleExtract = async (urls: string[], fields: ScrapingField[], prompt: string, opts: { enableWebSearch?: boolean }) => {
    setResult(null)
    const res = await extract(urls, fields, prompt, opts)
    if (res) setResult(res)
  }

  const handleCrawl = async (opts: { limit: number; includePaths: string; excludePaths: string }) => {
    setCrawlPages([])
    const pages = await crawl(url, opts, (page) => setCrawlPages((prev) => [...prev, page]))
    if (pages) setCrawlPages(pages)
  }

  const handleImportResult = (fields: ScrapingField[]) => {
    if (!result) return
    const sheet = scrapeResultToSheet(result, fields, hostname)
    setSheets([sheet])
    setCurrentFileName(hostname)
    handleClose()
  }

  const handleImportCrawl = () => {
    if (crawlPages.length === 0) return
    const sheet = crawlPagesToSheet(crawlPages, hostname)
    setSheets([sheet])
    setCurrentFileName(hostname)
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
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
              Firecrawl AI
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
            <ScrapeTab url={urlValid ? url : ''} loading={loading} onScrape={handleScrape} result={result} />
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
              onClick={() => canImportCrawl ? handleImportCrawl() : handleImportResult([])}
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
