// POURQUOI les appariements ne sont pas acquis — la ventilation, en clair et cliquable.
//
// Raison d'être, mesurée en production : 12 437 lignes à vérifier sur 26 608 appariées.
// Un tel volume ne s'audite pas à la main, et « 12 437 » ne dit pas par où commencer. La
// ventilation, elle, le dit : un motif qui pèse la moitié du tas est une RÈGLE à revoir,
// pas dix mille lignes à ouvrir. Elle existait déjà — mais dans une infobulle, c'est-à-dire
// invisible tant qu'on ne survolait pas le bon chiffre.
//
// Chaque motif isole ses lignes : c'est ce qui permet de juger sur pièces (« ces 3 000-là
// sont-elles vraiment fausses ? ») avant de toucher aux règles d'appariement.
import { DOUBT_SHORT } from './doubtLabels'
import type { DoubtReason } from './confidence'
import { useTranslation, intlLocale } from '@/lib/i18n'

export function ExplorerDoubtBar({ doubts, selected, onPick }: {
  /** Ventilation, la plus fréquente d'abord (cf. `countDoubts`). */
  doubts: Array<{ reason: DoubtReason; count: number }>
  selected: DoubtReason | null
  onPick: (reason: DoubtReason | null) => void
}) {
  const { t, locale } = useTranslation()
  const n = (v: number) => v.toLocaleString(intlLocale(locale))
  if (doubts.length === 0) return null
  const total = doubts.reduce((s, d) => s + d.count, 0)
  return (
    <div className="flex items-center gap-1.5 flex-wrap text-[10px] rounded bg-well/60 border border-white/10 px-2 py-1.5">
      <span className="text-amber-200/80 font-medium uppercase tracking-wide">
        {t('pwx.doubtBar.label')}
      </span>
      <span className="text-white/30 tabular-nums mr-1">{t('pwx.doubtBar.total', { count: n(total) })}</span>
      {doubts.map((d) => {
        const on = selected === d.reason
        return (
          <button key={d.reason} type="button"
            onClick={() => onPick(on ? null : d.reason)}
            title={t(on ? 'pwx.doubtBar.clear' : 'pwx.doubtBar.pick')}
            className={`px-1.5 py-px rounded border transition-colors ${
              on
                ? 'border-amber-400/50 bg-amber-500/15 text-amber-200'
                : 'border-white/10 text-white/50 hover:text-white/80 hover:border-white/25'
            }`}>
            {t(DOUBT_SHORT[d.reason])} <span className="tabular-nums opacity-70">{n(d.count)}</span>
          </button>
        )
      })}
    </div>
  )
}
