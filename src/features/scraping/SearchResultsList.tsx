import { CheckSquare, Square, ExternalLink, Target, Layers, Loader2 } from 'lucide-react'
import type { PlannedSearchResult } from './searchPlanner'
import type { PriceProbe } from './useResultPrices'

interface Props {
  results: PlannedSearchResult[]
  selected: Set<string>
  onToggle: (url: string) => void
  onToggleAll: () => void
  /** True si le plan ciblait des sites précis (affiche le badge « site demandé »). */
  hasTargets: boolean
  /** Prix réels scrapés (JSON-LD léger) par URL — prioritaires sur le prix snippet. */
  priceByUrl: Record<string, PriceProbe>
}

/** Résultats de l'onglet Recherche en tableau : case à cocher, titre, description, site. */
export function SearchResultsList({ results, selected, onToggle, onToggleAll, hasTargets, priceByUrl }: Props) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="text-[10px] text-white/30 uppercase tracking-wider">
          {results.length} résultat{results.length > 1 ? 's' : ''} — {selected.size} coché{selected.size > 1 ? 's' : ''} pour scrape
        </span>
        <button onClick={onToggleAll} className="text-[10px] text-emerald-400/60 hover:text-emerald-400 transition-colors">
          {selected.size === results.length ? 'Tout désélectionner' : 'Tout sélectionner'}
        </button>
      </div>
      <div className="max-h-96 overflow-y-auto border border-white/[0.06] rounded-lg">
        <table className="w-full text-[11px]">
          <thead className="sticky top-0 bg-well">
            <tr className="border-b border-white/[0.08] bg-white/[0.02]">
              <th className="w-8 px-2 py-2" />
              <th className="px-2 py-2 text-left font-medium text-white/45 uppercase tracking-wide text-[9px]">Titre</th>
              <th className="px-2 py-2 text-left font-medium text-white/45 uppercase tracking-wide text-[9px]">Description</th>
              <th className="px-2 py-2 text-right font-medium text-white/45 uppercase tracking-wide text-[9px] w-24" title="Prix avant promo scrapé sur la page (balises del/s, classes old/barré)">Prix barré</th>
              <th className="px-2 py-2 text-right font-medium text-white/45 uppercase tracking-wide text-[9px] w-28" title="Prix de vente scrapé sur la page (JSON-LD) — sinon prix repéré dans le snippet (pâle, indicatif)">Prix de vente</th>
              <th className="px-2 py-2 text-left font-medium text-white/45 uppercase tracking-wide text-[9px] w-40">Site</th>
              <th className="w-9 px-2 py-2" title="Ouvrir la page source" />
            </tr>
          </thead>
          <tbody>
            {results.map((r, i) => {
              const host = (() => {
                try { return new URL(r.url).hostname.replace(/^www\./, '') } catch { return r.url }
              })()
              const isSel = selected.has(r.url)
              return (
                <tr
                  key={i}
                  onClick={() => onToggle(r.url)}
                  className={`border-b border-white/[0.04] last:border-0 cursor-pointer transition-colors align-top ${
                    isSel ? 'bg-emerald-500/[0.07]' : 'hover:bg-white/[0.02]'
                  }`}
                >
                  <td className="px-2 py-2">
                    {isSel
                      ? <CheckSquare className="w-4 h-4 text-emerald-400" />
                      : <Square className="w-4 h-4 text-white/20" />}
                  </td>
                  <td className="px-2 py-2 text-white/85 font-medium max-w-[280px]">
                    <span className="line-clamp-2" title={r.title}>{r.title || host}</span>
                    <span className="flex items-center gap-1 mt-0.5">
                      {hasTargets && r.onTarget && (
                        <span className="inline-flex items-center gap-0.5 text-[9px] px-1 py-px rounded bg-emerald-500/15 text-emerald-300 border border-emerald-500/25">
                          <Target className="w-2.5 h-2.5" /> site demandé
                        </span>
                      )}
                      {r.pageType === 'listing' && (
                        <span
                          className="inline-flex items-center gap-0.5 text-[9px] px-1 py-px rounded bg-amber-500/10 text-amber-300/80 border border-amber-500/20"
                          title="Page multi-produits (catégorie, recherche…) — pas une fiche produit unique"
                        >
                          <Layers className="w-2.5 h-2.5" /> page liste
                        </span>
                      )}
                    </span>
                  </td>
                  <td className="px-2 py-2 text-white/40 max-w-[300px]">
                    <span className="line-clamp-2" title={r.description}>{r.description || '—'}</span>
                  </td>
                  <td className="px-2 py-2 text-right w-24 whitespace-nowrap">
                    {priceByUrl[r.url]?.original
                      ? <span className="text-white/35 line-through" title="Prix avant promo scrapé sur la page">{priceByUrl[r.url].original}</span>
                      : <span className="text-white/15">—</span>}
                  </td>
                  <td className="px-2 py-2 text-right w-28 whitespace-nowrap">
                    {(() => {
                      const probe = priceByUrl[r.url]
                      if (probe?.value) {
                        return <span className="text-emerald-300/90 font-medium" title="Prix de vente scrapé sur la page (JSON-LD)">{probe.value}</span>
                      }
                      if (probe?.status === 'loading') {
                        return <Loader2 className="w-3 h-3 animate-spin text-white/25 inline-block" />
                      }
                      return r.price
                        ? <span className="text-emerald-300/60" title="Prix repéré dans le snippet de recherche (indicatif)">{r.price}</span>
                        : <span className="text-white/15">—</span>
                    })()}
                  </td>
                  <td className="px-2 py-2 w-40 max-w-[160px]">
                    <span className="block text-white/45 truncate" title={r.url}>{host}</span>
                  </td>
                  <td className="w-9 px-2 py-2">
                    <a
                      href={r.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="inline-flex items-center justify-center w-6 h-6 rounded border border-indigo-500/25 bg-indigo-500/10 text-indigo-300/70 hover:text-indigo-200 hover:bg-indigo-500/20 transition-colors"
                      title={`Ouvrir la page source : ${r.url}`}
                    >
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
