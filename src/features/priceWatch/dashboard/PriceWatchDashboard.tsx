// src/features/priceWatch/dashboard/PriceWatchDashboard.tsx
// Cockpit BI de la veille tarifaire (dense, façon terminal). Tout est dérivé du rapport
// pré-agrégé via buildCockpit (pur). UN moteur de recherche global filtre les blocs
// dérivés (les KPIs headline restent globaux). SOURCE (watchId) choisie dans le header.
import { useMemo, useState } from 'react'
import { useCatalogReport, useReportHistory } from '../useCatalogReport'
import type { StoredReport } from '../reportStore'
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
import { OpsCockpit } from './OpsCockpit'
import { ScrapeSpendWidget } from './ScrapeSpendWidget'
import { CompetitorAuditModal } from './CompetitorAuditModal'
import { AnalyticsTable } from './AnalyticsTable'
import { ProductList } from './ProductList'
import { ExpandableChart } from '@/components/shared/ExpandableChart'
import { ChevronDown, RotateCcw } from 'lucide-react'
import { useLiveReportRefresh } from './useLiveReportRefresh'
import { SearchAutocomplete } from './SearchAutocomplete'
import { WorkflowConsole } from './WorkflowConsole'

/** Rapport « vide » : permet d'afficher le Cockpit opérationnel (jauges de moisson LIVE,
 *  alimentées par les métas concurrents) AVANT le premier « Comparer catalogue ».
 *  `runAt: 0` = aucune analyse encore (géré par OpsCockpit). */
const EMPTY_REPORT: StoredReport = {
  runAt: 0,
  kpis: {
    products: 0, matchedExact: 0, matchedOriginOnly: 0, sites: 0, comparisons: 0,
    cheaperThanMe: 0, aligned: 0, dearerThanMe: 0, ruptures: 0, productsUndercut: 0,
  },
  byCompetitor: [], sites: [], products: [], totalMatched: 0, truncated: false,
}

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
  // Pendant une moisson, recalcule périodiquement le rapport depuis l'index persisté :
  // les tuiles d'analyse (appariés, tenue prix…) bougent EN LIVE, sans attendre le
  // prochain run serveur (~30 min). Throttlé + onglet visible uniquement.
  useLiveReportRefresh(watchId, report)
  const [filter, setFilter] = useState<CockpitFilter>(EMPTY_FILTER)
  const ck = useMemo(() => (report ? buildCockpit(report, filter) : null), [report, filter])

  const [detailOpen, setDetailOpen] = useState(false)
  const [auditOpen, setAuditOpen] = useState(false)

  // Pas encore de comparatif : le Cockpit opérationnel s'affiche quand même (la moisson
  // vit dans les métas concurrents, indépendantes du rapport « Comparer »).
  if (!report || !ck) {
    return (
      <div className="space-y-3">
        {watchId && <OpsCockpit report={EMPTY_REPORT} watchId={watchId} />}
        {watchId && <WorkflowConsole watchId={watchId} />}
        <EmptyState hasWatch={!!watchId} />
      </div>
    )
  }
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
    <div className="space-y-3">
    {/* Cockpit opérationnel (pleine largeur, en tête) : où en est la collecte —
        volumétrie, temps, cycles, tokens, prochaine moisson. Distinct du BI prix. */}
    <OpsCockpit report={report} watchId={watchId} />
    {/* Console live du workflow : trafic + erreurs en couleur (le run serveur n'est
        plus une boîte noire — demande utilisateur). */}
    <WorkflowConsole watchId={watchId} />
    <div className="flex flex-col lg:flex-row gap-3" data-pw-section="comparison">
      {/* Colonne gauche : navigation par famille + liste des concurrents (Benchmark).
          Plus logique/lisible que le rail droit — la navigation (familles + concurrents)
          est regroupée à gauche, les données à droite (demande utilisateur). */}
      <div className="lg:w-96 shrink-0 space-y-3 lg:sticky lg:top-3 self-start">
        <CatalogTree ck={ck} active={filter.famille} onSelect={(f) => toggle({ famille: f })} />
        <CompetitorRanking ck={ck} onSelect={toggle} active={filter.competitor} onOpenAudit={() => setAuditOpen(true)}
          progressBySite={new Map(report.byCompetitor
            .filter((c) => c.harvest && c.audit.indexed > 0) // pas de barre si 0 fiche collectée (« complet » trompeur)
            .map((c) => [c.siteId, c.harvest!.progress]))} />
        <ScrapeSpendWidget />
      </div>
      <div className="flex-1 min-w-0 space-y-3">
      {report.truncated && (
        <div className="bg-amber-500/10 border border-amber-500/25 rounded-md px-3 py-2 text-xs text-amber-300">
          {report.totalMatched.toLocaleString('fr-FR')} produits appariés — le détail est borné aux 1000 les moins bien
          positionnés. Distributions/heatmap/scatter portent sur cet échantillon (l’exhaustif est dans l’export Excel).
        </div>
      )}

      {/* KPIs fixés en haut au scroll vertical (demande utilisateur). Fond opaque pour
          couvrir le contenu qui défile derrière. */}
      <div className="sticky top-0 z-30 bg-background py-3 -my-1 shadow-lg shadow-background/80">
        <KpiStrip ck={ck} history={history} />
      </div>

      {/* Moteur de recherche global (full-text + autocomplétion) : pilote tous les blocs dérivés. */}
      <div className="flex flex-wrap items-center gap-2 bg-surface rounded-lg px-3 py-2 border border-white/5">
        <SearchAutocomplete value={filter.q} onChange={(q) => set({ q })}
          onPickFamily={(famille) => setFilter((f) => ({ ...f, famille, q: '' }))}
          products={report.products} />
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
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 items-start">
        <ExpandableChart render={(h) => <PositionDonut kpis={report.kpis} onSelect={toggle} height={h ?? 300} />} />
        <ExpandableChart render={(h) => <GapDistribution ck={ck} onSelect={toggle} height={h ?? 300} />} />
      </div>
      {/* items-stretch : le scatter s'étire sur toute la hauteur de la heatmap voisine. */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 items-stretch">
        <ExpandableChart className="h-full" render={(h) => <PriceScatter ck={ck} onSelect={toggle} height={h} />} />
        <ExpandableChart className="h-full" render={() => <HeatmapMatrix ck={ck} onSelect={toggle} />} />
      </div>
      <ExpandableChart render={(h) => <CompetitorTrend history={history} sites={report.sites} height={h} />} />
      <OpportunityPanel ck={ck} />

      <AnalyticsTable ck={ck} searchQ={filter.q} onSearch={(q) => set({ q })}
        onPickFamily={(famille) => setFilter((f) => ({ ...f, famille, q: '' }))}
        products={report.products} />

      <section className="bg-surface rounded-lg">
        <button type="button" onClick={() => setDetailOpen((o) => !o)}
          className="w-full flex items-center gap-2 px-4 py-3 text-sm font-semibold text-white/70 hover:text-white">
          <ChevronDown className={`w-4 h-4 transition-transform ${detailOpen ? 'rotate-180' : ''}`} />
          Fiches détaillées par produit (prix, stock, liens concurrents)
        </button>
        {detailOpen && <div className="px-4 pb-4"><ProductList report={report} /></div>}
      </section>
      </div>
      {auditOpen && <CompetitorAuditModal stats={report.byCompetitor} onClose={() => setAuditOpen(false)} />}
    </div>
    </div>
  )
}
