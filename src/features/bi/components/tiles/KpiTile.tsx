// Une mesure, en grand. ⚠ La valeur s'ANIME quand elle change : sur un tableau branché en
// direct, on doit voir que ça bouge, pas seulement le résultat.
import { AnimatedNumber } from '@/components/shared/AnimatedNumber'
import { formatMeasure } from '../../engine/formatValue'
import { intlLocale, useTranslation } from '@/lib/i18n'
import type { AggregateResult } from '../../engine/aggregate'

export function KpiTile({ result }: { result: AggregateResult }) {
  const { t, locale } = useTranslation()
  const col = result.columns.find((c) => c.role === 'measure')
  const raw = col ? result.rows[0]?.[col.key] ?? null : null
  const value = typeof raw === 'number' ? raw : null
  // ⚠ `label` (venu de la donnée) prime sur `labelKey` (catalogue i18n) quand il est présent.
  const label = col ? col.label ?? t(col.labelKey) : null

  return (
    <div className="h-full flex flex-col justify-center">
      <p className="text-3xl font-semibold text-white tabular-nums">
        {value === null
          ? '—'
          : <AnimatedNumber value={value} format={(n) => formatMeasure(n, col?.format, intlLocale(locale))} />}
      </p>
      {label && <p className="text-[11px] text-white/40 mt-1">{label}</p>}
    </div>
  )
}
