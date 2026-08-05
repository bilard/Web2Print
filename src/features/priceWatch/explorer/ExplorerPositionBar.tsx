// Ruban de position tarifaire : la répartition « il est moins cher / aligné / je gagne »
// en une seule barre proportionnelle, chaque segment cliquable pour filtrer.
//
// Pourquoi une barre plutôt que trois tuiles : sur un comparateur, le chiffre utile n'est
// pas « 812 fiches moins chères » mais la PART que ça représente. Trois nombres gris côte
// à côte obligeaient à faire la division de tête ; la largeur la donne d'un regard.
import { useTranslation } from '@/lib/i18n'
import { pct } from '../dashboard/format'
import type { SiteStats } from './stats'
import type { GapBand } from './filters'

const SEGMENTS: { band: Exclude<GapBand, 'all'>; key: keyof SiteStats; bg: string; text: string; labelKey: 'pwx.ilEstMoinsCher' | 'pwx.aligne1' | 'pwx.jeSuisMoinsCher' }[] = [
  { band: 'cheaper', key: 'cheaper', bg: 'bg-rose-500/70', text: 'text-rose-300', labelKey: 'pwx.ilEstMoinsCher' },
  { band: 'aligned', key: 'aligned', bg: 'bg-white/25', text: 'text-white/60', labelKey: 'pwx.aligne1' },
  { band: 'dearer', key: 'dearer', bg: 'bg-emerald-500/70', text: 'text-emerald-300', labelKey: 'pwx.jeSuisMoinsCher' },
]

export function ExplorerPositionBar({ stats, active, onPick }: {
  stats: SiteStats
  active: GapBand
  onPick: (band: GapBand) => void
}) {
  const { t } = useTranslation()
  const total = stats.cheaper + stats.aligned + stats.dearer
  const gap = stats.medGapPct

  return (
    <div className="flex items-center gap-4 min-w-0">
      {/* Écart médian : le chiffre directeur, seul élément en gros corps de l'en-tête. */}
      <div className="shrink-0">
        <div className="text-[9px] uppercase tracking-wider text-white/35">{t('pwx.ecartMedian')}</div>
        <div className={`text-xl font-semibold tabular-nums leading-tight ${
          gap == null ? 'text-white/30' : gap < 0 ? 'text-rose-300' : 'text-emerald-300'
        }`}>
          {pct(gap)}
        </div>
      </div>

      <div className="flex-1 min-w-[180px]">
        <div className="flex items-center gap-2 h-2 rounded-full overflow-hidden bg-white/[0.06]">
          {total === 0
            ? <div className="w-full" />
            : SEGMENTS.map((s) => {
                const n = stats[s.key] as number
                if (n === 0) return null
                const on = active === s.band
                return (
                  <button key={s.band} type="button"
                    onClick={() => onPick(on ? 'all' : s.band)}
                    style={{ width: `${(n / total) * 100}%` }}
                    title={`${t(s.labelKey)} — ${n.toLocaleString()} (${Math.round((n / total) * 100)} %)`}
                    className={`h-full transition-all ${s.bg} ${on ? 'ring-1 ring-inset ring-[#fff]/60' : 'hover:brightness-125'}`} />
                )
              })}
        </div>
        <div className="flex items-center gap-3 mt-1 text-[10px] tabular-nums">
          {SEGMENTS.map((s) => {
            const n = stats[s.key] as number
            const on = active === s.band
            return (
              <button key={s.band} type="button" onClick={() => onPick(on ? 'all' : s.band)}
                className={`flex items-center gap-1 transition-colors ${on ? s.text : 'text-white/35 hover:text-white/60'}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${s.bg}`} />
                {t(s.labelKey)}
                <span className={on ? 'font-medium' : ''}>{n.toLocaleString()}</span>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
