// src/features/priceWatch/dashboard/PriceWatchDashboard.tsx
// Orchestrateur du tableau de bord catalogue : KPIs + graphes + alertes + liste produit.
// Tout est lu depuis le rapport pré-agrégé (reportStore) via des hooks temps réel —
// jamais de lignes brutes chargées côté client. La SOURCE (watchId) est choisie en amont
// (menu du header) et passée en prop.
import { useCatalogReport, useReportHistory } from '../useCatalogReport'
import { KpiCards } from './KpiCards'
import { PositionDonut } from './PositionDonut'
import { CompetitorBars } from './CompetitorBars'
import { TrendChart } from './TrendChart'
import { PositioningWarnings } from './PositioningWarnings'
import { ProductList } from './ProductList'

function EmptyState({ hasWatch }: { hasWatch: boolean }) {
  return (
    <div className="bg-surface rounded-lg p-8 text-center">
      <p className="text-sm text-white/60">
        {hasWatch
          ? 'Ce suivi n’a pas encore de comparatif. Lance le node « Comparer catalogue » du workflow pour peupler ce tableau de bord.'
          : 'Aucune veille tarifaire pour l’instant. Crée un workflow (moisson des concurrents puis « Comparer catalogue ») pour alimenter ce tableau de bord.'}
      </p>
    </div>
  )
}

export function PriceWatchDashboard({ watchId }: { watchId: string | null }) {
  const report = useCatalogReport(watchId)
  const history = useReportHistory(watchId)

  return (
    <div className="space-y-5">
      {!report ? (
        <EmptyState hasWatch={!!watchId} />
      ) : (
        <>
          <KpiCards report={report} history={history} />
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <PositionDonut kpis={report.kpis} />
            <div className="lg:col-span-2"><CompetitorBars stats={report.byCompetitor} /></div>
          </div>
          <TrendChart history={history} />
          <PositioningWarnings report={report} />
          <ProductList report={report} />
        </>
      )}
    </div>
  )
}
