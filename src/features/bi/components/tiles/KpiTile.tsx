// Une mesure, en grand — et sa TENDANCE dès qu'une dimension lui en donne une.
//
// ⚠ La valeur s'ANIME quand elle change : sur un tableau branché en direct, on doit voir
// que ça bouge, pas seulement le résultat.
//
// ⚠⚠ La variation n'est JAMAIS colorée en vert ou en rouge. Une hausse de ruptures est
// mauvaise pour l'acheteur et bonne pour le vendeur, et la tuile ne sait pas de quel côté on
// est : elle dit le SENS (la flèche, le signe), jamais le jugement. C'est la même règle que
// celle des barres, écrite dans `fieldColors`.
import { ArrowDownRight, ArrowRight, ArrowUpRight } from 'lucide-react'
import { AnimatedNumber } from '@/components/shared/AnimatedNumber'
import { Sparkline } from '@/components/Sparkline'
import { formatMeasure } from '../../engine/formatValue'
import { buildKpi, kpiDelta } from './kpiData'
import { biLabel } from '../biLabel'
import { intlLocale, useTranslation } from '@/lib/i18n'
import type { AggregateResult } from '../../engine/aggregate'

export function KpiTile({ result, accent }: { result: AggregateResult; accent?: string }) {
  const { t, locale } = useTranslation()
  const model = buildKpi(result)
  const label = model.measure ? biLabel(model.measure, t) : null
  // ⚠ La teinte vient de l'identifiant de la tuile, jamais de sa position : déplacer une
  // tuile ne doit pas la faire changer de couleur — on retrouve « la verte » d'un coup d'œil.
  const color = accent ?? '#6366f1'
  const fmt = (n: number) => formatMeasure(n, model.measure?.format, intlLocale(locale))

  const { value, previous } = model
  const delta = value !== null && previous !== undefined ? kpiDelta(value, previous) : null
  const gap = value !== null && previous !== undefined ? value - previous : null
  const Arrow = gap === null || gap === 0 ? ArrowRight : gap > 0 ? ArrowUpRight : ArrowDownRight
  const percent = new Intl.NumberFormat(intlLocale(locale), {
    style: 'percent', maximumFractionDigits: 1, signDisplay: 'exceptZero',
  })

  return (
    <div className="flex h-full flex-col justify-center">
      {/* Filet coloré : il donne son identité au chiffre sans le teindre, ce qui garderait
          la valeur moins lisible qu'en blanc plein. */}
      <span className="mb-2 block h-[3px] w-8 rounded-full" style={{ background: color }} />
      <p className="text-3xl font-semibold tabular-nums text-white">
        {value === null ? '—' : <AnimatedNumber value={value} format={fmt} />}
      </p>
      {label && <p className="mt-1 text-[11px] text-white/40">{label}</p>}

      {gap !== null && (
        <div className="mt-2 flex items-center gap-2">
          <span className="flex shrink-0 items-center gap-1 text-[11px] tabular-nums text-white/70">
            <Arrow className="h-3.5 w-3.5" />
            {/* ⚠ L'écart BRUT prend le relais quand le rapport n'a pas de sens (base à zéro) :
                mieux vaut « +42 » qu'un pourcentage inventé. */}
            {delta === null ? `${gap > 0 ? '+' : ''}${fmt(gap)}` : percent.format(delta)}
          </span>
          {model.series.length > 1 && (
            <Sparkline values={model.series} color={color} width={72} height={18} />
          )}
        </div>
      )}
      {model.previousLabel && (
        <p className="mt-0.5 truncate text-[10px] text-white/30"
          title={t('bi.kpi.versus', { label: model.previousLabel })}>
          {t('bi.kpi.versus', { label: model.previousLabel })}
        </p>
      )}
    </div>
  )
}
