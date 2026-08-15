// Jauge : une mesure, sa position sur une échelle, et le seuil qu'elle franchit ou non.
//
// ⚠ La jauge a besoin d'un MAXIMUM pour vouloir dire quelque chose. Sans borne configurée,
// on prend le total de la colonne quand la mesure est agrégeable (« 412 sur 1 186 »), et on
// se rabat sur 100 pour un pourcentage. Inventer une échelle arbitraire ferait varier
// l'aiguille sans rapport avec la donnée.
import { formatMeasure } from '../../engine/formatValue'
import { biLabel } from '../biLabel'
import { intlLocale, useTranslation } from '@/lib/i18n'
import type { AggregateResult } from '../../engine/aggregate'

/** Arc de 240°, ouvert vers le bas — la forme d'un compteur, lisible d'un coup d'œil. */
const SWEEP = 240
const R = 42

function polar(cx: number, cy: number, r: number, deg: number): [number, number] {
  const rad = ((deg - 90) * Math.PI) / 180
  return [cx + r * Math.cos(rad), cy + r * Math.sin(rad)]
}

function arc(cx: number, cy: number, r: number, from: number, to: number): string {
  const [x1, y1] = polar(cx, cy, r, from)
  const [x2, y2] = polar(cx, cy, r, to)
  return `M ${x1} ${y1} A ${r} ${r} 0 ${to - from > 180 ? 1 : 0} 1 ${x2} ${y2}`
}

export function GaugeTile({ result, accent }: { result: AggregateResult; accent?: string }) {
  const { t, locale } = useTranslation()
  const col = result.columns.find((c) => c.role === 'measure')
  const raw = col ? result.rows[0]?.[col.key] : null
  const value = typeof raw === 'number' ? raw : null

  // Échelle : 100 pour un pourcentage, sinon la somme de la colonne si elle a un sens.
  const max = col?.format === 'pct'
    ? 100
    : col && col.aggregable !== false
      ? result.rows.reduce((n, r) => n + (typeof r[col.key] === 'number' ? (r[col.key] as number) : 0), 0)
      : null

  if (value === null || !col) {
    return <p className="text-[11px] text-white/35">{t('bi.gauge.needsMeasure')}</p>
  }

  const ratio = max && max > 0 ? Math.max(0, Math.min(1, value / max)) : null
  const start = -SWEEP / 2
  const end = start + SWEEP * (ratio ?? 0)

  return (
    <div className="h-full flex flex-col items-center justify-center gap-1">
      <svg viewBox="0 0 100 76" className="w-full max-w-[180px]" aria-hidden="true">
        <path d={arc(50, 50, R, start, start + SWEEP)} fill="none"
          stroke="currentColor" className="text-white/[0.08]" strokeWidth="9" strokeLinecap="round" />
        {ratio !== null && (
          <path d={arc(50, 50, R, start, end)} fill="none"
            stroke={accent ?? '#6366f1'} strokeWidth="9" strokeLinecap="round" />
        )}
      </svg>
      <p className="-mt-6 text-2xl font-semibold text-white tabular-nums">
        {formatMeasure(value, col.format, intlLocale(locale))}
      </p>
      {/* ⚠ L'échelle est DITE : « sur 1 186 » change complètement la lecture de l'aiguille,
          et une jauge sans repère laisse croire à une proportion qu'on n'a pas mesurée. */}
      <p className="text-[10.5px] text-white/35">
        {ratio === null
          ? biLabel(col, t)
          : t('bi.gauge.outOf', { max: formatMeasure(max, col.format, intlLocale(locale)) })}
      </p>
    </div>
  )
}
