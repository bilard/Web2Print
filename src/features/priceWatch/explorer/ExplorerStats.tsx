// Compteurs secondaires du site actif, calculés sur les lignes AFFICHÉES (filtres
// compris). La position tarifaire, elle, vit dans le ruban : elle mérite la largeur,
// ces chiffres-ci méritent une ligne discrète.
import type { SiteStats } from './stats'
import { eur } from '../dashboard/format'
import { useTranslation, intlLocale } from '@/lib/i18n'

function Stat({ label, value, tone = 'text-white/80', hint }: {
  label: string; value: string; tone?: string; hint?: string
}) {
  return (
    <div className="flex items-baseline gap-1.5 whitespace-nowrap" title={hint}>
      <span className="text-[10px] uppercase tracking-wide text-white/30">{label}</span>
      <span className={`text-xs font-medium tabular-nums ${tone}`}>{value}</span>
    </div>
  )
}

export function ExplorerStats({ stats, collected }: { stats: SiteStats; collected: number }) {
  // ⚠ t() DANS le rendu (via useTranslation) : en constante de module, la langue serait
  // figée à l'import et ne suivrait plus le changement de langue.
  const { t, locale } = useTranslation()
  const n = (v: number) => v.toLocaleString(intlLocale(locale))
  return (
    <div className="flex items-center gap-x-4 gap-y-1 flex-wrap">
      <Stat label={t('pwx.affichees')} value={`${n(stats.shown)} / ${n(collected)}`}
        hint={t('pwx.stats.shown.help')} />
      <Stat label={t('pwx.appariees')} value={n(stats.matched)} tone="text-sky-300"
        hint={t('pwx.stats.matched.help')} />
      <Stat label={t('pwx.chezLuiSeul')} value={n(stats.orphans)}
        hint={t('pwx.stats.orphans.help')} />
      <Stat label={t('pwx.prixMedian')} value={eur(stats.medPriceTtc)}
        hint={t('pwx.stats.medPrice.help')} />
      <Stat label={t('pwx.stats.promos')} value={n(stats.promos)} tone="text-amber-300"
        hint={stats.medDiscountPct != null ? t('pwx.stats.promos.help', { pct: stats.medDiscountPct }) : t('pwx.fichesAvecUnPrix')} />
      <Stat label={t('pwx.stats.ruptures')} value={n(stats.outOfStock)}
        hint={t('pwx.stats.ruptures.help')} />
    </div>
  )
}
