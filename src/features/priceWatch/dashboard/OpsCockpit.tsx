// src/features/priceWatch/dashboard/OpsCockpit.tsx
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
import { buildOpsCockpit } from './opsMetrics'
import { useCompetitorMeta } from '../useCatalogReport'
import { useScrapeSpend } from './useScrapeSpend'
import { duration, ago, compactNum } from './format'
import { formatCountdown } from '@/features/workflows/runtime/cronSchedule'

interface ScheduleDoc { enabled: boolean; nextRunAt: number; lastRunAt?: number; lastStatus?: string }

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
function Cell({ icon: Icon, tint, label, value, sub, children }: {
  icon: typeof Layers; tint: string; label: string; value?: React.ReactNode; sub?: string; children?: React.ReactNode
}) {
  return (
    <div className="bg-well rounded-lg px-3 py-3 flex flex-col items-center text-center min-w-0">
      <div className="flex items-center gap-1.5 mb-1.5">
        <Icon className={`w-3.5 h-3.5 ${tint}`} />
        <span className="text-[10px] uppercase tracking-wide text-white/45 truncate">{label}</span>
      </div>
      {children ?? (
        <>
          <div className="text-2xl font-semibold text-white tabular-nums leading-none">{value}</div>
          {sub && <div className="text-[11px] text-white/40 mt-1 truncate max-w-full">{sub}</div>}
        </>
      )}
    </div>
  )
}

