// src/features/workflows/results/ResultPanelView.tsx
// Rend UN panneau de résultat selon son kind, en réutilisant les aperçus existants
// (SheetPreview / AssetGridPreview / ExportPreview / ChartPreview).
import { lazy, Suspense } from 'react'
import { BarChart3, Table2, Image as ImageIcon, FileText, Braces } from 'lucide-react'
import {
  SheetPreview, AssetGridPreview, ExportPreview,
  type SheetLike, type AssetLike, type ExportLike,
} from '../editor/DataPreviewPanel'
import { buildDashboard } from './buildDashboard'
import type { ChartSpec } from '../registry/chartSpec'
import type { ResultKind, ResultPanel } from './types'

const ChartPreview = lazy(() => import('../editor/ChartPreview'))

const KIND_META: Record<ResultKind, { label: string; Icon: typeof BarChart3 }> = {
  dashboard: { label: 'Tableau de bord', Icon: BarChart3 },
  table: { label: 'Tableau', Icon: Table2 },
  chart: { label: 'Graphique', Icon: BarChart3 },
  gallery: { label: 'Galerie', Icon: ImageIcon },
  document: { label: 'Document', Icon: FileText },
  json: { label: 'Données', Icon: Braces },
}

function ChartBox({ spec }: { spec: ChartSpec }) {
  return (
    <div className="h-72 rounded-lg border border-neutral-800 bg-surface p-3">
      <Suspense fallback={<div className="text-xs text-neutral-500">Chargement du graphe…</div>}>
        <ChartPreview spec={spec} />
      </Suspense>
    </div>
  )
}

function DashboardBody({ sheet }: { sheet: SheetLike }) {
  const dash = buildDashboard(sheet)
  return (
    <div className="space-y-4">
      {dash.kpis.length > 0 && (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-3">
          {dash.kpis.map((k, i) => (
            <div key={i} className="rounded-lg border border-neutral-800 bg-surface px-4 py-3">
              <div className="text-[11px] uppercase tracking-wider text-neutral-500 truncate">{k.label}</div>
              <div className="text-xl font-semibold text-white tabular-nums mt-0.5">{k.value}</div>
              {k.sub && <div className="text-[11px] text-neutral-600 mt-0.5 truncate">{k.sub}</div>}
            </div>
          ))}
        </div>
      )}
      {dash.charts.map((c, i) => <ChartBox key={i} spec={c} />)}
      <div className="rounded-lg border border-neutral-800 bg-surface p-2 max-h-[420px] overflow-hidden flex flex-col">
        <SheetPreview sheet={sheet} />
      </div>
    </div>
  )
}

function PanelBody({ panel }: { panel: ResultPanel }) {
  switch (panel.kind) {
    case 'dashboard':
      return <DashboardBody sheet={panel.value as SheetLike} />
    case 'table':
      return (
        <div className="rounded-lg border border-neutral-800 bg-surface p-2 max-h-[480px] overflow-hidden flex flex-col">
          <SheetPreview sheet={panel.value as SheetLike} />
        </div>
      )
    case 'chart':
      return <ChartBox spec={panel.value as ChartSpec} />
    case 'gallery':
      return <AssetGridPreview assets={panel.value as AssetLike[]} />
    case 'document':
      return <ExportPreview payload={panel.value as ExportLike} />
    default:
      return (
        <pre className="text-[11px] text-neutral-300 bg-surface border border-neutral-800 rounded-lg p-3 whitespace-pre-wrap break-words max-h-[420px] overflow-auto">
          {safeJson(panel.value)}
        </pre>
      )
  }
}

function safeJson(v: unknown): string {
  try { return JSON.stringify(v, null, 2).slice(0, 8000) } catch { return String(v) }
}

export function ResultPanelView({ panel }: { panel: ResultPanel }) {
  const meta = KIND_META[panel.kind]
  const { Icon } = meta
  return (
    <section className="rounded-xl border border-neutral-800 bg-background">
      <header className="flex items-center gap-2 px-4 py-2.5 border-b border-neutral-900">
        <Icon className="w-4 h-4 text-indigo-400" />
        <span className="text-sm font-medium text-white">{panel.nodeLabel}</span>
        <span className="text-[11px] text-neutral-600">→ {panel.portName}</span>
        <span className="ml-auto text-[10px] uppercase tracking-wider text-neutral-500 px-2 py-0.5 rounded-full border border-neutral-800">
          {meta.label}
        </span>
      </header>
      <div className="p-4">
        <PanelBody panel={panel} />
      </div>
    </section>
  )
}
