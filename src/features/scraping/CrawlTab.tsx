import { useState } from 'react'
import { Globe, Loader2, Square, CheckSquare } from 'lucide-react'
import type { CrawlPage } from './useFirecrawl'

interface Props {
  url: string
  loading: boolean
  progress: { done: number; total: number } | null
  pages: CrawlPage[]
  onCrawl: (opts: { limit: number; includePaths: string; excludePaths: string }) => void
  onAbort: () => void
}

export function CrawlTab({ url, loading, progress, pages, onCrawl, onAbort }: Props) {
  const [limit, setLimit] = useState(30)
  const [includePaths, setIncludePaths] = useState('')
  const [excludePaths, setExcludePaths] = useState('')

  const pct = progress && progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : null

  return (
    <div className="space-y-4">
      <div className="p-3 bg-amber-500/5 border border-amber-500/20 rounded-lg text-xs text-amber-300/70">
        <strong className="text-amber-300">Crawl →</strong> Parcourt toutes les pages du site et extrait leur contenu (URL, titre, texte). Idéal pour indexer ou importer une documentation complète.
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

      {/* Progress */}
      {loading && (
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="text-white/40">{progress?.done ?? 0} / {progress?.total ?? '?'} pages</span>
            {pct !== null && <span className="text-indigo-400">{pct}%</span>}
          </div>
          <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
            <div
              className="h-full bg-indigo-500 rounded-full transition-all duration-500"
              style={{ width: pct ? `${pct}%` : '5%' }}
            />
          </div>
          <div className="flex justify-end">
            <button onClick={onAbort} className="text-[11px] text-red-400/60 hover:text-red-400 transition-colors">
              Annuler
            </button>
          </div>
        </div>
      )}

      {/* Pages list preview */}
      {pages.length > 0 && (
        <div className="space-y-1.5">
          <span className="text-[10px] text-white/30 uppercase tracking-wider">{pages.length} pages crawlées</span>
          <div className="max-h-40 overflow-y-auto space-y-0.5 border border-white/[0.06] rounded-lg p-1">
            {pages.map((p, i) => (
              <div key={i} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-white/[0.03]">
                {p.url ? <CheckSquare className="w-3 h-3 text-emerald-400/60 shrink-0" /> : <Square className="w-3 h-3 text-white/20 shrink-0" />}
                <Globe className="w-3 h-3 text-white/20 shrink-0" />
                <span className="text-[11px] text-white/60 truncate">{p.title || p.url}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Button */}
      <button
        onClick={() => onCrawl({ limit, includePaths, excludePaths })}
        disabled={!url || loading}
        className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/20 text-amber-300 text-sm font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Globe className="w-4 h-4" />}
        {loading ? 'Crawl en cours...' : `Crawler (max ${limit} pages)`}
      </button>
    </div>
  )
}
