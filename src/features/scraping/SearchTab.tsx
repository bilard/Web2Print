import { useState } from 'react'
import { Search, Loader2, Globe, CheckSquare, Square, Sparkles } from 'lucide-react'
import { jinaSearch, type SearchResult } from '@/features/excel/ai-enrichment/useProductEnrichment'

interface Props {
  /** Lance le pipeline d'enrichissement complet (Produit complet) sur les URLs cochées. */
  onEnrichMany: (urls: string[]) => Promise<void> | void
  /** True quand le batch d'enrichissement est en cours. */
  batchRunning: boolean
}

/** Onglet « Recherche » : moteur de recherche web de scraping. L'utilisateur
 *  décrit les données attendues (thème de produits, data diverses), choisit un
 *  nombre de résultats, la recherche web (Jina) remonte les URLs — chacune est
 *  ensuite scrapée par le pipeline Produit complet. */
export function SearchTab({ onEnrichMany, batchRunning }: Props) {
  const [prompt, setPrompt] = useState('')
  const [limit, setLimit] = useState(10)
  const [searching, setSearching] = useState(false)
  const [results, setResults] = useState<SearchResult[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [error, setError] = useState<string | null>(null)

  const handleSearch = async () => {
    if (!prompt.trim() || searching) return
    setSearching(true)
    setError(null)
    setResults([])
    try {
      const found = await jinaSearch(prompt.trim(), limit)
      setResults(found)
      // Tout pré-cocher : le flux nominal est « prompt → N fiches » ;
      // l'utilisateur décoche les hors-sujet.
      setSelected(new Set(found.map((r) => r.url)))
      if (found.length === 0) setError('Aucun résultat — reformule la recherche (ajoute marque, type de produit, site…).')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Recherche échouée')
    } finally {
      setSearching(false)
    }
  }

  const toggle = (url: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(url)) next.delete(url)
      else next.add(url)
      return next
    })
  }
  const toggleAll = () => {
    setSelected((prev) => prev.size === results.length ? new Set() : new Set(results.map((r) => r.url)))
  }

  return (
    <div className="space-y-4">
      <div className="p-3 bg-emerald-500/5 border border-emerald-500/20 rounded-lg text-xs text-emerald-300/70">
        <strong className="text-emerald-300">Recherche →</strong> Décris les données que tu cherches (thème de produits, marques, data diverses). La recherche web remonte les meilleures pages, tu coches, chacune est scrapée avec le moteur <strong className="text-emerald-300">Scrape / Produit complet</strong>.
      </div>

      <div>
        <label className="text-[10px] text-white/30 uppercase tracking-wider block mb-1">Que cherches-tu ?</label>
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleSearch() }}
          placeholder={'Ex : « perceuses à percussion 18V Makita site officiel »,\n« meilleurs robots tondeuses 2026 fiches techniques »…'}
          rows={3}
          className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white placeholder:text-white/20 focus:border-emerald-500/50 focus:outline-none resize-none"
        />
      </div>

      <div className="flex items-end gap-3">
        <div>
          <label className="text-[10px] text-white/30 uppercase tracking-wider block mb-1">Nombre de résultats</label>
          <input
            type="number" min={1} max={30}
            value={limit}
            onChange={(e) => setLimit(Math.max(1, Math.min(30, Number(e.target.value) || 10)))}
            className="w-28 bg-black/30 border border-white/10 rounded px-3 py-2 text-sm text-white focus:border-emerald-500/50 focus:outline-none"
          />
        </div>
        <button
          onClick={handleSearch}
          disabled={!prompt.trim() || searching || batchRunning}
          className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:bg-white/5 disabled:text-white/25 text-[#fff] text-sm font-medium transition-colors"
        >
          {searching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
          {searching ? 'Recherche en cours…' : 'Rechercher'}
        </button>
      </div>

      {error && (
        <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-xs text-red-300">{error}</div>
      )}

      {results.length > 0 && (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-white/30 uppercase tracking-wider">
              {results.length} résultat{results.length > 1 ? 's' : ''} — {selected.size} coché{selected.size > 1 ? 's' : ''} pour scrape
            </span>
            <button onClick={toggleAll} className="text-[10px] text-emerald-400/60 hover:text-emerald-400 transition-colors">
              {selected.size === results.length ? 'Tout désélectionner' : 'Tout sélectionner'}
            </button>
          </div>
          <div className="max-h-56 overflow-y-auto space-y-0.5 border border-white/[0.06] rounded-lg p-1">
            {results.map((r, i) => {
              const host = (() => {
                try { return new URL(r.url).hostname.replace(/^www\./, '') } catch { return r.url }
              })()
              return (
                <button
                  key={i}
                  onClick={() => toggle(r.url)}
                  className={`w-full flex items-start gap-2 px-2 py-1.5 rounded text-left transition-colors ${
                    selected.has(r.url) ? 'bg-emerald-500/10' : 'hover:bg-white/[0.03]'
                  }`}
                >
                  {selected.has(r.url)
                    ? <CheckSquare className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                    : <Square className="w-3.5 h-3.5 text-white/20 shrink-0 mt-0.5" />}
                  <Globe className="w-3 h-3 text-white/20 shrink-0 mt-1" />
                  <span className="flex-1 min-w-0">
                    <span className="block text-[11px] text-white/75 truncate" title={r.title}>{r.title || host}</span>
                    {r.description && (
                      <span className="block text-[10px] text-white/35 truncate" title={r.description}>{r.description}</span>
                    )}
                  </span>
                  <span className="text-[9px] text-white/25 truncate max-w-[140px] shrink-0 mt-0.5" title={r.url}>{host}</span>
                </button>
              )
            })}
          </div>
          <button
            onClick={() => onEnrichMany(Array.from(selected))}
            disabled={selected.size === 0 || batchRunning}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:bg-white/5 disabled:text-white/25 text-[#fff] text-sm font-medium transition-colors"
          >
            {batchRunning ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            {selected.size === 0
              ? 'Coche au moins un résultat à scraper'
              : `Scraper ${selected.size} page${selected.size > 1 ? 's' : ''} (Produit complet)`}
          </button>
        </div>
      )}
    </div>
  )
}
