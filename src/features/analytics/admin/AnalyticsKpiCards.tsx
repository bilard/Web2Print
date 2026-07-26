import { type Kpis, deltaPct } from '../metrics'

function Delta({ cur, prev }: { cur: number; prev: number }) {
  const d = deltaPct(cur, prev)
  if (d === null) return <span className="text-white/40 text-xs">—</span>
  const up = d >= 0
  return <span className={`text-xs ${up ? 'text-emerald-400' : 'text-rose-400'}`}>{up ? '+' : ''}{d}%</span>
}

const CARDS: { key: keyof Kpis; label: string; fmt?: (n: number) => string }[] = [
  { key: 'pageViews', label: 'Pages vues' },
  { key: 'visitors', label: 'Visiteurs uniques' },
  { key: 'sessions', label: 'Sessions' },
  { key: 'avgSessionMs', label: 'Durée moy. session', fmt: (n) => `${Math.round(n / 1000)} s` },
]

export function AnalyticsKpiCards({ cur, prev }: { cur: Kpis; prev: Kpis }) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      {CARDS.map((c) => (
        <div key={c.key} className="bg-surface rounded-lg p-4">
          <div className="text-white/50 text-xs">{c.label}</div>
          <div className="text-2xl font-semibold text-white mt-1">
            {c.fmt ? c.fmt(cur[c.key]) : cur[c.key].toLocaleString('fr-FR')}
          </div>
          <Delta cur={cur[c.key]} prev={prev[c.key]} />
        </div>
      ))}
    </div>
  )
}
