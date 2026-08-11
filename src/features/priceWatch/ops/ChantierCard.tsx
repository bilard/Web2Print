// Une carte par chantier de l'écran « Suivi » : où il en est, ce qu'il reste, à quel
// rythme. Aucun calcul ici — tout vient déjà tranché de `buildWatchOps` (PUR).
import type { Chantier } from './buildWatchOps'
import { chantierLabelKey, chantierUnitKeys, etaParts, factLabelKey, plural, stoppedByKey, subPercentKey } from './opsFormat'
import { intlLocale, useTranslation } from '@/lib/i18n'

/**
 * Texte de durée restante, ou `null` quand il n'y a rien à dire — le chantier arrêté
 * (`stale`) masque la sienne, elle gonflerait tant que l'écran reste ouvert sans qu'un
 * octet n'ait bougé.
 *
 * ⚠⚠ Plus de « estimation indisponible ». La moisson n'a JAMAIS d'estimation (`etaMs` y est
 * `null` en dur : le battement à chaque site ferait exploser le débit), et la traduction
 * reste sous le plancher `ETA_FLOOR` pendant des heures sur une file de 200 000 champs. La
 * phrase s'affichait donc en permanence, sur tous les suivis, pour ne rien apprendre. Une
 * ligne absente dit exactement la même chose sans occuper la place.
 */
function EtaLabel({ chantier }: { chantier: Chantier }) {
  const { t } = useTranslation()
  if (chantier.stale) return <span className="text-amber-300/80">{t('ops.card.stopped')}</span>
  // Une fin annoncée par le passage lui-même : elle se DIT, en ton neutre, et n'appelle
  // aucune action — la suite part au prochain run.
  if (chantier.stoppedBy) return <span className="text-white/50">{t(stoppedByKey(chantier.stoppedBy))}</span>
  if (chantier.etaMs == null) return null
  const { h, m } = etaParts(chantier.etaMs)
  return (
    <span className="text-white/50 tabular-nums">
      {h > 0 ? t('ops.card.eta.hm', { h, m }) : t('ops.card.eta.m', { m })}
    </span>
  )
}

export function ChantierCard({ chantier: c }: { chantier: Chantier }) {
  const { t, locale: uiLocale } = useTranslation()
  const locale = intlLocale(uiLocale)
  // Ce que comptent les trois chiffres — l'unité change d'un chantier à l'autre, et le
  // pourcentage de la moisson ne mesure pas la même chose que les compteurs qui l'encadrent.
  const unit = chantierUnitKeys(c.id)
  const sub1 = subPercentKey(c.pct, c.done)

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

      <div className="flex items-start justify-between gap-2 text-[11px] text-white/50 tabular-nums">
        <span>{t(plural(unit.done, c.done), { n: c.done })}</span>
        {/* Le pourcentage porte SON étiquette quand il ne mesure pas ce que comptent ses
            voisins — sans elle, les trois nombres de la moisson passaient pour une erreur
            de calcul. */}
        <span className="flex flex-col items-center leading-tight text-center">
          <span className="text-white/70 font-medium">{sub1 ? t(sub1) : `${c.pct}%`}</span>
          {unit.pctLabelKey && (
            <span className="text-[9px] font-normal text-white/35">{t(unit.pctLabelKey)}</span>
          )}
        </span>
        <span>{t(plural(unit.remaining, c.remaining), { n: c.remaining })}</span>
      </div>

      {/* Ligne du bas seulement quand elle porte quelque chose : ni durée restante, ni
          badge d'arrêt, ni débit ⇒ pas de ligne, plutôt qu'un aveu d'ignorance permanent. */}
      {(c.stale || c.stoppedBy || c.etaMs != null || c.perMin != null) && (
        <div className="flex items-center justify-between text-[11px]">
          <EtaLabel chantier={c} />
          {c.perMin != null && <span className="ml-auto text-white/40 tabular-nums">{t('ops.card.perMin', { n: c.perMin })}</span>}
        </div>
      )}

      {/* ⚠⚠ CE QUE LE CHANTIER A RÉELLEMENT TRAITÉ. La jauge dit « où on en est », ces
          nombres disent « combien » — et c'est eux qui manquaient : la moisson collecte
          des milliers de fiches par run, l'écran n'en montrait aucune. */}
      {c.facts && c.facts.length > 0 && (
        <div className="flex flex-wrap gap-x-3 gap-y-1 pt-1.5 border-t border-white/5 text-[11px]">
          {c.facts.map((f) => (
            <span key={f.key} className="text-white/45">
              <span className="text-white/75 font-medium tabular-nums">{f.value.toLocaleString(locale)}</span>
              {' '}{t(factLabelKey(f.key))}
            </span>
          ))}
        </div>
      )}

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
