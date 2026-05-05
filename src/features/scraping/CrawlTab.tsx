import { useState } from 'react'
import { Globe, Loader2, Square, CheckSquare, Sparkles } from 'lucide-react'
import type { CrawlPage } from './useJina'
import { BrandSuggestion } from './BrandSuggestion'

interface Props {
  url: string
  loading: boolean
  pages: CrawlPage[]
  onCrawl: (opts: { limit: number; includePaths: string; excludePaths: string }) => void
  onAbort: () => void
  /** Lance le pipeline d'enrichissement complet (Produit complet) sur les URLs crawlées. */
  onEnrichMany: (urls: string[]) => Promise<void> | void
  /** True quand le batch d'enrichissement est en cours. */
  batchRunning: boolean
  /** Appelé quand l'utilisateur accepte la suggestion site fabricant. */
  onUrlSuggestion?: (suggested: string) => void
}

export function CrawlTab({ url, loading, pages, onCrawl, onAbort, onEnrichMany, batchRunning, onUrlSuggestion }: Props) {
  const [limit, setLimit] = useState(30)
  const [includePaths, setIncludePaths] = useState('')
  const [excludePaths, setExcludePaths] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())

  const toggleAll = () => {
    if (selected.size === pages.length) setSelected(new Set())
    else setSelected(new Set(pages.map((p) => p.url)))
  }

  const togglePage = (url: string) => {
    const next = new Set(selected)
    next.has(url) ? next.delete(url) : next.add(url)
    setSelected(next)
  }

  return (
    <div className="space-y-4">
      <BrandSuggestion url={url} onAccept={(u) => onUrlSuggestion?.(u)} />
      <div className="p-3 bg-amber-500/5 border border-amber-500/20 rounded-lg text-xs text-amber-300/70">
        <strong className="text-amber-300">Crawl →</strong> Extrait les liens de la page (Jina) puis l'IA identifie les noms produits depuis les cartes visibles. Tu coches les vrais produits, chacun est scrapé avec le moteur <strong className="text-amber-300">Scrape / Produit complet</strong>.
      </div>

      {/* Options */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-[10px] text-white/30 uppercase tracking-wider block mb-1">Limite de pages</label>
          <input
            type="number" value={limit} min={1} max={500}
            onChange={(e) => setLimit(Number(e.target.value))}
            className="w-full bg-black/30 border border-white/10 rounded px-3 py-2 text-sm text-white focus:border-indigo-500/50 focus:outline-none"
          />
        </div>
        <div>
          <label className="text-[10px] text-white/30 uppercase tracking-wider block mb-1">Inclure (regex)</label>
          <input
            value={includePaths} onChange={(e) => setIncludePaths(e.target.value)}
            placeholder="/produits/.*"
            className="w-full bg-black/30 border border-white/10 rounded px-3 py-2 text-sm text-white placeholder:text-white/20 focus:border-indigo-500/50 focus:outline-none"
          />
        </div>
        <div className="col-span-2">
          <label className="text-[10px] text-white/30 uppercase tracking-wider block mb-1">Exclure (regex)</label>
          <input
            value={excludePaths} onChange={(e) => setExcludePaths(e.target.value)}
            placeholder="/tag/.*, /auteur/.*"
            className="w-full bg-black/30 border border-white/10 rounded px-3 py-2 text-sm text-white placeholder:text-white/20 focus:border-indigo-500/50 focus:outline-none"
          />
        </div>
      </div>

      {/* Loading : 1 appel Jina + IA combiné — extraction noms + URLs des cartes produits */}
      {loading && (
        <div className="flex items-center justify-between p-3 rounded-lg bg-amber-500/5 border border-amber-500/20">
          <div className="flex items-center gap-2 text-xs text-amber-300/80">
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            <span>Détection des produits par l'IA (≈ 10-15 s)…</span>
          </div>
          <button onClick={onAbort} className="text-[11px] text-red-400/60 hover:text-red-400 transition-colors">
            Annuler
          </button>
        </div>
      )}

      {/* Pages list — visible en live pendant le crawl, sélectionnable après */}
      {pages.length > 0 && (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-white/30 uppercase tracking-wider">
              {pages.length} lien{pages.length > 1 ? 's' : ''} extrait{pages.length > 1 ? 's' : ''}
              {!loading && ` — ${selected.size} coché${selected.size > 1 ? 's' : ''} pour scrape`}
            </span>
            {!loading && (
              <button onClick={toggleAll} className="text-[10px] text-indigo-400/60 hover:text-indigo-400 transition-colors">
                {selected.size === pages.length ? 'Tout désélectionner' : 'Tout sélectionner'}
              </button>
            )}
          </div>
          <div className="max-h-48 overflow-y-auto space-y-0.5 border border-white/[0.06] rounded-lg p-1">
            {pages.map((p, i) => {
              const path = (() => {
                try { return new URL(p.url).pathname } catch { return p.url }
              })()
              return (
                <button
                  key={i}
                  onClick={() => !loading && togglePage(p.url)}
                  disabled={loading}
                  className={`w-full flex items-center gap-2 px-2 py-1.5 rounded text-left transition-colors ${
                    loading
                      ? 'cursor-default'
                      : selected.has(p.url) ? 'bg-indigo-500/10' : 'hover:bg-white/[0.03]'
                  }`}
                >
                  {loading
                    ? <CheckSquare className="w-3.5 h-3.5 text-emerald-400/60 shrink-0" />
                    : selected.has(p.url)
                      ? <CheckSquare className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                      : <Square className="w-3.5 h-3.5 text-white/20 shrink-0" />}
                  <Globe className="w-3 h-3 text-white/20 shrink-0" />
                  <span className="text-[11px] text-white/70 truncate flex-1" title={p.title}>{p.title || path}</span>
                  <span className="text-[9px] text-white/25 truncate max-w-[180px]" title={p.url}>{path}</span>
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* Bouton extraction liens (avant) */}
      {pages.length === 0 && (
        <button
          onClick={() => { onCrawl({ limit, includePaths, excludePaths }); setSelected(new Set()) }}
          disabled={!url || loading}
          className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/20 text-amber-300 text-sm font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Globe className="w-4 h-4" />}
          {loading ? 'Extraction…' : `Extraire les liens (max ${limit})`}
        </button>
      )}

      {/* Enrich button (après crawl) */}
      {pages.length > 0 && !loading && (
        <div className="flex gap-2">
          <button
            onClick={() => { onCrawl({ limit, includePaths, excludePaths }); setSelected(new Set()) }}
            disabled={!url || batchRunning}
            className="flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/20 text-amber-300 text-xs font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            title="Re-détecter"
          >
            <Globe className="w-4 h-4" />
          </button>
          <button
            onClick={() => onEnrichMany(Array.from(selected))}
            disabled={batchRunning || selected.size === 0}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg bg-indigo-500 hover:bg-indigo-600 text-white text-sm font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {batchRunning ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            {batchRunning
              ? 'Scrape en cours…'
              : selected.size === 0
                ? 'Coche au moins un lien à scraper'
                : `Scraper ${selected.size} produit${selected.size > 1 ? 's' : ''} (Produit complet)`}
          </button>
        </div>
      )}
    </div>
  )
}
