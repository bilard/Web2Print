// Bandeau statistique du site actif. Calculé sur les lignes AFFICHÉES : les chiffres
// suivent les filtres, sinon on lirait le site entier en croyant lire sa sélection.
import type { SiteStats } from './stats'
import { eur, pct } from '../dashboard/format'
import { useTranslation, intlLocale } from '@/lib/i18n'

function Tile({ label, value, tone = 'text-white', hint }: {
  label: string; value: string; tone?: string; hint?: string
}) {
  return (
    <div className="bg-well rounded px-2.5 py-1.5 border border-white/5 min-w-[92px]" title={hint}>
      <div className="text-[9px] uppercase tracking-wide text-white/35">{label}</div>
      <div className={`text-sm font-medium tabular-nums ${tone}`}>{value}</div>
    </div>
  )
}

export function ExplorerStats({ stats, collected }: { stats: SiteStats; collected: number }) {
  // ⚠ t() DANS le rendu (via useTranslation) : en constante de module, la langue serait
  // figée à l'import et ne suivrait plus le changement de langue.
  const { t, locale } = useTranslation()
  const n = (v: number) => v.toLocaleString(intlLocale(locale))
  return (
    <div className="flex items-stretch gap-1.5 flex-wrap">
      <Tile label={t('pwx.affichees')} value={`${n(stats.shown)} / ${n(collected)}`}
        hint={t('pwx.stats.shown.help')} />
      <Tile label={t('pwx.appariees')} value={n(stats.matched)} tone="text-sky-300"
        hint={t('pwx.stats.matched.help')} />
      <Tile label={t('pwx.chezLuiSeul')} value={n(stats.orphans)} tone="text-white/60"
        hint={t('pwx.stats.orphans.help')} />
      <Tile label={t('pwx.ecartMedian')} value={pct(stats.medGapPct)}
        tone={stats.medGapPct == null ? 'text-white/40' : stats.medGapPct < 0 ? 'text-rose-300' : 'text-emerald-300'}
        hint={t('pwx.stats.medGap.help')} />
      <Tile label={t('pw.opp.cheaper')} value={n(stats.cheaper)} tone="text-rose-300"
        hint={t('pwx.stats.cheaper.help')} />
      <Tile label={t('textFrame.aligned')} value={n(stats.aligned)} tone="text-white/60"
        hint={t('pwx.stats.aligned.help')} />
      <Tile label={t('pwx.stats.iWin')} value={n(stats.dearer)} tone="text-emerald-300"
        hint={t('pwx.stats.iWin.help')} />
      <Tile label={t('pwx.prixMedian')} value={eur(stats.medPriceTtc)} tone="text-white/80"
        hint={t('pwx.stats.medPrice.help')} />
      <Tile label={t('pwx.stats.promos')} value={n(stats.promos)} tone="text-amber-300"
        hint={stats.medDiscountPct != null ? t('pwx.stats.promos.help', { pct: stats.medDiscountPct }) : t('pwx.fichesAvecUnPrix')} />
      <Tile label={t('pwx.stats.ruptures')} value={n(stats.outOfStock)} tone="text-white/60"
        hint={t('pwx.stats.ruptures.help')} />
    </div>
  )
}
