import { type Kpis, deltaPct } from '../metrics'
import { t, currentIntlLocale, type TranslationKey } from '@/lib/i18n'

function Delta({ cur, prev }: { cur: number; prev: number }) {
  const d = deltaPct(cur, prev)
  if (d === null) return <span className="text-white/40 text-xs">—</span>
  const up = d >= 0
  return <span className={`text-xs ${up ? 'text-emerald-400' : 'text-rose-400'}`}>{up ? '+' : ''}{d}%</span>
}

/** ⚠️ Des CLÉS, pas des `t()` : dans une constante de module, l'appel est évalué
 *  à l'import et la langue reste figée à celle du premier chargement. */
const CARDS: { key: keyof Kpis; labelKey: TranslationKey; fmt?: (n: number) => string }[] = [
  { key: 'pageViews', labelKey: 'an.pagesVues' },
  { key: 'visitors', labelKey: 'an.visiteursUniques' },
  { key: 'sessions', labelKey: 'an.sessions' },
  { key: 'avgSessionMs', labelKey: 'an.avgSession', fmt: (n) => `${Math.round(n / 1000)} s` },
]

export function AnalyticsKpiCards({ cur, prev }: { cur: Kpis; prev: Kpis }) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      {CARDS.map((c) => (
        <div key={c.key} className="bg-surface rounded-lg p-4">
          <div className="text-white/50 text-xs">{t(c.labelKey)}</div>
          <div className="text-2xl font-semibold text-white mt-1">
            {c.fmt ? c.fmt(cur[c.key]) : cur[c.key].toLocaleString(currentIntlLocale())}
          </div>
          <Delta cur={cur[c.key]} prev={prev[c.key]} />
        </div>
      ))}
    </div>
  )
}
