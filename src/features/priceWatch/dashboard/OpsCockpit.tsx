// Cockpit opérationnel de la veille (tableau de bord voiture) : d'un coup d'œil, où en
// est la collecte — fiches traitées, balayage restant, cycles bouclés, temps consommé,
// tokens Jina, prochaine moisson. Tout est LIVE (le rapport et la conso arrivent en
// onSnapshot ; countdown au tic). Lecture seule, aucun bouton d'action ici.
import { useEffect, useState } from 'react'
import { doc, onSnapshot } from 'firebase/firestore'
import { db } from '@/lib/firebase/config'
import { Layers, Timer, RefreshCw, Fuel, Radio, CalendarClock, Activity } from 'lucide-react'
import type { StoredReport } from '../reportStore'
import { Gauge } from './Gauge'
import { AnimatedNumber } from './AnimatedNumber'
import { buildOpsCockpit, competitorCountsLabel } from './opsMetrics'
import { useCompetitorMeta } from '../useCatalogReport'
import { useScrapeSpend } from './useScrapeSpend'
import { duration, ago, compactNum } from './format'
import { formatCountdown } from '@/features/workflows/runtime/cronLabels'
import { useTranslation } from '@/lib/i18n'

interface ScheduleDoc {
  enabled: boolean; nextRunAt: number; lastRunAt?: number; lastStatus?: string
  /** Cycle de moisson terminé à 100 % (tous les sites) — attend l'échéance calendaire. */
  cycleWaiting?: boolean
}

/** Abonnement best-effort au planning du workflow (clé = workflowId ; pour F1 Pro le
 *  watchId EST l'id du workflow). Absent → pas de compteur (jamais de faux countdown). */
function useWorkflowSchedule(workflowId: string | null): ScheduleDoc | null {
  const [sched, setSched] = useState<ScheduleDoc | null>(null)
  useEffect(() => {
    if (!workflowId) { setSched(null); return }
    return onSnapshot(doc(db, 'workflowSchedules', workflowId),
      (s) => setSched(s.exists() ? (s.data() as ScheduleDoc) : null),
      () => setSched(null))
  }, [workflowId])
  return sched
}

/** Tuile compteur : icône + label en tête, grand chiffre, sous-texte. */
function Cell({ icon: Icon, tint, label, value, sub, title, children }: {
  icon: typeof Layers; tint: string; label: string; value?: React.ReactNode; sub?: string
  title?: string; children?: React.ReactNode
}) {
  return (
    <div title={title} className="bg-well rounded-lg px-3 py-2 flex flex-col items-center text-center min-w-0">
      <div className="flex items-center gap-1.5 mb-1">
        <Icon className={`w-3 h-3 ${tint}`} />
        <span className="text-[10px] uppercase tracking-wide text-white/45 truncate">{label}</span>
      </div>
      {children ?? (
        <>
          <div className="text-xl font-semibold text-white tabular-nums leading-none">{value}</div>
          {sub && <div className="text-[11px] text-white/40 mt-0.5 truncate max-w-full">{sub}</div>}
        </>
      )}
    </div>
  )
}

/** Une couche de fetch dans la tuile de consommation : nom, volume, dépense. Alignée en
 *  colonnes pour que trois lignes se lisent d'un seul balayage vertical. */
function SpendLine({ label, tint, volume, cost }: {
  label: string; tint: string; volume: string; cost?: number
}) {
  return (
    <div className="flex items-baseline gap-1.5 text-[11px] leading-tight">
      <span className={`w-16 shrink-0 text-left truncate ${tint}`}>{label}</span>
      <span className="flex-1 text-right tabular-nums text-white/70">{volume}</span>
      <span className="w-12 text-right tabular-nums text-amber-300/90">
        {cost != null && cost > 0 ? `$${cost.toFixed(2)}` : '—'}
      </span>
    </div>
  )
}

