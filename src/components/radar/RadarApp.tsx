import { useEffect, useMemo, useState } from 'react'
import { Radar, Gauge, Target, Users, FolderTree, Package, Database, Radio, Wallet } from 'lucide-react'
import { useWatchList, useCatalogReport, useReportHistory, useCompetitorMeta } from '@/features/priceWatch/useCatalogReport'
import { buildCockpit, sparkSeries } from '@/features/priceWatch/dashboard/analytics'
import { buildOpsCockpit } from '@/features/priceWatch/dashboard/opsMetrics'
import { runPulse, scrapeStatus } from '@/features/priceWatch/radar/scrapeState'
import { RadarHeader } from './RadarHeader'
import { RadarHero } from './RadarHero'
import { RadarKpiGrid } from './RadarKpiGrid'
import { RadarOpportunities } from './RadarOpportunities'
import { RadarCompetitors } from './RadarCompetitors'
import { RadarMenu, type RadarMenuItem } from './RadarMenu'
import { RadarVolume } from './RadarVolume'
import { RadarCollectStats } from './RadarCollectStats'
import { RadarPositionDonut } from './RadarPositionDonut'
import { RadarDistribution } from './RadarDistribution'
import { RadarMatching } from './RadarMatching'
import { RadarBenchmark } from './RadarBenchmark'
import { RadarCompetitorFlow } from './RadarCompetitorFlow'
import { RadarFamilies } from './RadarFamilies'
import { RadarHeatmap } from './RadarHeatmap'
import { RadarProducts } from './RadarProducts'
import { RadarCosts } from './RadarCosts'
import { RadarScraping } from './RadarScraping'
import { RadarScrapeBadge } from './RadarScrapeBadge'
import { RadarScheduleBar } from './RadarScheduleBar'
import { RadarInstallHint } from './RadarInstallHint'
import { useRadarSchedule, useRadarRunLive, useNowTick } from './useRadarSchedule'
import { useOrientation } from './useOrientation'
import { t } from '@/lib/i18n'

type Tab = 'apercu' | 'position' | 'concurrents' | 'familles' | 'produits' | 'volume' | 'scraping' | 'couts'
const MENU: readonly RadarMenuItem<Tab>[] = [
  { value: 'apercu', label: t('rd.tab.overview'), icon: Gauge },
  { value: 'position', label: 'Positionnement', icon: Target },
  { value: 'concurrents', label: 'Concurrents', icon: Users },
  { value: 'familles', label: 'Familles', icon: FolderTree },
  { value: 'produits', label: 'Produits', icon: Package },
  { value: 'volume', label: 'Collecte', icon: Database },
  { value: 'scraping', label: 'Scraping', icon: Radio },
  { value: 'couts', label: t('rd.tab.costs'), icon: Wallet },
]

/** Masonry 2 colonnes en paysage (les cartes se répartissent sur la largeur). */
const MASONRY = 'space-y-4 landscape:columns-2 landscape:gap-4 landscape:space-y-0 landscape:[&>*]:mb-4 landscape:[&>*]:break-inside-avoid'

/** Écran plein d'un message centré (états vides), thème radar committé. */
function Centered({ title, sub }: { title: string; sub: string }) {
  return (
    <div className="radar-root radar-safe-x flex min-h-[100dvh] flex-col items-center justify-center gap-4 text-center">
      <div className="grid h-14 w-14 place-items-center rounded-2xl" style={{ background: 'var(--radar-accent-soft)' }}>
        <Radar size={26} color="var(--radar-accent-2)" />
      </div>
      <div>
        <h1 className="radar-rounded text-[20px] font-bold">{title}</h1>
        <p className="mt-1 max-w-[280px] text-[13px]" style={{ color: 'var(--radar-text-2)' }}>{sub}</p>
      </div>
    </div>
  )
}

/** Coquille de la PWA radarPrice : sélection de la source (défaut = suivi le plus récent),
 *  lecture temps réel du rapport pré-agrégé, assemblage des sections glançables. */