export function OpsCockpit({ report, watchId }: { report: StoredReport; watchId: string | null }) {
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
  const remainingPct = Math.round((1 - ck.avgProgress) * 100)
  const cronOn = !!sched?.enabled
  const hhmm = (ms: number) => new Date(ms).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
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
  const curLabel = curSite ? `${curSite.domain.replace(/^www\./, '')}${curSite.indexed === 0 ? ' · bloqué' : ''}` : null

  return (
    <section className="bg-surface rounded-lg p-4" data-pw-section="cockpit">
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <Activity className="w-4 h-4 text-indigo-400" />
        <h2 className="text-sm font-semibold text-white">Cockpit opérationnel</h2>

        {/* Statut LIVE en 3 états clairs : EN COURS (run actif/collecte récente) /
            EN ATTENTE (cron actif, entre deux runs — normal, PAS cassé) / ARRÊTÉ (cron off). */}
        {scrapeActive ? (
          <span className="flex items-center gap-1.5 text-[11px] font-semibold text-emerald-300 bg-emerald-500/12 border border-emerald-500/30 rounded-full px-2.5 py-0.5"
            title="Un run serveur est actif ou une passe de moisson a écrit récemment">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            Scraping en cours{curLabel ? ` · ${curLabel}` : ''}
          </span>
        ) : cronOn ? (
          <span className="flex items-center gap-1.5 text-[11px] font-medium text-sky-300 bg-sky-500/10 border border-sky-500/25 rounded-full px-2.5 py-0.5"
            title="Cron actif — pause programmée entre deux moissons (le scraping n'est pas arrêté)">
            <span className="w-2 h-2 rounded-full bg-sky-400" />
            En attente du prochain run · {overdue ? 'imminent' : hhmm(sched!.nextRunAt)}
          </span>
        ) : (
          <span className="flex items-center gap-1.5 text-[11px] font-medium text-white/55 bg-white/[0.05] border border-white/10 rounded-full px-2.5 py-0.5"
            title="Cron non activé — aucune moisson planifiée">
            <span className="w-2 h-2 rounded-full bg-white/40" />
            Scraping à l’arrêt (cron off){ck.lastCollectAt != null ? ` · dernière ${ago(ck.lastCollectAt, now)}` : ''}
          </span>
        )}

        <span className="text-[11px] text-white/40 ml-auto">
          {cronOn
            ? <>cron actif · prochain {overdue ? 'imminent' : hhmm(sched!.nextRunAt)}{sched?.lastStatus === 'error' ? <span className="text-rose-300"> · dernier run en erreur ⚠</span> : ''}</>
            : 'cron inactif (manuel)'}
          <span className="text-white/25"> · </span>analyse {hasReport ? ago(ck.runAt, now) : 'à venir (1ᵉʳ « Comparer »)'}
        </span>
      </div>

      {/* Rapport gelé malgré un cron actif : le dire FRANCHEMENT, avec la marche à suivre. */}
      {stalled && (
        <div className="mb-3 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[12px] text-amber-200">
          ⚠ Le tableau de bord n’a pas été rafraîchi depuis <b>{ago(ck.runAt, now)}</b> alors que le cron est actif —
          le dernier run n’a probablement pas produit de rapport. Relance le workflow (bouton <b>Run</b>), ou
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
            <div className="bg-well rounded-lg px-4 py-3 flex flex-col items-center">
              <Gauge value={ck.avgProgress} color="#818cf8">
                <div className="text-xl font-semibold text-white tabular-nums"><AnimatedNumber value={ck.avgProgress * 100} format={(n) => `${Math.round(n)}%`} /></div>
                <div className="text-[9px] uppercase tracking-wide text-white/45 mt-0.5">balayage</div>
              </Gauge>
              <div className="text-[11px] text-white/40 mt-1">{remainingPct}% restant à traiter</div>
            </div>
            {/* Cycles bouclés : concurrents ayant fini ≥ 1 balayage complet. */}
            <div className="bg-well rounded-lg px-4 py-3 flex flex-col items-center">
              <Gauge value={ck.sitesActive ? ck.sitesComplete / ck.sitesActive : 0} color="#34d399">
                <div className="text-xl font-semibold text-white tabular-nums">×<AnimatedNumber value={ck.cyclesDone} /></div>
                <div className="text-[9px] uppercase tracking-wide text-white/45 mt-0.5">cycles</div>
              </Gauge>
              <div className="text-[11px] text-white/40 mt-1">{ck.sitesComplete}/{ck.sitesActive} bouclés</div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 flex-1 min-w-[280px]">
              <Cell icon={Layers} tint="text-sky-400" label="Fiches collectées"
                value={<AnimatedNumber value={ck.totalIndexed} />} sub={`${ck.sitesActive}/${ck.sitesTotal} concurrents actifs`} />
              <Cell icon={Timer} tint="text-violet-400" label="Temps de moisson"
                value={duration(ck.totalCumulMs)} sub="cumulé, tous concurrents" />
              <Cell icon={RefreshCw} tint="text-amber-400" label="Durée d’un cycle"
                value={ck.slowestCycle ? duration(ck.slowestCycle.cycleMs) : '—'}
                sub={ck.slowestCycle ? `le + lent · ${ck.slowestCycle.domain.replace(/^www\./, '')}` : 'aucun cycle bouclé'} />
              <Cell icon={Fuel} tint="text-emerald-400" label="Jina (ce mois)"
                value={jina ? compactNum(jina.tokens) : '0'}
                sub={jina ? `${jina.requests.toLocaleString('fr-FR')} req · $${jina.costUsd.toFixed(2)}` : 'aucune requête'} />
              <Cell icon={Radio} tint="text-indigo-400" label="Concurrents actifs"
                value={`${ck.sitesActive}/${ck.sitesTotal}`} sub={`${ck.sitesComplete} à 100%`} />
              <Cell icon={CalendarClock} tint={cronOn ? 'text-emerald-400' : 'text-white/40'} label="Prochaine moisson">
                {!cronOn ? (
                  <>
                    <div className="text-sm font-medium text-white/50 leading-none mt-1">manuel</div>
                    <div className="text-[11px] text-white/35 mt-1">cron non activé</div>
                  </>
                ) : scrapeActive ? (
                  <>
                    <div className="text-lg font-semibold text-emerald-300 leading-none flex items-center justify-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />En cours
                    </div>
                    <div className="text-[11px] text-white/40 mt-1">
                      {sched?.lastRunAt ? `démarré ${hhmm(sched.lastRunAt)}` : ''}
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
                  title={`Balayage ${Math.round(c.progress * 100)}%`}>
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