export function OpsCockpit({ report, watchId }: { report: StoredReport; watchId: string | null }) {
  const { t } = useTranslation()
  const liveMeta = useCompetitorMeta(watchId)
  const ck = buildOpsCockpit(report, liveMeta)
  const spend = useScrapeSpend()
  const sched = useWorkflowSchedule(watchId)
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])

  const jina = spend?.byPlatform.jina
  const firecrawl = spend?.byPlatform.firecrawl
  const brightdata = spend?.byPlatform.brightdata
  const remainingPct = Math.round((1 - ck.avgProgress) * 100)
  const cronOn = !!sched?.enabled
  // Cycle COMPLET = le planning l'a acté (cycleWaiting, mode calendaire) OU tous les
  // concurrents actifs ont bouclé leur balayage (sitesComplete === sitesActive).
  const cycleComplete = !!sched?.cycleWaiting || (ck.sitesActive > 0 && ck.sitesComplete >= ck.sitesActive)
  const hhmm = (ms: number) => new Date(ms).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
  // Échéance calendaire (souvent à plusieurs jours) : jour + heure, pas seulement HH:MM.
  const dayTime = (ms: number) => new Date(ms).toLocaleString('fr-FR', {
    weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
  })
  const overdue = cronOn && sched!.nextRunAt <= now
  // Collecte « en cours » = une méta de moisson a bougé récemment (< 3 min).
  const collecting = ck.lastCollectAt != null && now - ck.lastCollectAt < 180_000
  // Signal UNIFIÉ « ça tourne » : un run serveur est actif (verrou → lastStatus 'running')
  // OU une passe de moisson a écrit récemment. Header ET tuile doivent s'appuyer dessus,
  // sinon l'un dit « à l'arrêt » pendant que l'autre dit « En cours » (contradiction vue).
  const scrapeActive = collecting || sched?.lastStatus === 'running'
  // runAt = 0 : aucune analyse « Comparer » encore (cockpit sur rapport vide, moisson seule).
  const hasReport = ck.runAt > 0
  // Rapport gelé : le cron est actif mais rien ne tourne ET aucune analyse fraîche > 20 min.
  const reportAgeMs = now - ck.runAt
  const stalled = hasReport && cronOn && !scrapeActive && reportAgeMs > 20 * 60_000
  // Site en cours de moisson (heartbeat) + s'il ne produit rien (anti-bot / bloqué), le dire.
  const curSite = collecting && ck.lastCollectDomain ? ck.competitors.find((c) => c.domain === ck.lastCollectDomain) : null
  const curLabel = curSite ? `${curSite.domain.replace(/^www\./, '')}${curSite.indexed === 0 ? t('pw.ops.blocked') : ''}` : null

  return (
    <section className="bg-surface rounded-lg p-4" data-pw-section="cockpit">
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <Activity className="w-4 h-4 text-indigo-400" />
        <h2 className="text-sm font-semibold text-white">{t('pw.ops.title')}</h2>

        {/* Statut LIVE en 3 états clairs : EN COURS (run actif/collecte récente) /
            EN ATTENTE (cron actif, entre deux runs — normal, PAS cassé) / ARRÊTÉ (cron off). */}
        {scrapeActive ? (
          <span className="flex items-center gap-1.5 text-[11px] font-semibold text-emerald-300 bg-emerald-500/12 border border-emerald-500/30 rounded-full px-2.5 py-0.5"
            title={t('pw.ops.active')}>
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            Scraping en cours{curLabel ? ` · ${curLabel}` : ''}
          </span>
        ) : cronOn ? (
          <span className="flex items-center gap-1.5 text-[11px] font-medium text-sky-300 bg-sky-500/10 border border-sky-500/25 rounded-full px-2.5 py-0.5"
            title={t('pw.ops.cronPaused')}>
            <span className="w-2 h-2 rounded-full bg-sky-400" />
            En attente du prochain run · {overdue ? 'imminent' : hhmm(sched!.nextRunAt)}
          </span>
        ) : (
          <span className="flex items-center gap-1.5 text-[11px] font-medium text-white/55 bg-white/[0.05] border border-white/10 rounded-full px-2.5 py-0.5"
            title={t('pw.ops.cronOff')}>
            <span className="w-2 h-2 rounded-full bg-white/40" />
            {t('pw.ops.stopped')}{ck.lastCollectAt != null ? t('pw.ops.lastRun', { ago: ago(ck.lastCollectAt, now) }) : ''}
          </span>
        )}

        <span className="text-[11px] text-white/40 ml-auto">
          {cronOn
            ? <>cron actif · prochain {overdue ? 'imminent' : hhmm(sched!.nextRunAt)}{sched?.lastStatus === 'error' ? <span className="text-rose-300"> · dernier run en erreur ⚠</span> : ''}</>
            : t('pw.ops.cronInactive')}
          <span className="text-white/25"> · </span>{t('pw.ops.analysedAgo', { ago: hasReport ? ago(ck.runAt, now) : t('pw.ops.upcoming') })}
        </span>
      </div>

      {/* Rapport gelé malgré un cron actif : le dire FRANCHEMENT, avec la marche à suivre. */}
      {stalled && (
        <div className="mb-3 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[12px] text-amber-200">
          ⚠ Le tableau de bord n’a pas été rafraîchi depuis <b>{ago(ck.runAt, now)}</b> alors que le cron est actif —
          le dernier run n’a probablement pas produit de rapport. Relance le workflow (bouton <b>{t('pw.ops.run')}</b>), ou
          désactive puis réactive le cron pour le débloquer.
        </div>
      )}

      {!ck.hasData ? (
        <p className="text-sm text-white/45 py-4 text-center">
          En attente de moisson — lance le node « Moisson concurrents » du workflow pour peupler ces compteurs.
        </p>
      ) : (
        <>
          {/* Deux jauges rondes (ratios) + tuiles compteurs. */}
          <div className="flex flex-wrap items-stretch gap-3">
            {/* Balayage : ce qui RESTE à traiter (moyenne des concurrents actifs). */}
            <div className="bg-well rounded-lg px-3 py-2 flex flex-col items-center justify-center">
              <Gauge value={ck.avgProgress} color="#818cf8">
                <div className="text-xl font-semibold text-white tabular-nums"><AnimatedNumber value={ck.avgProgress * 100} format={(n) => `${Math.round(n)}%`} /></div>
                <div className="text-[9px] uppercase tracking-wide text-white/45 mt-0.5">{t('pw.ops.families')}</div>
              </Gauge>
              <div className="text-[11px] text-white/40 mt-1">{t('pw.ops.remaining', { pct: remainingPct })}</div>
            </div>
            {/* Avancement du CYCLE courant. L'ancien « ×cyclesDone » (min des balayages sur
                TOUS les sites) restait à 0 tant qu'un seul site n'avait pas bouclé → jamais
                alimenté. On montre désormais la progression réelle (sites bouclés / actifs)
                et, quand TOUS ont fini, un « ✓ Cycle complet » explicite (cycleWaiting du
                planning) avec la date de relance — la réponse à « c'est complet quand ? ». */}
            <div className="bg-well rounded-lg px-3 py-2 flex flex-col items-center justify-center"
              title={cycleComplete
                ? t('pw.ops.cycleDone.title')
                : `${ck.sitesComplete} concurrent(s) sur ${ck.sitesActive} ont bouclé leur balayage ce cycle.`}>
              <Gauge value={ck.sitesActive ? ck.sitesComplete / ck.sitesActive : 0} color="#34d399">
                {cycleComplete ? (
                  <>
                    <div className="text-2xl font-semibold text-emerald-300 leading-none">✓</div>
                    <div className="text-[9px] uppercase tracking-wide text-emerald-300/70 mt-0.5">{t('pw.ops.cycleDone')}</div>
                  </>
                ) : (
                  <>
                    <div className="text-xl font-semibold text-white tabular-nums">{ck.sitesComplete}/{ck.sitesActive}</div>
                    <div className="text-[9px] uppercase tracking-wide text-white/45 mt-0.5">{t('pw.ops.sitesDone')}</div>
                  </>
                )}
              </Gauge>
              <div className="text-[11px] text-white/40 mt-1 text-center">
                {cycleComplete
                  ? (cronOn ? <>{t('pw.ops.restart')} <b className="capitalize">{dayTime(sched!.nextRunAt)}</b></> : t('pw.ops.cycleDone'))
                  : ck.cyclesDone > 0
                    ? t('pw.ops.cycleRunning.done', { done: ck.cyclesDone })
                    : t('pw.ops.cycleRunning')}
              </div>
            </div>

            {/* Six tuiles sur UNE rangée dès 1536 px : à trois colonnes sur un écran large,
                chacune s'étalait sur près de six cents pixels pour y centrer huit
                chiffres. */}
            <div className="grid grid-cols-2 sm:grid-cols-3 2xl:grid-cols-6 gap-2 flex-1 min-w-[280px]">
              <Cell icon={Layers} tint="text-sky-400" label={t('pw.ops.recordsCollected')}
                value={<AnimatedNumber value={ck.totalIndexed} />} sub={t('pw.ops.activeCompetitors.sub', { active: ck.sitesActive, total: ck.sitesTotal })} />
              <Cell icon={Timer} tint="text-violet-400" label={t('pw.ops.harvestTime')}
                value={duration(ck.totalCumulMs)} sub={t('pw.ops.cumulative')} />
              <Cell icon={RefreshCw} tint="text-amber-400" label={t('pw.ops.cycleDuration')}
                value={ck.slowestCycle ? duration(ck.slowestCycle.cycleMs) : '—'}
                sub={ck.slowestCycle ? t('pw.ops.slowest', { domain: ck.slowestCycle.domain.replace(/^www\./, '') }) : t('pw.ops.noCycle')} />
              {/* Les trois couches de fetch dans UNE tuile : la moisson bascule de l'une à
                  l'autre selon le site, et leur donner un grand chiffre chacune coûtait trois
                  cases pour deux zéros. ⚠ Ces compteurs ne comptent QUE le navigateur — cf.
                  l'infobulle : un run du cron n'y apparaît pas. */}
              <Cell icon={Fuel} tint="text-emerald-400" label={t('pw.ops.spend')} title={t('pw.ops.spend.help')}>
                <div className="w-full space-y-0.5 mt-0.5">
                  <SpendLine label="Jina" tint="text-emerald-400/80"
                    volume={jina ? `${compactNum(jina.tokens)} tk` : '—'} cost={jina?.costUsd} />
                  <SpendLine label="Firecrawl" tint="text-orange-400/80"
                    volume={firecrawl ? `${compactNum(firecrawl.requests)} req` : '—'} cost={firecrawl?.costUsd} />
                  <SpendLine label="Bright Data" tint="text-cyan-400/80"
                    volume={brightdata ? `${compactNum(brightdata.requests)} req` : '—'} cost={brightdata?.costUsd} />
                </div>
              </Cell>
              {/* ACTIFS · INACTIFS · TOTAL — même définition et même phrase que la liste
                  des sites et que le bandeau de KPI, qui en donnaient trois versions. */}
              <Cell icon={Radio} tint="text-indigo-400" label={t('pw.ops.activeCompetitors')}
                title={t('pw.counts.help')}
                value={<>{ck.counts.active}<span className="text-white/35">/{ck.counts.total}</span></>}
                sub={competitorCountsLabel(ck.counts)} />
              <Cell icon={CalendarClock} tint={cronOn ? 'text-emerald-400' : 'text-white/40'} label={t('pw.ops.nextHarvest')}>
                {!cronOn ? (
                  <>
                    <div className="text-sm font-medium text-white/50 leading-none mt-1">{t('pw.ops.manual')}</div>
                    <div className="text-[11px] text-white/35 mt-1">{t('pw.ops.cronOff.short')}</div>
                  </>
                ) : scrapeActive ? (
                  <>
                    <div className="text-lg font-semibold text-emerald-300 leading-none flex items-center justify-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />{t('wfx.running')}
                    </div>
                    <div className="text-[11px] text-white/40 mt-1">
                      {sched?.lastRunAt ? t('pw.ops.startedAt', { time: hhmm(sched.lastRunAt) }) : ''}
                      {sched?.lastRunAt && ' · '}prochaine {hhmm(sched!.nextRunAt)}
                    </div>
                  </>
                ) : (
                  <>
                    <div className="text-2xl font-semibold text-white tabular-nums leading-none">{hhmm(sched!.nextRunAt)}</div>
                    <div className="text-[11px] text-white/40 mt-1">
                      <span className={overdue ? 'text-emerald-300' : ''}>{overdue ? 'imminent' : `dans ${formatCountdown(sched!.nextRunAt - now)}`}</span>
                      {sched?.lastRunAt ? ` · dernier ${hhmm(sched.lastRunAt)}${sched.lastStatus === 'error' ? ' ⚠' : ''}` : ''}
                    </div>
                  </>
                )}
              </Cell>
            </div>
          </div>

          {/* Qui scrape quoi : les concurrents par volume, barre de balayage + cycles. */}
          <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-4 gap-y-1.5">
            {ck.competitors.filter((c) => c.indexed > 0).slice(0, 12).map((c) => (
              <div key={c.siteId} className="flex items-center gap-2 text-xs">
                <span className="truncate text-white/75 flex-1 min-w-0" title={c.domain}>{c.domain.replace(/^www\./, '')}</span>
                <div className="h-1.5 w-16 rounded-full bg-white/[0.06] overflow-hidden shrink-0"
                  title={`Familles parcourues ${Math.round(c.progress * 100)} %`}>
                  <div className={`h-full ${c.progress >= 1 ? 'bg-emerald-500' : 'bg-indigo-400'}`} style={{ width: `${Math.round(c.progress * 100)}%` }} />
                </div>
                <span className="tabular-nums text-white/50 w-12 text-right shrink-0">{compactNum(c.indexed)}</span>
                <span className={`tabular-nums w-7 text-right shrink-0 ${c.sweeps > 0 ? 'text-emerald-300/80' : 'text-white/30'}`}>×{c.sweeps}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </section>
  )
}
