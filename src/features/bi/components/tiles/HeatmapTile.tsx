// Carte de chaleur : deux dimensions croisées, l'intensité portant la mesure.
//
// ⚠ Elle réutilise le croisement du tableau croisé (`toPivot`) plutôt que d'en écrire un
// second : deux calculs de la même matrice finiraient par diverger, et l'utilisateur lirait
// deux vérités selon le visuel choisi.
import { toPivot } from '../../engine/pivot'
import { formatMeasure } from '../../engine/formatValue'
import { intlLocale, useTranslation } from '@/lib/i18n'
import type { AggregateResult } from '../../engine/aggregate'

/** Opacité de la cellule selon son rang dans l'échelle. Plancher visible : une valeur faible
 *  mais PRÉSENTE ne doit pas se confondre avec une cellule jamais mesurée. */
function tint(value: number | null, max: number): string {
  if (value === null) return 'transparent'
  if (max <= 0) return 'rgba(99,102,241,0.15)'
  return `rgba(99,102,241,${0.12 + 0.78 * (value / max)})`
}

export function HeatmapTile({ result, columnDim }: {
  result: AggregateResult
  columnDim?: string
}) {
  const { t, locale } = useTranslation()
  const dims = result.columns.filter((c) => c.role === 'dimension')
  const measure = result.columns.find((c) => c.role === 'measure')
  if (dims.length < 2 || !measure) {
    return <p className="text-[11px] text-white/35">{t('bi.pivot.needsTwoDimensions')}</p>
  }
  const colDim = columnDim && dims.some((d) => d.key === columnDim) ? columnDim : dims[1].key
  const rowDim = dims.find((d) => d.key !== colDim)!.key
  const p = toPivot(result, rowDim, colDim, measure.key)
  const max = Math.max(0, ...p.rows.flatMap((r) => r.cells.map((c) => c ?? 0)))

  return (
    <table className="w-full text-[11px] tabular-nums border-separate" style={{ borderSpacing: 2 }}>
      <thead className="sticky top-0 bg-surface">
        <tr className="text-white/40">
          <th className="text-left font-medium py-1 pr-2"></th>
          {p.columns.map((c) => (
            <th key={String(c)} className="font-medium py-1 px-1 text-center whitespace-nowrap max-w-[90px] truncate"
              title={c ?? t('bi.filters.emptyValue')}>
              {c ?? '—'}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {p.rows.map((r) => (
          <tr key={String(r.key)}>
            <td className="py-1 pr-2 text-white/60 truncate max-w-[120px]" title={r.key ?? undefined}>
              {r.key ?? '—'}
            </td>
            {r.cells.map((v, i) => (
              <td key={i} className="text-center rounded px-1 py-1 text-white/90"
                style={{ background: tint(v, max) }}
                /* ⚠ Une cellule jamais mesurée reste TRANSPARENTE et vide : la teindre du
                   ton le plus faible la ferait passer pour un zéro mesuré. */
                title={v === null ? t('bi.heatmap.noValue') : undefined}>
                {v === null ? '' : formatMeasure(v, measure.format, intlLocale(locale))}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  )
}
