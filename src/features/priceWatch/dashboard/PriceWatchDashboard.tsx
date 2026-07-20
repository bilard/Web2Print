// src/features/priceWatch/dashboard/PriceWatchDashboard.tsx
// Orchestrateur du tableau de bord catalogue : sélecteur de suivi + KPIs + graphes +
// alertes + liste produit. Tout est lu depuis le rapport pré-agrégé (reportStore) via
// des hooks temps réel — jamais de lignes brutes chargées côté client.
import { useEffect, useState } from 'react'
import { useWatchList, useCatalogReport, useReportHistory } from '../useCatalogReport'
import { WatchSelector } from './WatchSelector'
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

export function PriceWatchDashboard() {
  const watches = useWatchList()
  const [watchId, setWatchId] = useState<string | null>(null)

  // Défaut : le suivi le plus récemment mis à jour (watches est déjà trié). Bascule
  // seulement si l'utilisateur n'a pas encore choisi, ou si son choix a disparu.
  useEffect(() => {
    if (watches.length === 0) { setWatchId(null); return }
    if (!watchId || !watches.some((w) => w.watchId === watchId)) setWatchId(watches[0].watchId)
  }, [watches, watchId])

  const report = useCatalogReport(watchId)
  const history = useReportHistory(watchId)

  return (
    <div className="space-y-5">
      {watches.length > 1 && (
        <div className="flex justify-end">
          <WatchSelector watches={watches} value={watchId ?? ''} onChange={setWatchId} />
        </div>
      )}

      {!report ? (
        <EmptyState hasWatch={watches.length > 0} />
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
