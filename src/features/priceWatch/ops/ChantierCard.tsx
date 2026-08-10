// Une carte par chantier de l'écran « Suivi » : où il en est, ce qu'il reste, à quel
// rythme. Aucun calcul ici — tout vient déjà tranché de `buildWatchOps` (PUR).
import type { Chantier } from './buildWatchOps'
import { chantierLabelKey, etaParts } from './opsFormat'
import { useTranslation } from '@/lib/i18n'

/** Texte de durée restante, ou `null` quand aucune estimation ne vaudrait rien — le
 *  chantier arrêté (`stale`) masque la sienne, elle gonflerait tant que l'écran reste
 *  ouvert sans qu'un octet n'ait bougé. */
function EtaLabel({ chantier }: { chantier: Chantier }) {
  const { t } = useTranslation()
  if (chantier.stale) return <span className="text-amber-300/80">{t('ops.card.stopped')}</span>
  if (chantier.etaMs == null) return <span className="text-white/40">{t('ops.card.eta.unavailable')}</span>
  const { h, m } = etaParts(chantier.etaMs)
  return (
    <span className="text-white/50 tabular-nums">
      {h > 0 ? t('ops.card.eta.hm', { h, m }) : t('ops.card.eta.m', { m })}
    </span>
  )
}

export function ChantierCard({ chantier: c }: { chantier: Chantier }) {
  const { t } = useTranslation()

  return (
    <div className="bg-surface rounded-lg p-4 space-y-2.5" data-pw-chantier={c.id}>
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-white truncate">{t(chantierLabelKey(c.id))}</h3>
        {c.stale && (
          <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wide text-amber-300
            bg-amber-500/12 border border-amber-500/30 rounded-full px-2 py-0.5">
            {t('ops.card.stale')}
          </span>
        )}
      </div>

      <div className="h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
        <div className={`h-full ${c.stale ? 'bg-white/25' : 'bg-indigo-400'}`} style={{ width: `${c.pct}%` }} />
      </div>

      <div className="flex items-center justify-between text-[11px] text-white/50 tabular-nums">
        <span>{t('ops.card.done', { n: c.done })}</span>
        <span className="text-white/70 font-medium">{c.pct}%</span>
        <span>{t('ops.card.remaining', { n: c.remaining })}</span>
      </div>

      <div className="flex items-center justify-between text-[11px]">
        <EtaLabel chantier={c} />
        {c.perMin != null && <span className="text-white/40 tabular-nums">{t('ops.card.perMin', { n: c.perMin })}</span>}
      </div>

      {/* Ventilation par langue — traduction seulement, et seulement si le passage en fournit une. */}
      {c.byLang && c.byLang.length > 0 && (
        <div className="flex flex-wrap gap-1.5 pt-1 border-t border-white/5">
          {c.byLang.map((l) => (
            <span key={l.lang ?? '∅'} className="text-[10px] text-white/45 bg-well rounded px-1.5 py-0.5 tabular-nums">
              {l.lang ?? t('ops.card.byLang.unknown')} · {l.count}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
