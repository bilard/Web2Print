// Cockpit opérationnel de la veille (tableau de bord voiture) : d'un coup d'œil, où en
// est la collecte — fiches traitées, balayage restant, cycles bouclés, temps consommé,
// tokens Jina, prochaine moisson. Tout est LIVE (le rapport et la conso arrivent en
// onSnapshot ; countdown au tic). Lecture seule, aucun bouton d'action ici.
import { Fragment, useEffect, useState } from 'react'
import { Layers, Timer, RefreshCw, Fuel, Radio, CalendarClock, Activity } from 'lucide-react'
import type { StoredReport } from '../reportStore'
import { Gauge } from './Gauge'
import { AnimatedNumber } from './AnimatedNumber'
import { buildOpsCockpit, scopeCockpit, competitorCountsLabel } from './opsMetrics'
import { useCompetitorMeta } from '../useCatalogReport'
import { useScrapeSpend } from './useScrapeSpend'
import { useWorkflowSchedule } from './useWorkflowSchedule'
import { duration, ago, compactNum, agoShort } from './format'
import { formatCountdown } from '@/features/workflows/runtime/cronLabels'
import { intlLocale, useTranslation } from '@/lib/i18n'

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
    <div className="flex items-baseline gap-1.5 text-[11px] leading-tight whitespace-nowrap">
      <span className={`shrink-0 text-left truncate ${tint}`}>{label}</span>
      {/* `min-w-0` + `whitespace-nowrap` : « 85,4 M tk » se coupait entre le nombre et son
          unité, et la tuile gagnait une ligne pour un espace insécable manquant. */}
      <span className="flex-1 min-w-0 text-right tabular-nums text-white/70 truncate">{volume}</span>
      <span className="shrink-0 text-right tabular-nums text-amber-300/90">
        {cost != null && cost > 0 ? `$${cost.toFixed(2)}` : '—'}
      </span>
    </div>
  )
}

