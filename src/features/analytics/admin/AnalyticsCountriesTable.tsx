// src/features/analytics/admin/AnalyticsCountriesTable.tsx
import { useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { countryGroupStats, countryName, type AnalyticsEvent } from '../metrics'

const TH = 'font-medium text-left py-1.5 px-2 border-b border-white/10'
const TD = 'py-1.5 px-2 border-b border-white/5'

// Date seule (sans heure) : la colonne vit dans un panneau étroit (1/4 de largeur),
// l'heure la ferait déborder hors du panneau.
const when = (ts: number) =>
  new Date(ts).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: '2-digit' })

interface Props {
  events: AnalyticsEvent[]
  /** Pays sélectionné (toggle) — synchronisé avec la carte du monde. */
  selected?: string | null
  onSelect?: (country: string | null) => void
  /** Classes de layout (ex. col-span) injectées par le conteneur parent. */
  className?: string
}

/**
 * Carte « Pays » : villes regroupées par pays (pays triés par visites décroissantes),
 * en-tête pays cliquable → carte du monde, villes détaillées dessous.
 */
export function AnalyticsCountriesTable({ events, selected, onSelect, className }: Props) {
  const groups = countryGroupStats(events)
  const maxCountry = groups[0]?.count ?? 1
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set())
  const toggle = (key: string) => setCollapsed((s) => { const n = new Set(s); if (n.has(key)) n.delete(key); else n.add(key); return n })
  return (
    <div className={`bg-surface rounded-lg p-4${className ? ` ${className}` : ''}`}>
      <div className="text-white/70 text-sm font-medium mb-3">
        Pays
        <span className="text-white/35 font-normal ml-2">villes groupées · visites · dernière visite</span>
      </div>
      {groups.length === 0 ? (
        <div className="text-white/35 text-xs">Aucune donnée</div>
      ) : (
        <div className="overflow-auto max-h-[70vh]">
        <table className="w-full text-xs border-collapse">
          <thead className="sticky top-0 z-10 bg-surface">
            <tr className="text-white/40 bg-surface">
              <th className={TH}>Pays</th>
              <th className={TH}>Ville</th>
              <th className={`${TH} text-right`}>Visites</th>
            </tr>
          </thead>
          <tbody>
            {groups.map((g) => {
              const maxCity = g.cities[0]?.count ?? 1
              const active = selected != null && selected === g.country
              const click = onSelect && g.country ? () => onSelect(active ? null : g.country) : undefined
              const ckey = g.country ?? '__none__'
              const isCollapsed = collapsed.has(ckey)
              return (
                <tr
                  key={`${g.country}`}
                  onClick={click}
                  onKeyDown={click ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); click() } } : undefined}
                  tabIndex={click ? 0 : undefined}
                  title={click ? 'Voir sur la carte' : undefined}
                  className={`transition-colors ${click ? 'cursor-pointer hover:bg-white/[0.04]' : ''} ${active ? 'bg-indigo-500/15' : ''}`}
                >
                  {/* En-tête pays : chevron repli + nom en gras + total + barre relative aux autres pays */}
                  <td className={`${TD} align-top text-white font-semibold whitespace-nowrap`} title={g.country ?? undefined}>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); toggle(ckey) }}
                        aria-label={isCollapsed ? 'Déplier les villes' : 'Replier les villes'}
                        className="p-0.5 -ml-1 rounded text-white/40 hover:text-white hover:bg-white/10 transition-colors"
                      >
                        <ChevronDown className={`w-3.5 h-3.5 transition-transform ${isCollapsed ? '-rotate-90' : ''}`} />
                      </button>
                      {countryName(g.country) ?? '—'}
                    </div>
                  </td>
                  {/* Villes du pays, empilées, triées par visites décroissantes.
                      Grille 3 colonnes → noms, barres et compteurs alignés verticalement. */}
                  <td className={`${TD} text-white/60`}>
                    {isCollapsed ? (
                      <span className="text-white/35">{g.cities.length} ville{g.cities.length > 1 ? 's' : ''}</span>
                    ) : (
                    <div className="space-y-1">
                      {g.cities.map((c, j) => (
                        <div key={`${c.city}-${j}`} className="grid grid-cols-[minmax(0,1fr)_48px_24px] items-center gap-2">
                          <span className="truncate" title={c.city ?? undefined}>{c.city ?? '—'}</span>
                          <div className="h-0.5 rounded bg-indigo-500/40" style={{ width: `${Math.max(8, (c.count / maxCity) * 100)}%` }} />
                          <span className="text-white/45 tabular-nums text-right">{c.count}</span>
                        </div>
                      ))}
                    </div>
                    )}
                  </td>
                  {/* Total pays + barre + dernière visite */}
                  <td className={`${TD} align-top text-right`}>
                    <span className="text-white font-semibold tabular-nums">{g.count}</span>
                    <div
                      className="mt-1 h-0.5 rounded bg-indigo-500/70 ml-auto"
                      style={{ width: `${Math.max(4, (g.count / maxCountry) * 100)}%` }}
                    />
                    <span className="block text-white/40 text-[10px] whitespace-nowrap tabular-nums mt-0.5">{when(g.lastTs)}</span>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        </div>
      )}
    </div>
  )
}
