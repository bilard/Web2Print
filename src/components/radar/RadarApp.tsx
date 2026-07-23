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
import { RadarInstallHint } from './RadarInstallHint'

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

  if (watches.length === 0) {
    return <Centered title="Aucune veille" sub="Lance un workflow « Comparer catalogue » pour alimenter ta veille tarifaire, puis reviens ici." />
  }

  return (
    <div
      className="radar-root radar-noscroll min-h-[100dvh] overflow-y-auto"
      onScroll={(e) => setScrolled(e.currentTarget.scrollTop > 4)}
    >
      <RadarHeader watches={watches} value={watchId ?? ''} onChange={setWatchId} runAt={report?.runAt ?? null} scrolled={scrolled} />

      <main className="radar-safe-x radar-safe-bottom mx-auto max-w-lg space-y-4 pt-2">
        {cockpit ? (
          <>
            <RadarHero cockpit={cockpit} holdSeries={hold} ops={ops} />
            <RadarKpiGrid cockpit={cockpit} />
            <RadarOpportunities cockpit={cockpit} />
            <RadarCompetitors cockpit={cockpit} />
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
