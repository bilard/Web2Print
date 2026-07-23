import { useEffect, useMemo, useState } from 'react'
import { Radar } from 'lucide-react'
import { useWatchList, useCatalogReport, useReportHistory, useCompetitorMeta } from '@/features/priceWatch/useCatalogReport'
import { buildCockpit, sparkSeries } from '@/features/priceWatch/dashboard/analytics'
import { buildOpsCockpit } from '@/features/priceWatch/dashboard/opsMetrics'
import { RadarHeader } from './RadarHeader'
import { RadarHero } from './RadarHero'
import { RadarKpiGrid } from './RadarKpiGrid'
import { RadarOpportunities } from './RadarOpportunities'
import { RadarCompetitors } from './RadarCompetitors'
import { RadarTabs } from './RadarTabs'
import { RadarVolume } from './RadarVolume'
import { RadarPositionDonut } from './RadarPositionDonut'
import { RadarDistribution } from './RadarDistribution'
import { RadarScatter } from './RadarScatter'
import { RadarMatching } from './RadarMatching'
import { RadarBenchmark } from './RadarBenchmark'
import { RadarCompetitorFlow } from './RadarCompetitorFlow'
import { RadarFamilies } from './RadarFamilies'
import { RadarHeatmap } from './RadarHeatmap'
import { RadarProducts } from './RadarProducts'
import { RadarCosts } from './RadarCosts'
import { RadarInstallHint } from './RadarInstallHint'
import { useOrientation } from './useOrientation'

type Tab = 'apercu' | 'position' | 'concurrents' | 'familles' | 'produits' | 'volume' | 'couts'
const TABS = [
  { value: 'apercu' as const, label: 'Aperçu' },
  { value: 'position' as const, label: 'Positionnement' },
  { value: 'concurrents' as const, label: 'Concurrents' },
  { value: 'familles' as const, label: 'Familles' },
  { value: 'produits' as const, label: 'Produits' },
  { value: 'volume' as const, label: 'Collecte' },
  { value: 'couts' as const, label: 'Coûts' },
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
  const landscape = useOrientation()

  if (watches.length === 0) {
    return <Centered title="Aucune veille" sub="Lance un workflow « Comparer catalogue » pour alimenter ta veille tarifaire, puis reviens ici." />
  }

  return (
    <div
      className="radar-root radar-noscroll min-h-[100dvh] overflow-y-auto"
      onScroll={(e) => setScrolled(e.currentTarget.scrollTop > 4)}
    >
      <RadarHeader watches={watches} value={watchId ?? ''} onChange={setWatchId} runAt={report?.runAt ?? null} scrolled={scrolled} />

      <main className="radar-safe-x radar-safe-bottom mx-auto max-w-lg space-y-4 pt-2 landscape:max-w-5xl">
        {cockpit ? (
          <>
            <RadarTabs options={TABS} value={tab} onChange={setTab} ariaLabel="Vues radarPrice" />
            {tab === 'apercu' && (
              <>
                <RadarHero cockpit={cockpit} holdSeries={hold} ops={ops} />
                <RadarKpiGrid cockpit={cockpit} />
                {/* Paysage : les deux listes passent côte à côte (2 colonnes). */}
                <div className="grid gap-4 landscape:grid-cols-2 landscape:items-start">
                  <RadarOpportunities cockpit={cockpit} landscape={landscape} />
                  <RadarCompetitors cockpit={cockpit} landscape={landscape} />
                </div>
              </>
            )}
            {tab === 'position' && (
              <div className={MASONRY}>
                <RadarPositionDonut cockpit={cockpit} />
                <RadarDistribution cockpit={cockpit} />
                <RadarScatter cockpit={cockpit} />
                <RadarMatching cockpit={cockpit} />
              </div>
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
