// src/features/priceWatch/dashboard/PriceWatchDashboard.tsx
// Cockpit BI de la veille tarifaire (dense, façon terminal). Tout est dérivé du rapport
// pré-agrégé (reportStore) via buildCockpit (pur). La SOURCE (watchId) est choisie en
// amont (menu du header) et passée en prop.
import { useMemo, useState } from 'react'
import { useCatalogReport, useReportHistory } from '../useCatalogReport'
import { buildCockpit } from './analytics'
import { KpiStrip } from './KpiStrip'
import { PositionDonut } from './PositionDonut'
import { GapDistribution } from './GapDistribution'
import { CompetitorRanking } from './CompetitorRanking'
import { HeatmapMatrix } from './HeatmapMatrix'
import { TrendChart } from './TrendChart'
import { AnalyticsTable } from './AnalyticsTable'
import { ProductList } from './ProductList'
import { ChevronDown } from 'lucide-react'

function EmptyState({ hasWatch }: { hasWatch: boolean }) {
  return (
    <div className="bg-surface rounded-lg p-8 text-center">
      <p className="text-sm text-white/60">
        {hasWatch
          ? 'Ce suivi n’a pas encore de comparatif. Lance le node « Comparer catalogue » du workflow pour peupler ce cockpit.'
          : 'Aucune veille tarifaire pour l’instant. Crée un workflow (moisson des concurrents puis « Comparer catalogue ») pour alimenter ce cockpit.'}
      </p>
    </div>
  )
}

export function PriceWatchDashboard({ watchId }: { watchId: string | null }) {
  const report = useCatalogReport(watchId)
  const history = useReportHistory(watchId)
  const ck = useMemo(() => (report ? buildCockpit(report) : null), [report])
  const [detailOpen, setDetailOpen] = useState(false)

  if (!report || !ck) return <EmptyState hasWatch={!!watchId} />

  return (
    <div className="space-y-3" data-pw-section="cockpit">
      {report.truncated && (
        <div className="bg-amber-500/10 border border-amber-500/25 rounded-md px-3 py-2 text-xs text-amber-300">
          {report.totalMatched.toLocaleString('fr-FR')} produits appariés — le détail est borné aux 1000 les moins bien
          positionnés. Les distributions/heatmap portent sur cet échantillon (l’exhaustif est dans l’export Excel du workflow).
        </div>
      )}

      <KpiStrip ck={ck} history={history} />

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-3">
        <div className="xl:col-span-3"><PositionDonut kpis={report.kpis} /></div>
        <div className="xl:col-span-5"><GapDistribution ck={ck} /></div>
        <div className="xl:col-span-4"><CompetitorRanking ck={ck} /></div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <div className="lg:col-span-2"><HeatmapMatrix ck={ck} /></div>
        <div className="lg:col-span-1"><TrendChart history={history} /></div>
      </div>

      <AnalyticsTable report={report} ck={ck} />

      <section className="bg-surface rounded-lg">
        <button type="button" onClick={() => setDetailOpen((o) => !o)}
          className="w-full flex items-center gap-2 px-4 py-3 text-sm font-semibold text-white/70 hover:text-white">
          <ChevronDown className={`w-4 h-4 transition-transform ${detailOpen ? 'rotate-180' : ''}`} />
          Fiches détaillées par produit (prix, stock, liens concurrents)
        </button>
        {detailOpen && <div className="px-4 pb-4"><ProductList report={report} /></div>}
      </section>
    </div>
  )
}
