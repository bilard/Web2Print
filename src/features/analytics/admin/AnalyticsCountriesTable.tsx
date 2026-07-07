// src/features/analytics/admin/AnalyticsCountriesTable.tsx
import { countryCityStats, type AnalyticsEvent } from '../metrics'

const TH = 'font-medium text-left py-1.5 px-2 border-b border-white/10'
const TD = 'py-1.5 px-2 border-b border-white/5'

const when = (ts: number) =>
  new Date(ts).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })

interface Props {
  events: AnalyticsEvent[]
  /** Pays sélectionné (toggle) — synchronisé avec la carte du monde. */
  selected?: string | null
  onSelect?: (country: string | null) => void
}

/** Carte « Pays » : tableau pays · ville · visites · dernière visite, lignes cliquables → carte. */
export function AnalyticsCountriesTable({ events, selected, onSelect }: Props) {
  const rows = countryCityStats(events, 12)
  const max = rows[0]?.count ?? 1
  return (
    <div className="bg-surface rounded-lg p-4">
      <div className="text-white/70 text-sm font-medium mb-3">
        Pays
        <span className="text-white/35 font-normal ml-2">ville · visites · dernière visite</span>
      </div>
      {rows.length === 0 ? (
        <div className="text-white/35 text-xs">Aucune donnée</div>
      ) : (
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="text-white/40">
              <th className={TH}>Pays</th>
              <th className={TH}>Ville</th>
              <th className={`${TH} text-right`}>Visites</th>
              <th className={`${TH} text-right whitespace-nowrap`}>Dernière visite</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const active = selected != null && selected === r.country
              const click = onSelect && r.country ? () => onSelect(active ? null : r.country) : undefined
              return (
                <tr
                  key={`${r.country}-${r.city}`}
                  onClick={click}
                  onKeyDown={click ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); click() } } : undefined}
                  tabIndex={click ? 0 : undefined}
                  title={click ? 'Voir sur la carte' : undefined}
                  className={`transition-colors ${click ? 'cursor-pointer hover:bg-white/[0.04]' : ''} ${active ? 'bg-indigo-500/15' : ''}`}
                >
                  <td className={TD}>
                    <span className="inline-block bg-indigo-500/20 text-indigo-200 rounded px-1.5 py-0.5 text-[10px] font-medium tracking-wide">
                      {r.country ?? '—'}
                    </span>
                  </td>
                  <td className={`${TD} text-white/80 truncate max-w-[140px]`}>{r.city ?? '—'}</td>
                  <td className={`${TD} text-right`}>
                    <span className="text-white/80 tabular-nums">{r.count}</span>
                    <div
                      className="mt-1 h-0.5 rounded bg-indigo-500/60 ml-auto"
                      style={{ width: `${Math.max(4, (r.count / max) * 100)}%` }}
                    />
                  </td>
                  <td className={`${TD} text-white/50 text-right whitespace-nowrap tabular-nums`}>{when(r.lastTs)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}
    </div>
  )
}
