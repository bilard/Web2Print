// Compteurs secondaires du site actif, calculés sur les lignes AFFICHÉES (filtres
// compris). La position tarifaire, elle, vit dans le ruban : elle mérite la largeur,
// ces chiffres-ci méritent une ligne discrète.
import type { SiteStats } from './stats'
import { DOUBT_SHORT } from './doubtLabels'
import type { DoubtReason } from './confidence'
import { Stat } from './ExplorerStat'
import { eur } from '../dashboard/format'
import { useTranslation, intlLocale } from '@/lib/i18n'

export function ExplorerStats({ stats, collected, doubts, pairingPending, promoOnly, outOfStockOnly, suspectsOnly, visualDiffOnly, onTogglePromo, onToggleStock, onToggleSuspects, onToggleVisualDiff }: {
  stats: SiteStats
  collected: number
  /** Ventilation des motifs de doute, la plus fréquente d'abord (cf. `countDoubts`). */
  doubts: Array<{ reason: DoubtReason; count: number }>
  /** Le catalogue source n'est pas encore relu : les compteurs d'APPARIEMENT ne sont pas
   *  « 0 », ils ne sont pas CALCULÉS. Les publier comme des faits ferait lire « rien ne
   *  correspond » là où il n'y a rien eu à comparer. */
  pairingPending: boolean
  promoOnly: boolean
  outOfStockOnly: boolean
  suspectsOnly: boolean
  visualDiffOnly: boolean
  onTogglePromo: () => void
  onToggleStock: () => void
  onToggleSuspects: () => void
  onToggleVisualDiff: () => void
}) {
  // ⚠ t() DANS le rendu (via useTranslation) : en constante de module, la langue serait
  // figée à l'import et ne suivrait plus le changement de langue.
  const { t, locale } = useTranslation()
  const n = (v: number) => v.toLocaleString(intlLocale(locale))
  return (
    <div className="flex items-center gap-x-4 gap-y-1 flex-wrap">
      <Stat label={t('pwx.affichees')} value={`${n(stats.shown)} / ${n(collected)}`}
        hint={t('pwx.stats.shown.help')} />
      <Stat label={t('pwx.appariees')} value={pairingPending ? '…' : n(stats.matched)} tone="text-sky-300"
        hint={pairingPending ? t('pwx.source.pending.hint') : t('pwx.stats.matched.help')} />
      <Stat label={t('pwx.chezLuiSeul')} value={pairingPending ? '…' : n(stats.orphans)}
        hint={pairingPending ? t('pwx.source.pending.hint') : t('pwx.stats.orphans.help')} />
      {/* Compteur d'audit : le seul chiffre de cette ligne qui appelle une ACTION — et
          l'infobulle dit désormais POURQUOI. « 412 à vérifier » ne se règle pas ; « 380 sur
          référence d'origine, 30 sur clé courte » désigne le levier à actionner dans les
          règles d'appariement. */}
      <Stat label={t('pwx.trust.aVerifier')} value={n(stats.suspects)}
        tone={stats.suspects > 0 ? 'text-amber-300' : 'text-white/80'}
        active={suspectsOnly} onToggle={onToggleSuspects}
        hint={doubts.length > 0
          ? `${t('pwx.trust.aVerifier.help')} ${t('pwx.trust.byReason', {
            list: doubts.map((d) => `${t(DOUBT_SHORT[d.reason])} ${n(d.count)}`).join(' · '),
          })}`
          : t('pwx.trust.aVerifier.help')} />
      {/* Désaccords VISUELS, avec la couverture entre parenthèses. Publier « 3 » sans
          dire sur combien de paires jugées serait le même biais que la moyenne d'un
          ratio tronqué : le chiffre paraîtrait faible alors que rien n'a été analysé. */}
      {stats.visualComparable > 0 && (
        <Stat label={t('pwx.visual.stat')}
          value={stats.visualDone === 0 ? '—' : `${n(stats.visualDiff)} / ${n(stats.visualDone)}`}
          tone={stats.visualDiff > 0 ? 'text-rose-300' : 'text-white/80'}
          active={visualDiffOnly} onToggle={stats.visualDone > 0 ? onToggleVisualDiff : undefined}
          hint={stats.visualDone === 0
            ? t('pwx.visual.stat.none', { comparable: n(stats.visualComparable) })
            : t('pwx.visual.stat.help', { done: n(stats.visualDone), comparable: n(stats.visualComparable) })} />
      )}
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
