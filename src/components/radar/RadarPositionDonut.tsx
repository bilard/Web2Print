import { PieChart } from 'lucide-react'
import type { Cockpit } from '@/features/priceWatch/dashboard/analytics'
import { fmtInt, fmtPct } from '@/features/priceWatch/radar/radarFormat'
import { t } from '@/lib/i18n'

/** Donut de positionnement prix (comparaisons chiffrées) : je gagne / aligné / je perds. */
export function RadarPositionDonut({ cockpit }: { cockpit: Cockpit }) {
  const { kpis } = cockpit
  const segs = [
    { label: 'Je gagne', value: kpis.dearerThanMe, color: 'var(--radar-good)' },
    { label: t('rd.alignedOne'), value: kpis.aligned, color: 'var(--radar-warn)' },
    { label: 'Je perds', value: kpis.cheaperThanMe, color: 'var(--radar-bad)' },
  ]
  const total = segs.reduce((n, s) => n + s.value, 0) || 1
  const R = 42
  const C = 2 * Math.PI * R
  let offset = 0

  return (
    <section className="radar-card radar-in px-4 py-4">
      <div className="mb-3 flex items-center gap-2">
        <PieChart size={16} color="var(--radar-accent-2)" />
        <h2 className="text-[15px] font-semibold">Positionnement prix</h2>
        <span className="ml-auto radar-tnum text-[12px]" style={{ color: 'var(--radar-text-3)' }}>
          tenue {fmtPct(cockpit.priceHoldPct)}
        </span>
      </div>
      <div className="flex items-center gap-5">
        <svg viewBox="0 0 100 100" className="h-28 w-28 shrink-0 -rotate-90">
          <circle cx="50" cy="50" r={R} fill="none" stroke="var(--radar-surface-2)" strokeWidth="14" />
          {segs.map((s) => {
            const len = (s.value / total) * C
            const el = (
              <circle
                key={s.label}
                cx="50" cy="50" r={R} fill="none" stroke={s.color} strokeWidth="14"
                strokeDasharray={`${len} ${C - len}`} strokeDashoffset={-offset}
              />
            )
            offset += len
            return el
          })}
        </svg>
        <ul className="min-w-0 flex-1 space-y-2">
          {segs.map((s) => (
            <li key={s.label} className="flex items-center gap-2 text-[13px]">
              <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: s.color }} />
              <span className="flex-1" style={{ color: 'var(--radar-text-2)' }}>{s.label}</span>
              <span className="radar-tnum font-semibold">{fmtInt(s.value)}</span>
              <span className="radar-tnum w-10 text-right text-[11px]" style={{ color: 'var(--radar-text-3)' }}>
                {fmtPct((s.value / total) * 100)}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}
