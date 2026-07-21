// src/features/priceWatch/dashboard/PriceWatchDashboard.tsx
// Cockpit BI de la veille tarifaire (dense, façon terminal). Tout est dérivé du rapport
// pré-agrégé via buildCockpit (pur). UN moteur de recherche global filtre les blocs
// dérivés (les KPIs headline restent globaux). SOURCE (watchId) choisie dans le header.
import { useMemo, useState } from 'react'
import { useCatalogReport, useReportHistory } from '../useCatalogReport'
import { buildCockpit, EMPTY_FILTER, type CockpitFilter } from './analytics'
import { KpiStrip } from './KpiStrip'
import { PositionDonut } from './PositionDonut'
import { GapDistribution } from './GapDistribution'
import { CompetitorRanking } from './CompetitorRanking'
import { PriceScatter } from './PriceScatter'
import { HeatmapMatrix } from './HeatmapMatrix'
import { CompetitorTrend } from './CompetitorTrend'
import { OpportunityPanel } from './OpportunityPanel'
import { CatalogTree } from './CatalogTree'
import { AnalyticsTable } from './AnalyticsTable'
import { ProductList } from './ProductList'
import { ExpandableChart } from '@/components/shared/ExpandableChart'
import { ChevronDown, Search, RotateCcw } from 'lucide-react'

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

const selCls = 'bg-well text-white/80 text-xs rounded px-2 py-1.5 border border-white/10 focus:outline-none focus:border-white/25'

export function PriceWatchDashboard({ watchId }: { watchId: string | null }) {
  const report = useCatalogReport(watchId)
  const history = useReportHistory(watchId)
  const [filter, setFilter] = useState<CockpitFilter>(EMPTY_FILTER)
  const ck = useMemo(() => (report ? buildCockpit(report, filter) : null), [report, filter])

  const [detailOpen, setDetailOpen] = useState(false)

  if (!report || !ck) return <EmptyState hasWatch={!!watchId} />
  const set = (patch: Partial<CockpitFilter>) => setFilter((f) => ({ ...f, ...patch }))
  // Clic sur un graphe : bascule le filtre (re-cliquer la valeur active la désactive).
  const toggle = (patch: Partial<CockpitFilter>) => setFilter((f) => {
    const keys = Object.keys(patch) as (keyof CockpitFilter)[]
    const allMatch = keys.every((k) => f[k] === patch[k])
    const next = { ...f }
    for (const k of keys) next[k] = (allMatch ? EMPTY_FILTER[k] : patch[k]!) as never
    return next
  })

  return (
    <div className="flex flex-col lg:flex-row gap-3" data-pw-section="comparison">
      {/* Colonne gauche : navigation par famille + liste des concurrents (Benchmark).
          Plus logique/lisible que le rail droit — la navigation (familles + concurrents)
          est regroupée à gauche, les données à droite (demande utilisateur). */}
      <div className="lg:w-72 shrink-0 space-y-3 lg:sticky lg:top-3 self-start">
        <CatalogTree ck={ck} active={filter.famille} onSelect={(f) => set({ famille: f })} />
        <CompetitorRanking ck={ck} onSelect={toggle} active={filter.competitor} />
      </div>
      <div className="flex-1 min-w-0 space-y-3">
      {report.truncated && (
        <div className="bg-amber-500/10 border border-amber-500/25 rounded-md px-3 py-2 text-xs text-amber-300">
          {report.totalMatched.toLocaleString('fr-FR')} produits appariés — le détail est borné aux 1000 les moins bien
          positionnés. Distributions/heatmap/scatter portent sur cet échantillon (l’exhaustif est dans l’export Excel).
        </div>
      )}

      <KpiStrip ck={ck} history={history} />

      {/* Moteur de recherche global : pilote tous les blocs dérivés. */}
      <div className="flex flex-wrap items-center gap-2 bg-surface rounded-lg px-3 py-2 border border-white/5">
        <Search className="w-4 h-4 text-white/40" />
        <input value={filter.q} onChange={(e) => set({ q: e.target.value })} placeholder="Filtrer la donnée BI — réf, EAN, nom du produit…"
          className="bg-transparent text-white/85 text-sm flex-1 min-w-[180px] focus:outline-none placeholder:text-white/30" />
        <select value={filter.position} onChange={(e) => set({ position: e.target.value as CockpitFilter['position'] })} className={selCls}>
          <option value="all">Toutes positions</option>
          <option value="cheaper">Concurrent moins cher</option>
          <option value="aligned">Aligné</option>
          <option value="dearer">Je suis moins cher</option>
        </select>
        <select value={filter.famille} onChange={(e) => set({ famille: e.target.value })} className={selCls}>
          <option value="all">Toutes familles</option>
          {ck.familyKeys.map((f) => <option key={f} value={f}>{f}</option>)}
        </select>
        {ck.filterActive && (
          <>
            <span className="text-[11px] text-white/45 tabular-nums">{ck.filteredCount}/{ck.totalCount}</span>
            <button onClick={() => setFilter(EMPTY_FILTER)}
              className="flex items-center gap-1 text-xs text-indigo-300 hover:text-indigo-200 border border-indigo-400/30 rounded px-2 py-1.5">
              <RotateCcw className="w-3.5 h-3.5" /> Réinitialiser l’affichage
            </button>
          </>
        )}
      </div>
      {ck.filterActive && (
        <div className="text-[11px] text-white/40 -mt-1 px-1">
          Vue filtrée — les graphes et tableaux ci-dessous portent sur {ck.filteredCount} produit(s). Les KPIs de tête restent globaux.
        </div>
      )}

      {/* Graphes en pleine largeur (le Benchmark est passé à gauche). */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <ExpandableChart render={(h) => <PositionDonut kpis={report.kpis} onSelect={toggle} height={h} />} />
        <ExpandableChart render={(h) => <GapDistribution ck={ck} onSelect={toggle} height={h} />} />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <ExpandableChart render={(h) => <PriceScatter ck={ck} onSelect={toggle} height={h} />} />
        <ExpandableChart render={() => <HeatmapMatrix ck={ck} onSelect={toggle} />} />
      </div>
      <ExpandableChart render={(h) => <CompetitorTrend history={history} sites={report.sites} height={h} />} />
      <OpportunityPanel ck={ck} />

      <AnalyticsTable ck={ck} />

      <section className="bg-surface rounded-lg">
        <button type="button" onClick={() => setDetailOpen((o) => !o)}
          className="w-full flex items-center gap-2 px-4 py-3 text-sm font-semibold text-white/70 hover:text-white">
          <ChevronDown className={`w-4 h-4 transition-transform ${detailOpen ? 'rotate-180' : ''}`} />
          Fiches détaillées par produit (prix, stock, liens concurrents)
        </button>
        {detailOpen && <div className="px-4 pb-4"><ProductList report={report} /></div>}
      </section>
      </div>
    </div>
  )
}
