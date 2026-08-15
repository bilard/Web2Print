// Une mesure, en grand. ⚠ La valeur s'ANIME quand elle change : sur un tableau branché en
// direct, on doit voir que ça bouge, pas seulement le résultat.
import { AnimatedNumber } from '@/components/shared/AnimatedNumber'
import { formatMeasure } from '../../engine/formatValue'
import { biLabel } from '../biLabel'
import { intlLocale, useTranslation } from '@/lib/i18n'
import type { AggregateResult } from '../../engine/aggregate'

export function KpiTile({ result, accent }: { result: AggregateResult; accent?: string }) {
  const { t, locale } = useTranslation()
  const col = result.columns.find((c) => c.role === 'measure')
  const raw = col ? result.rows[0]?.[col.key] ?? null : null
  const value = typeof raw === 'number' ? raw : null
  const label = col ? biLabel(col, t) : null
  // ⚠ La teinte vient de l'identifiant de la tuile, jamais de sa position : déplacer une
  // tuile ne doit pas la faire changer de couleur — on retrouve « la verte » d'un coup d'œil.
  const color = accent ?? '#6366f1'

  return (
    <div className="h-full flex flex-col justify-center">
      {/* Filet coloré : il donne son identité au chiffre sans le teindre, ce qui garderait
          la valeur moins lisible qu'en blanc plein. */}
      <span className="block w-8 h-[3px] rounded-full mb-2" style={{ background: color }} />
      <p className="text-3xl font-semibold text-white tabular-nums">
        {value === null
          ? '—'
          : <AnimatedNumber value={value} format={(n) => formatMeasure(n, col?.format, intlLocale(locale))} />}
      </p>
      {label && <p className="text-[11px] text-white/40 mt-1">{label}</p>}
    </div>
  )
}
