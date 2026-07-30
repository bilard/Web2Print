// MOUVEMENTS DE PRIX : ce qui a bougé chez les concurrents, quand, de combien.
// Le reste du cockpit montre des NIVEAUX (où j'en suis) ; cet écran montre le MOUVEMENT
// (ce qui vient de changer) — c'est là qu'un acheteur décide de réagir.
//
// Lecture : une baisse concurrente est une pression sur moi (rose) ; une hausse me rend
// mécaniquement plus compétitif (émeraude). L'écart affiché est celui d'APRÈS le mouvement.
import { useMemo, useState } from 'react'
import { ArrowDownRight, ArrowUpRight } from 'lucide-react'
import type { PriceEvent } from '../priceEvents'
import { summarizeMoves, eventsSince } from '../priceEvents'
import { matchesQuery, EMPTY_FILTER, type CockpitFilter } from './analytics'
import { eur, pct, agoShort } from './format'
import { useTranslation } from '@/lib/i18n'

const WINDOWS = [7, 30, 90] as const

function Stat({ label, value, accent, sub }: { label: string; value: string; accent?: string; sub?: string }) {
  return (
    <div className="bg-well rounded-md px-3 py-2 min-w-0">
      <div className="text-white/40 text-[10px] uppercase tracking-wide truncate">{label}</div>
      <div className={`text-lg font-semibold tabular-nums leading-tight ${accent ?? 'text-white'}`}>{value}</div>
      {sub && <div className="text-white/35 text-[11px] truncate">{sub}</div>}
    </div>
  )
}