export function OpsCockpit({ report, watchId }: { report: StoredReport; watchId: string | null }) {
  const { t, locale } = useTranslation()
  const liveMeta = useCompetitorMeta(watchId)
  const ckAll = buildOpsCockpit(report, liveMeta)
  // Périmètre du panneau ENTIER, pas seulement du rail : les tuiles doivent compter la
  // même chose que la liste qu'elles surplombent (cf. `scopeCockpit`).
  const [scope, setScope] = useState<'active' | 'all'>('active')
  const ck = scopeCockpit(ckAll, scope)
  const spend = useScrapeSpend()
  // Clé = workflowId ; pour F1 Pro le watchId EST l'id du workflow.
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
  const shown = ck.competitors.filter((c) => c.indexed > 0)
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
              <Gauge value={ck.avgProgress} color="#818cf8" size={84}>
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
              <Gauge value={ck.sitesActive ? ck.sitesComplete / ck.sitesActive : 0} color="#34d399" size={84}>
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
          {/* ⚠ DEUX périmètres, parce que ce rail répond à deux questions différentes.
              « Actifs » ne montre que les sites qui travaillent — c'est l'état de la
              collecte en cours. « Tous » ajoute les sites décochés, qui gardent leurs
              fiches d'hier : c'est l'inventaire de ce qu'on a en base, y compris ce qui ne
              tourne plus. Mélanger les deux dans une liste unique faisait passer un vieux
              stock pour du travail en cours. */}
          <div className="mt-3 flex items-center gap-1.5">
            {(['active', 'all'] as const).map((s) => (
              <button key={s} type="button" onClick={() => setScope(s)}
                title={t(s === 'active' ? 'pw.ops.scope.active.help' : 'pw.ops.scope.all.help')}
                className={`text-[10px] uppercase tracking-wide rounded px-2 py-0.5 border transition-colors ${
                  scope === s
                    ? 'border-indigo-400/40 bg-indigo-500/15 text-indigo-200'
                    : 'border-white/10 text-white/40 hover:text-white/70'
                }`}>
                {t(s === 'active' ? 'pw.ops.scope.active' : 'pw.ops.scope.all')}
                <span className="ml-1 tabular-nums opacity-70">
                  {/* Compté sur le cockpit COMPLET : un bouton dont le nombre change quand
                      on le sélectionne ne dit plus ce qu'il propose. */}
                  {s === 'active'
                    ? ckAll.competitors.filter((c) => c.indexed > 0 && c.enabled).length
                    : ckAll.competitors.filter((c) => c.indexed > 0).length}
                </span>
              </button>
            ))}
          </div>
          {/* Quatre colonnes sur grand écran : les douze concurrents tiennent en trois
              rangées au lieu de quatre, et c'est autant de hauteur rendue à la suite. */}
          {/* ⚠⚠ UN TABLEAU, pas des blocs juxtaposés. En quatre colonnes de cartes
              indépendantes, chaque bloc alignait ses valeurs pour lui seul : deux domaines
              voisins n'avaient ni leurs barres, ni leurs volumes, ni leurs dates sur la même
              verticale, et il fallait relire chaque ligne pour savoir quel chiffre allait
              avec quel site. Les colonnes sont désormais partagées, avec un en-tête qui les
              nomme — c'est ce qui fait la différence entre une liste et un tableau.

              Deux tableaux côte à côte sur grand écran : vingt-deux lignes d'un seul tenant
              feraient huit cents pixels de haut avant le premier graphique. */}
          <div className="mt-2 grid grid-cols-1 xl:grid-cols-2 gap-x-6 gap-y-0.5">
            {[0, 1].map((half) => {
              const list = shown.slice(0, scope === 'all' ? 24 : 12)
              const cut = Math.ceil(list.length / 2)
              const part = half === 0 ? list.slice(0, cut) : list.slice(cut)
              if (part.length === 0) return null
              return (
                <div key={half} className="min-w-0">
                  <div className="grid grid-cols-[minmax(0,1fr)_4rem_3.5rem_2.25rem_2.75rem] gap-2 items-center
                    text-[9px] uppercase tracking-wide text-white/25 border-b border-white/[0.06] pb-1">
                    <span>{t('pw.ops.col.site')}</span>
                    <span className="text-center">{t('pw.ops.col.sweep')}</span>
                    <span className="text-right">{t('pw.ops.col.listings')}</span>
                    <span className="text-right">{t('pw.ops.col.cycles')}</span>
                    <span className="text-right">{t('pw.ops.col.last')}</span>
                  </div>
                  {part.map((c, k) => (
                    <Fragment key={c.siteId}>
                    {/* ⚠ FILET de séparation dès que le groupe change — y compris en tête
                        de colonne, où la frontière tombe sans qu'on la voie. Sans lui, les
                        sites au repos se confondaient avec ceux qui travaillent : deux
                        lignes voisines, même graisse, même colonne, et rien pour dire que
                        l'une est collectée à l'instant et l'autre depuis six jours. */}
                    {!c.enabled && (k === 0 || part[k - 1].enabled) && (
                      <div className="flex items-center gap-2 pt-2 pb-0.5">
                        <span className="text-[9px] uppercase tracking-wider text-white/25 whitespace-nowrap">
                          {t('ops.gauges.groupInactive')}
                        </span>
                        <span className="h-px flex-1 bg-white/10" />
                      </div>
                    )}
                    <div
                      className="grid grid-cols-[minmax(0,1fr)_4rem_3.5rem_2.25rem_2.75rem] gap-2 items-center
                        text-xs py-[3px] border-b border-white/[0.03] hover:bg-white/[0.03]">
                      <span className={`truncate ${c.enabled ? 'text-white/75' : 'text-white/35 italic'}`}
                        title={c.enabled ? c.domain : t('pw.ops.scope.off', { domain: c.domain })}>
                        {c.domain.replace(/^www\./, '')}
                      </span>
                      <div className="h-1.5 rounded-full bg-white/[0.06] overflow-hidden"
                        title={t('pw.ops.col.sweep.help', { pct: Math.round(c.progress * 100) })}>
                        <div className={`h-full ${c.progress >= 1 ? 'bg-emerald-500' : 'bg-indigo-400'}`}
                          style={{ width: `${Math.round(c.progress * 100)}%` }} />
                      </div>
                      <span className="tabular-nums text-white/50 text-right">{compactNum(c.indexed)}</span>
                      <span className={`tabular-nums text-right ${c.sweeps > 0 ? 'text-emerald-300/80' : 'text-white/30'}`}>×{c.sweeps}</span>
                      {/* ⚠ La FRAÎCHEUR, à côté du volume. « 186 300 fiches » se lit comme
                          une richesse tant qu'on ignore que la dernière moisson remonte à
                          trois semaines : le stock est mort et le chiffre trompeur. */}
                      <span className="tabular-nums text-right text-white/30"
                        title={c.lastPassAt ? t('pw.ops.lastHarvest', { when: new Date(c.lastPassAt).toLocaleString(intlLocale(locale)) }) : t('pw.ops.neverHarvested')}>
                        {agoShort(c.lastPassAt, now)}
                      </span>
                    </div>
                    </Fragment>
                  ))}
                </div>
              )
            })}
          </div>
        </>
      )}
    </section>
  )
}
