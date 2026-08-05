// Compteurs secondaires du site actif, calculés sur les lignes AFFICHÉES (filtres
// compris). La position tarifaire, elle, vit dans le ruban : elle mérite la largeur,
// ces chiffres-ci méritent une ligne discrète.
import type { SiteStats } from './stats'
import { eur } from '../dashboard/format'
import { useTranslation, intlLocale } from '@/lib/i18n'

/** Un compteur. Avec `onToggle`, il devient un FILTRE : cliquer restreint la liste à ce
 *  qu'il mesure — un chiffre qui intrigue doit pouvoir être ouvert, pas seulement lu. */
function Stat({ label, value, tone = 'text-white/80', hint, onToggle, active }: {
  label: string; value: string; tone?: string; hint?: string
  onToggle?: () => void; active?: boolean
}) {
  const body = (
    <>
      <span className={`text-[10px] uppercase tracking-wide ${active ? 'text-white/60' : 'text-white/30'}`}>{label}</span>
      <span className={`text-xs font-medium tabular-nums ${tone}`}>{value}</span>
    </>
  )
  if (!onToggle) {
    return <div className="flex items-baseline gap-1.5 whitespace-nowrap" title={hint}>{body}</div>
  }
  return (
    <button type="button" onClick={onToggle} title={hint}
      className={`flex items-baseline gap-1.5 whitespace-nowrap rounded px-1.5 py-0.5 -mx-1 border transition-colors ${
        active ? 'bg-white/[0.07] border-white/15' : 'border-transparent hover:bg-white/[0.05]'
      }`}>
      {body}
    </button>
  )
}

export function ExplorerStats({ stats, collected, promoOnly, outOfStockOnly, onTogglePromo, onToggleStock }: {
  stats: SiteStats
  collected: number
  promoOnly: boolean
  outOfStockOnly: boolean
  onTogglePromo: () => void
  onToggleStock: () => void
}) {
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
        active={promoOnly} onToggle={onTogglePromo}
        hint={stats.medDiscountPct != null ? t('pwx.stats.promos.help', { pct: stats.medDiscountPct }) : t('pwx.fichesAvecUnPrix')} />
      <Stat label={t('pwx.stats.ruptures')} value={n(stats.outOfStock)} tone={outOfStockOnly ? 'text-rose-300' : 'text-white/80'}
        active={outOfStockOnly} onToggle={onToggleStock}
        hint={t('pwx.stats.ruptures.help')} />
    </div>
  )
}