export function PriceMoves({ events, filter = EMPTY_FILTER }: { events: PriceEvent[]; filter?: CockpitFilter }) {
  const { t } = useTranslation()
  const [days, setDays] = useState<number>(30)
  const [onlyDown, setOnlyDown] = useState(false)
  // `now` FIGÉ au montage : un `Date.now()` appelé au rendu changerait à chaque frame et
  // invaliderait les mémos ci-dessous — recalcul de la fenêtre sur des milliers de
  // mouvements à chaque render, pour un axe temps qui n'a pas bougé.
  const [now] = useState(() => Date.now())

  // Le journal obéit au moteur de recherche global comme les autres blocs dérivés :
  // chercher une réf doit montrer SES mouvements, pas ceux de tout le catalogue.
  const scoped = useMemo(() => {
    let out = eventsSince(events, days, now)
    if (filter.competitor !== 'all') out = out.filter((e) => e.sid === filter.competitor)
    if (filter.q.trim()) {
      out = out.filter((e) => matchesQuery(
        { name: e.name, reference: e.ref, ean: null, famille: null }, filter.q,
      ))
    }
    return out
  }, [events, days, now, filter.competitor, filter.q])

  const view = useMemo(() => (onlyDown ? scoped.filter((e) => e.pctChange < 0) : scoped), [scoped, onlyDown])
  const sum = useMemo(() => summarizeMoves(scoped), [scoped])

  // Les plus récents d'abord ; à date égale, le mouvement le plus marqué en tête.
  const rows = useMemo(
    () => [...view].sort((a, b) => b.at - a.at || Math.abs(b.pctChange) - Math.abs(a.pctChange)).slice(0, 60),
    [view],
  )

  return (
    <div className="bg-surface rounded-lg p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2 mb-3">
        <div>
          <div className="text-sm font-semibold text-white">{t('pw.moves.title')} <span className="text-white/40 font-normal">— ce qui vient de bouger</span></div>
          <div className="text-[11px] text-white/40 mt-0.5">
            {t('pw.moves.lead')}
            <span className="text-rose-400/70"> {t('pw.moves.down')}</span> ·
            <span className="text-emerald-400/70"> {t('pw.moves.up')}</span>.
          </div>
        </div>
        <div className="flex items-center gap-1">
          {WINDOWS.map((d) => (
            <button key={d} type="button" onClick={() => setDays(d)}
              className={`text-[11px] rounded px-2 py-1 border ${days === d ? 'border-indigo-400/40 text-indigo-300 bg-indigo-400/10' : 'border-white/10 text-white/45 hover:text-white/70'}`}>
              {d} j
            </button>
          ))}
        </div>
      </div>

      {events.length === 0 ? (
        <div className="text-white/40 text-sm py-10 text-center px-4">
          {t('pw.moves.empty')}
        </div>
      ) : (
        <>
        {(filter.q.trim() || filter.competitor !== 'all') && (
          <div className="text-[11px] text-white/40 mb-2">{t('pw.moves.filtered')}</div>
        )}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
            <Stat label={t('pw.moves.count')} value={sum.total.toLocaleString('fr-FR')} sub={`sur ${days} jours`} />
            <Stat label={t('pw.moves.decreases')} value={sum.down.toLocaleString('fr-FR')} accent="text-rose-400"
              sub={sum.avgDownPct == null ? '—' : `${pct(sum.avgDownPct)} en moyenne`} />
            <Stat label={t('pw.moves.increases')} value={sum.up.toLocaleString('fr-FR')} accent="text-emerald-400"
              sub={sum.avgUpPct == null ? '—' : `${pct(sum.avgUpPct)} en moyenne`} />
            <Stat label={t('pw.moves.mostActive')} value={sum.byCompetitor[0]?.dom.replace(/^www\./, '') ?? '—'}
              sub={sum.byCompetitor[0] ? `${sum.byCompetitor[0].moves} mouvements · ${sum.byCompetitor[0].down} baisses` : undefined} />
          </div>

          <label className="flex items-center gap-2 text-[11px] text-white/45 mb-2 cursor-pointer w-fit">
            <input type="checkbox" checked={onlyDown} onChange={(e) => setOnlyDown(e.target.checked)} className="accent-indigo-500" />
            Baisses concurrentes uniquement
          </label>

          {rows.length === 0 ? (
            <div className="text-white/40 text-sm py-8 text-center">{t('pw.moves.logEmpty')}</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs tabular-nums min-w-[640px]">
                <thead>
                  <tr className="text-white/40 text-[10px] uppercase tracking-wide text-right">
                    <th className="text-left font-medium pb-2">{t('pw.col.product')}</th>
                    <th className="text-left font-medium pb-2">{t('pw.col.competitor')}</th>
                    <th className="font-medium pb-2">{t('pw.col.before')}</th>
                    <th className="font-medium pb-2">{t('pw.col.after')}</th>
                    <th className="font-medium pb-2">{t('pw.col.change')}</th>
                    <th className="font-medium pb-2">{t('pw.col.myGap')}</th>
                    <th className="font-medium pb-2">{t('pw.col.when')}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((e, i) => {
                    const down = e.pctChange < 0
                    return (
                      <tr key={`${e.at}-${e.pid}-${e.sid}-${i}`} className="border-t border-white/5 text-right">
                        <td className="text-left py-1.5 text-white/85 max-w-[220px] truncate" title={e.name}>
                          {e.name}{e.ref && <span className="text-white/35"> · {e.ref}</span>}
                        </td>
                        <td className="text-left text-white/55">{e.dom.replace(/^www\./, '')}</td>
                        <td className="text-white/45">{eur(e.from)}</td>
                        <td className="text-white/80">{eur(e.to)}</td>
                        <td className={`font-medium ${down ? 'text-rose-400' : 'text-emerald-400'}`}>
                          <span className="inline-flex items-center gap-0.5 justify-end">
                            {down ? <ArrowDownRight className="w-3 h-3" /> : <ArrowUpRight className="w-3 h-3" />}
                            {pct(e.pctChange)}
                          </span>
                        </td>
                        {/* Écart APRÈS le mouvement : négatif = ce concurrent est passé sous mon prix. */}
                        <td className={e.gapAfter == null ? 'text-white/30' : e.gapAfter < 0 ? 'text-rose-300' : 'text-emerald-300'}>
                          {pct(e.gapAfter)}
                        </td>
                        <td className="text-white/35">{agoShort(e.at, now)}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
              {view.length > rows.length && (
                <div className="text-[11px] text-white/35 mt-2">
                  {rows.length} mouvements affichés sur {view.length.toLocaleString('fr-FR')} — réduis la fenêtre pour cibler.
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}
