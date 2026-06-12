import { CheckSquare, Square, Globe, ExternalLink, Target } from 'lucide-react'
import type { PlannedSearchResult } from './searchPlanner'

interface Props {
  results: PlannedSearchResult[]
  selected: Set<string>
  onToggle: (url: string) => void
  onToggleAll: () => void
  /** True si le plan ciblait des sites précis (affiche le badge « site demandé »). */
  hasTargets: boolean
}

/** Liste des résultats de l'onglet Recherche — version détaillée :
 *  titre complet, description sur 2 lignes, URL complète cliquable, badge site cible. */
export function SearchResultsList({ results, selected, onToggle, onToggleAll, hasTargets }: Props) {
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
      <div className="max-h-80 overflow-y-auto space-y-1 border border-white/[0.06] rounded-lg p-1.5">
        {results.map((r, i) => {
          const host = (() => {
            try { return new URL(r.url).hostname.replace(/^www\./, '') } catch { return r.url }
          })()
          const isSel = selected.has(r.url)
          return (
            <div
              key={i}
              onClick={() => onToggle(r.url)}
              className={`flex items-start gap-2.5 px-2.5 py-2 rounded-md cursor-pointer transition-colors ${
                isSel ? 'bg-emerald-500/10' : 'hover:bg-white/[0.03]'
              }`}
            >
              {isSel
                ? <CheckSquare className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                : <Square className="w-4 h-4 text-white/20 shrink-0 mt-0.5" />}
              <span className="flex-1 min-w-0">
                <span className="flex items-center gap-1.5 min-w-0">
                  <span className="text-xs text-white/85 font-medium leading-snug line-clamp-2">{r.title || host}</span>
                  {hasTargets && r.onTarget && (
                    <span className="inline-flex items-center gap-0.5 text-[9px] px-1 py-px rounded bg-emerald-500/15 text-emerald-300 border border-emerald-500/25 shrink-0">
                      <Target className="w-2.5 h-2.5" /> site demandé
                    </span>
                  )}
                </span>
                {r.description && (
                  <span className="block text-[11px] text-white/40 leading-snug line-clamp-2 mt-0.5">{r.description}</span>
                )}
                <a
                  href={r.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="inline-flex items-center gap-1 text-[10px] text-indigo-300/60 hover:text-indigo-300 mt-0.5 max-w-full transition-colors"
                  title={r.url}
                >
                  <Globe className="w-2.5 h-2.5 shrink-0" />
                  <span className="truncate">{r.url.replace(/^https?:\/\/(www\.)?/, '')}</span>
                  <ExternalLink className="w-2.5 h-2.5 shrink-0" />
                </a>
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