export function RadarApp() {
  const watches = useWatchList()
  const [watchId, setWatchId] = useState<string | null>(null)
  useEffect(() => {
    if (watches.length === 0) { setWatchId(null); return }
    if (!watchId || !watches.some((w) => w.watchId === watchId)) setWatchId(watches[0].watchId)
  }, [watches, watchId])

  const report = useCatalogReport(watchId)
  const history = useReportHistory(watchId)
  const liveMeta = useCompetitorMeta(watchId)

  const cockpit = useMemo(() => (report ? buildCockpit(report) : null), [report])
  const ops = useMemo(() => (report ? buildOpsCockpit(report, liveMeta) : null), [report, liveMeta])
  const hold = useMemo(() => sparkSeries(history).hold, [history])

  const [scrolled, setScrolled] = useState(false)
  const [tab, setTab] = useState<Tab>('apercu')
  const [menuOpen, setMenuOpen] = useState(false)

  // ⚠ Le planning et l'abandon de run sont clefés par l'id du WORKFLOW, pas par le
  // watchId (qui en est dérivé via stableId) — lire au mauvais chemin donnerait un
  // bandeau muet et un STOP sans effet, en silence.
  const workflowId = watches.find((w) => w.watchId === watchId)?.workflowId ?? watchId
  const sched = useRadarSchedule(workflowId)
  const runLive = useRadarRunLive(workflowId)
  // Décompte à la seconde seulement là où il se voit (bandeau du planificateur) : ailleurs
  // un tick 1 s re-rendrait tous les graphes chaque seconde pour rien.
  const now = useNowTick(tab === 'scraping' ? 1000 : 30_000)
  // Ce qui tourne RÉELLEMENT : sans cet arbitre, le dernier battement de moisson faisait
  // clignoter les cartes pendant 3 min après un STOP ou une suspension.
  const pulse = useMemo(() => runPulse(sched, runLive, now), [sched, runLive, now])
  const status = useMemo(() => scrapeStatus(ops, sched, pulse, now), [ops, sched, pulse, now])
  const landscape = useOrientation()

  if (watches.length === 0) {
    return <Centered title="Aucune veille" sub="Lance un workflow « Comparer catalogue » pour alimenter ta veille tarifaire, puis reviens ici." />
  }

  const items = MENU.map((m) => (m.value === 'scraping' ? { ...m, hint: status.state === 'running' ? 'en cours' : undefined } : m))
  const viewLabel = MENU.find((m) => m.value === tab)?.label ?? 'Aperçu'

  return (
    // h-[100dvh] (et non min-h) : avec min-height la racine GRANDIT avec son contenu, ne
    // déborde jamais → c'est le document qui défile et la barre sticky s'en va avec lui.
    // Hauteur fixe = cette div EST le conteneur de défilement, l'en-tête (et le bandeau
    // épinglé) restent collés en haut.
    <div
      className="radar-root radar-noscroll h-[100dvh] overflow-y-auto"
      onScroll={(e) => setScrolled(e.currentTarget.scrollTop > 4)}
    >
      <RadarHeader
        watches={watches} value={watchId ?? ''} onChange={setWatchId} runAt={report?.runAt ?? null}
        scrolled={scrolled} viewLabel={viewLabel} onOpenMenu={() => setMenuOpen(true)}
      >
        {/* Onglet Scraping : le bandeau du planificateur reste ÉPINGLÉ au scroll. */}
        {tab === 'scraping' && <RadarScheduleBar sched={sched} pulse={pulse} workflowId={workflowId} now={now} />}
      </RadarHeader>

      <main className="radar-safe-x radar-safe-bottom mx-auto max-w-lg space-y-4 pt-2 landscape:max-w-5xl">
        {/* Le suivi du scraping ne dépend PAS d'un « Comparer » : il reste consultable
            avant le premier rapport (c'est justement là qu'on le regarde). */}
        {tab === 'scraping' ? (
          <>
            <RadarScraping report={report} meta={liveMeta} now={now} pulse={pulse} watchId={watchId} workflowId={workflowId} />
            <RadarInstallHint />
          </>
        ) : cockpit ? (
          <>
            {tab === 'apercu' && (
              <>
                <RadarScrapeBadge status={status} onClick={() => setTab('scraping')} />
                <RadarHero cockpit={cockpit} holdSeries={hold} ops={ops} collectActive={status.state === 'running'} />
                <RadarKpiGrid cockpit={cockpit} />
                {/* Paysage : les deux listes passent côte à côte (2 colonnes). */}
                <div className="grid gap-4 landscape:grid-cols-2 landscape:items-start">
                  <RadarOpportunities cockpit={cockpit} landscape={landscape} />
                  <RadarCompetitors cockpit={cockpit} landscape={landscape} />
                </div>
              </>
            )}
            {tab === 'position' && (
              <>
                {ops && <RadarCollectStats ops={ops} />}
                <div className={MASONRY}>
                  <RadarPositionDonut cockpit={cockpit} />
                  <RadarDistribution cockpit={cockpit} />
                  <RadarMatching cockpit={cockpit} />
                </div>
              </>
            )}
            {tab === 'concurrents' && (
              <div className={MASONRY}>
                <RadarBenchmark cockpit={cockpit} />
                <RadarCompetitorFlow history={history} sites={report?.sites ?? []} />
              </div>
            )}
            {tab === 'familles' && (
              <div className={MASONRY}>
                <RadarFamilies cockpit={cockpit} />
                <RadarHeatmap cockpit={cockpit} />
              </div>
            )}
            {tab === 'produits' && <RadarProducts products={report?.products ?? []} />}
            {tab === 'volume' && <RadarVolume ops={ops} />}
            {tab === 'couts' && <RadarCosts />}
            <RadarInstallHint />
          </>
        ) : (
          <RadarSkeleton />
        )}
      </main>

      <RadarMenu open={menuOpen} items={items} value={tab} onSelect={setTab} onClose={() => setMenuOpen(false)} />
    </div>
  )
}

/** Squelette pendant le chargement du rapport (watch sélectionné, rapport pas encore lu). */
function RadarSkeleton() {
  return (
    <div className="space-y-4">
      <div className="radar-card h-[220px] animate-pulse" style={{ opacity: 0.5 }} />
      <div className="grid grid-cols-2 gap-3">
        {[0, 1, 2, 3].map((i) => <div key={i} className="radar-card h-[92px] animate-pulse" style={{ opacity: 0.4 }} />)}
      </div>
      <div className="radar-card h-[180px] animate-pulse" style={{ opacity: 0.35 }} />
    </div>
  )
}
