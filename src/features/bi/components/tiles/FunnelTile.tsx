// Entonnoir : des étapes qui se réduisent, et le taux de passage de l'une à l'autre.
//
// ⚠ L'entonnoir suppose un ORDRE (les fiches collectées, puis appariées, puis moins chères).
// On respecte donc l'ordre de la requête — jamais un tri par valeur décroissante, qui
// fabriquerait une progression qui n'existe pas dans les données.
import { paletteAt } from './palette'
import { formatMeasure } from '../../engine/formatValue'
import { biLabel } from '../biLabel'
import { intlLocale, useTranslation } from '@/lib/i18n'
import type { AggregateResult } from '../../engine/aggregate'

export function FunnelTile({ result }: { result: AggregateResult }) {
  const { t, locale } = useTranslation()
  const dim = result.columns.find((c) => c.role === 'dimension')
  const measure = result.columns.find((c) => c.role === 'measure')
  if (!measure) return <p className="text-[11px] text-white/35">{t('bi.funnel.needsMeasure')}</p>

  // Deux lectures possibles : une étape par ligne (avec dimension), ou une étape par mesure.
  const steps = dim
    ? result.rows.map((r) => ({
        label: String(r[dim.key] ?? t('bi.filters.emptyValue')),
        value: typeof r[measure.key] === 'number' ? (r[measure.key] as number) : 0,
        format: measure.format,
      }))
    : result.columns.filter((c) => c.role === 'measure').map((c) => ({
        label: biLabel(c, t),
        value: typeof result.rows[0]?.[c.key] === 'number' ? (result.rows[0][c.key] as number) : 0,
        format: c.format,
      }))

  const top = steps[0]?.value ?? 0
  return (
    <div className="h-full flex flex-col justify-center gap-1.5">
      {steps.map((s, i) => {
        const width = top > 0 ? Math.max(4, (s.value / top) * 100) : 0
        // Taux de passage depuis l'étape PRÉCÉDENTE, pas depuis le sommet : c'est là que se
        // lit la perte, et c'est la question qu'on pose à un entonnoir.
        const prev = i > 0 ? steps[i - 1].value : null
        const rate = prev && prev > 0 ? (s.value / prev) * 100 : null
        return (
          <div key={`${s.label}:${i}`} className="flex items-center gap-2">
            <span className="w-28 shrink-0 truncate text-[11px] text-white/55" title={s.label}>{s.label}</span>
            <span className="flex-1 h-5 rounded bg-white/[0.05] overflow-hidden">
              {/* Une teinte par étape : la perte se lit alors d'un coup d'œil, sans compter
                  les barres. */}
              <span className="block h-full rounded" style={{ width: `${width}%`, background: paletteAt(i) }} />
            </span>
            <span className="w-20 shrink-0 text-right text-[11px] tabular-nums text-white/80">
              {formatMeasure(s.value, s.format, intlLocale(locale))}
            </span>
            <span className="w-14 shrink-0 text-right text-[10.5px] tabular-nums text-white/35">
              {rate === null ? '' : `${Math.round(rate)} %`}
            </span>
          </div>
        )
      })}
    </div>
  )
}
