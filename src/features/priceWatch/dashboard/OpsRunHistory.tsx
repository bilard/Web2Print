// Bande « Cycles & runs » : ce qui s'est PASSÉ, à côté de ce qui se passe.
//
// ⚠ Le cockpit ne montrait que l'instant — avancement, cartes en cours, prochain
// déclenchement. Un run terminé ne laissait aucune trace visible : rien ne disait si les
// passages précédents avaient abouti. Un balayage qui échoue une fois sur deux ressemble
// alors exactement à un balayage sain, en deux fois plus lent.
//
// Deux informations, côte à côte parce qu'elles se lisent ensemble :
//   • le CYCLE — celui qui tourne (n° et sites bouclés) et ceux qui sont derrière ;
//   • les RUNS — un run est un passage du moteur ; il en faut plusieurs pour boucler un
//     cycle. Leur statut est la seule preuve que la mécanique tourne.
import { CheckCircle2, AlertTriangle, CircleDot, History } from 'lucide-react'
import { useTranslation } from '@/lib/i18n'
import type { RunHistorySummary } from './runHistorySummary'

/** hh:mm du jour, ou jj/mm au-delà — un historique se lit en un coup d'œil. */
function stamp(ms: number, locale: string): string {
  const d = new Date(ms)
  const sameDay = new Date().toDateString() === d.toDateString()
  return sameDay
    ? d.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })
    : d.toLocaleDateString(locale, { day: '2-digit', month: '2-digit' })
}

function duration(ms: number): string {
  if (ms < 60_000) return `${Math.round(ms / 1000)} s`
  if (ms < 3_600_000) return `${Math.round(ms / 60_000)} min`
  return `${(ms / 3_600_000).toFixed(1)} h`
}

/** ⚠ Le statut vient de la BASE : une valeur inattendue ne doit pas fabriquer une clé de
 *  traduction inexistante. Table explicite, repli sur « erreur ». */
const STATUS_KEY: Record<string, 'ops.runs.status.success' | 'ops.runs.status.partial' | 'ops.runs.status.error'> = {
  success: 'ops.runs.status.success',
  partial: 'ops.runs.status.partial',
  error: 'ops.runs.status.error',
}

interface Props {
  /** Cycles entièrement bouclés — le compte GARANTI (le plus lent des concurrents). */
  cyclesDone: number
  sitesComplete: number
  sitesActive: number
  cycleComplete: boolean
  history: RunHistorySummary | null
  locale: string
}

export function OpsRunHistory({ cyclesDone, sitesComplete, sitesActive, cycleComplete, history, locale }: Props) {
  const { t } = useTranslation()
  // Le cycle en cours porte le numéro suivant ceux qui sont bouclés. Rien en cours quand
  // tout est bouclé et que l'on attend la relance : afficher « cycle n°4 en cours » sur un
  // suivi à l'arrêt serait un mensonge tranquille.
  const currentNo = cyclesDone + 1

  return (
    <div className="bg-surface rounded-lg px-3.5 py-2.5" data-pw-section="ops-runs">
      <div className="flex items-center gap-2 mb-2">
        <History className="w-3.5 h-3.5 text-white/40 shrink-0" />
        <h3 className="text-[12px] font-semibold text-white">{t('ops.runs.title')}</h3>
      </div>

      <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
        {/* CYCLES — le compte que l'écran ne donnait nulle part en toutes lettres. */}
        <div className="flex items-baseline gap-2">
          <span className="text-[11px] text-white/40">{t('ops.runs.cycles')}</span>
          {cycleComplete ? (
            <span className="text-[13px] font-semibold text-emerald-300">{t('ops.runs.cycleWaiting')}</span>
          ) : (
            <span className="text-[13px] font-semibold text-white tabular-nums">
              {t('ops.runs.cycleCurrent', { no: currentNo })}
              <span className="ml-1 text-[11px] font-normal text-white/45">
                {t('ops.runs.sitesDone', { done: sitesComplete, total: sitesActive })}
              </span>
            </span>
          )}
          <span className="text-[11px] text-white/45 tabular-nums">
            · {t('ops.runs.cyclesDone', { count: cyclesDone })}
          </span>
        </div>

        {/* RUNS — les passages du moteur, du plus récent au plus ancien. */}
        {history && history.runs.length > 0 && (
          <div className="flex items-center gap-3 min-w-0">
            {/* ⚠ Le DÉNOMINATEUR dans le libellé. « ✓3 ⚠1 » sans lui ne dit pas sur quoi on
                compte — et la liste est bornée (vingt runs conservés par workflow, purge
                comprise), donc ce n'est jamais « depuis toujours ». */}
            <span className="text-[11px] text-white/40 shrink-0">{t('ops.runs.lastN', { n: history.runs.length })}</span>
            <div className="flex items-center gap-1 flex-wrap">
              {history.runs.map((r) => {
                const tone = r.status === 'success'
                  ? 'bg-emerald-400/80'
                  : r.status === 'partial' ? 'bg-amber-400/80' : 'bg-rose-400/80'
                return (
                  <span
                    key={r.id}
                    className={`w-2 h-2 rounded-full ${tone}`}
                    title={`${t(STATUS_KEY[r.status] ?? 'ops.runs.status.error')} · ${stamp(r.endedAt, locale)}`
                      + (r.endedAt > r.startedAt ? ` · ${duration(r.endedAt - r.startedAt)}` : '')
                      + (r.trigger === 'cron' ? ` · ${t('ops.runs.trigger.cron')}` : '')}
                  />
                )
              })}
            </div>
            <span className="text-[11px] tabular-nums whitespace-nowrap flex items-center gap-2">
              <span className="text-emerald-300/90 inline-flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3" />{history.ok}
              </span>
              {history.partial > 0 && (
                <span className="text-amber-300/90 inline-flex items-center gap-1">
                  <CircleDot className="w-3 h-3" />{history.partial}
                </span>
              )}
              {history.error > 0 && (
                <span className="text-rose-300/90 inline-flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3" />{history.error}
                </span>
              )}
            </span>
            {history.medianMs !== null && (
              <span className="text-[11px] text-white/35 whitespace-nowrap">
                {t('ops.runs.median', { d: duration(history.medianMs) })}
              </span>
            )}
            {/* QUAND remonte le dernier passage terminé. Sans lui, « ✓12 » se lit comme
                « ça tourne bien » alors que le dernier run peut dater d'avant-hier. */}
            {history.lastEndedAt != null && (
              <span className="text-[11px] text-white/35 whitespace-nowrap">
                {t('ops.runs.lastEnded', { time: stamp(history.lastEndedAt, locale) })}
              </span>
            )}
            {/* ⚠ Deux échecs d'affilée ne sont plus un accident : ça se dit en toutes
                lettres, sans avoir à compter les pastilles à l'œil. */}
            {history.failStreak >= 2 && (
              <span className="text-[11px] text-rose-300 whitespace-nowrap inline-flex items-center gap-1">
                <AlertTriangle className="w-3 h-3" />
                {t('ops.runs.failStreak', { count: history.failStreak })}
              </span>
            )}
          </div>
        )}
        {history && history.runs.length === 0 && (
          <span className="text-[11px] text-white/35">{t('ops.runs.none')}</span>
        )}
      </div>
    </div>
  )
}
