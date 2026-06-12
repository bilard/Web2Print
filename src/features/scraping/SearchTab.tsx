import { useState } from 'react'
import { Search, Loader2, Sparkles } from 'lucide-react'
import type { EnrichedProduct } from '@/features/excel/ai-enrichment/types'
import { runPlannedSearch, type SearchPlan, type PlannedSearchResult } from './searchPlanner'
import { SearchResultsList } from './SearchResultsList'
import { SearchPromptInput } from './SearchPromptInput'
import { SearchPlanChips } from './SearchPlanChips'
import { useResultPrices } from './useResultPrices'
import { SearchFieldsTable } from './SearchFieldsTable'

interface Props {
  /** Lance le pipeline d'enrichissement complet (Produit complet) sur les URLs cochées. */
  onEnrichMany: (urls: string[]) => Promise<void> | void
  /** True quand le batch d'enrichissement est en cours. */
  batchRunning: boolean
  /** Produits déjà enrichis par le batch en cours/terminé — alimente le tableau
   *  récapitulatif des champs demandés dans le prompt. */
  products: EnrichedProduct[]
}

/** Onglet « Recherche » : le prompt utilisateur est interprété par un LLM
 *  (sujet produit + enseignes ciblées) → une requête `site:` par enseigne,
 *  fusion des résultats, puis scrape « Produit complet » des URLs cochées. */
export function SearchTab({ onEnrichMany, batchRunning, products }: Props) {
  const [prompt, setPrompt] = useState('')
  const [limit, setLimit] = useState(10)
  const [searching, setSearching] = useState(false)
  const [plan, setPlan] = useState<SearchPlan | null>(null)
  const [results, setResults] = useState<PlannedSearchResult[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [error, setError] = useState<string | null>(null)
  const { priceByUrl, probePrices, resetPrices } = useResultPrices()

  const hasTargets = !!plan && plan.queries.some((q) => q.site)

  const handleSearch = async () => {
    if (!prompt.trim() || searching) return
    setSearching(true)
    setError(null)
    setResults([])
    setPlan(null)
    resetPrices()
    try {
      const { plan: p, results: found } = await runPlannedSearch(prompt.trim(), limit)
      setPlan(p)
      setResults(found)
      // Pré-cocher uniquement les fiches produit uniques (pages liste visibles
      // mais décochées), et seulement celles des sites demandés quand il y en a.
      const targeted = p.queries.some((q) => q.site)
      setSelected(new Set(found.filter((r) => r.pageType === 'product' && (!targeted || r.onTarget)).map((r) => r.url)))
      if (found.length === 0) setError('Aucun résultat — reformule la recherche (ajoute marque, type de produit, site…).')
      // Scrape léger du prix réel (JSON-LD) sur les fiches produit affichées
      probePrices(found.filter((r) => r.pageType === 'product').map((r) => r.url))
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
        <strong className="text-emerald-300">Recherche →</strong> Décris ce que tu cherches et où (« tondeuses Honda chez LeroyMerlin et Castorama »). L'IA interprète ta demande, interroge chaque site demandé, tu coches, chaque page est scrapée avec le moteur <strong className="text-emerald-300">Scrape / Produit complet</strong>.
      </div>

      <SearchPromptInput
        prompt={prompt}
        onPromptChange={setPrompt}
        onSubmit={handleSearch}
        disabled={searching || batchRunning}
      />

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

      {plan && <SearchPlanChips plan={plan} />}

      {plan && plan.wantedFields.length > 0 && (products.length > 0 || batchRunning
        ? <SearchFieldsTable
            fields={plan.wantedFields}
            products={products}
            remaining={batchRunning ? Math.max(0, selected.size - products.length) : 0}
          />
        : <p className="text-[10px] text-white/25">
            Un tableau récapitulera {plan.wantedFields.slice(0, 5).join(' · ')} pour chaque page scrapée.
          </p>
      )}

      {error && (
        <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-xs text-red-300">{error}</div>
      )}

      {results.length > 0 && (
        <>
          <SearchResultsList
            results={results}
            selected={selected}
            onToggle={toggle}
            onToggleAll={toggleAll}
            hasTargets={hasTargets}
            priceByUrl={priceByUrl}
          />
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
        </>
      )}
    </div>
  )
}
