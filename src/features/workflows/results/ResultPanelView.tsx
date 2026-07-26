// Rend UN panneau de résultat selon son kind, en réutilisant les aperçus existants
// (SheetPreview / AssetGridPreview / ExportPreview / ChartPreview). Le dashboard offre
// le choix du type de graphe + « Régénérer avec l'IA » (insights + dashboard composé).
import { lazy, Suspense, useEffect, useMemo, useState } from 'react'
import { BarChart3, Table2, Image as ImageIcon, FileText, Braces, Sparkles, Loader2, RotateCcw } from 'lucide-react'
import {
  SheetPreview, AssetGridPreview, ExportPreview,
  type SheetLike, type AssetLike, type ExportLike,
} from '../editor/DataPreviewPanel'
import { buildDashboard } from './buildDashboard'
import { numericColumnKeys, categoricalKey } from './columnTypes'
import { regenerateDashboard, type AiDashboard, type ChartAggregation } from './regenerateViz'
import { aggregateChartData, type ChartSpec, type ChartType } from '../registry/chartSpec'
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

const TYPE_OPTIONS: { value: ChartType; label: string }[] = [
  { value: 'bar', label: 'Barres' },
  { value: 'line', label: 'Lignes' },
  { value: 'area', label: 'Aire' },
  { value: 'pie', label: 'Camembert' },
  { value: 'doughnut', label: 'Anneau' },
]

/** Graphe avec choix du type + des champs (séries) affichés. Réinit si la spec change. */
function ChartBox({ spec }: { spec: ChartSpec }) {
  const [type, setType] = useState<ChartType>(spec.chartType)
  const [hidden, setHidden] = useState<Set<string>>(new Set())
  useEffect(() => { setType(spec.chartType); setHidden(new Set()) }, [spec])

  const allLabels = spec.datasets.map((d) => d.label)
  const toggle = (label: string) => {
    setHidden((prev) => {
      const next = new Set(prev)
      if (next.has(label)) next.delete(label)
      else next.add(label)
      return next
    })
  }
  const datasets = spec.datasets.filter((d) => !hidden.has(d.label))
  const shown: ChartSpec = { ...spec, chartType: type, datasets: datasets.length ? datasets : spec.datasets }

  return (
    <div className="rounded-lg border border-neutral-800 bg-surface p-3">
      <div className="flex items-center gap-2 flex-wrap mb-2">
        {allLabels.length > 1 && allLabels.map((l) => {
          const on = !hidden.has(l)
          return (
            <button
              key={l}
              onClick={() => toggle(l)}
              className={`px-2 py-0.5 rounded-full text-[11px] border transition-colors ${
                on
                  ? 'border-indigo-500/40 bg-indigo-500/15 text-indigo-100'
                  : 'border-neutral-800 bg-well text-neutral-500 line-through'
              }`}
              title={on ? 'Masquer cette série' : 'Afficher cette série'}
            >
              {l}
            </button>
          )
        })}
        <select
          value={type}
          onChange={(e) => setType(e.target.value as ChartType)}
          className="ml-auto text-[11px] bg-well border border-neutral-800 rounded px-1.5 py-0.5 text-neutral-300 outline-none focus:border-indigo-500"
          title="Type de graphique"
        >
          {TYPE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </div>
      <div className="h-[460px] flex flex-col min-h-0">
        <Suspense fallback={<div className="text-xs text-neutral-500">Chargement du graphe…</div>}>
          <ChartPreview spec={shown} />
        </Suspense>
      </div>
    </div>
  )
}

function KpiGrid({ kpis }: { kpis: { label: string; value: string; sub?: string }[] }) {
  if (kpis.length === 0) return null
  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-3">
      {kpis.map((k, i) => (
        <div key={i} className="rounded-lg border border-neutral-800 bg-surface px-4 py-3">
          <div className="text-[11px] uppercase tracking-wider text-neutral-500 truncate">{k.label}</div>
          <div className="text-xl font-semibold text-white tabular-nums mt-0.5">{k.value}</div>
          {k.sub && <div className="text-[11px] text-neutral-600 mt-0.5 truncate">{k.sub}</div>}
        </div>
      ))}
    </div>
  )
}

const AGG_OPTIONS: { value: ChartAggregation; label: string }[] = [
  { value: 'none', label: 'Aucune' },
  { value: 'sum', label: 'Somme / catégorie' },
  { value: 'avg', label: 'Moyenne / catégorie' },
  { value: 'count', label: 'Nombre / catégorie' },
]

/** Constructeur de graphe (axe X + agrégation + choix des champs/séries + type) — même
 *  jeu de réglages que la carte « Graphique » du node, appliqué au résultat. */
function DashboardBody({ sheet, hint }: { sheet: SheetLike; hint: string }) {
  const cols = useMemo(() => sheet.columns ?? [], [sheet])
  const rows = useMemo(() => sheet.rows ?? [], [sheet])
  const numericKeys = useMemo(() => numericColumnKeys(cols, rows), [cols, rows])
  const defaultKpis = useMemo(() => buildDashboard(sheet).kpis, [sheet])

  const [type, setType] = useState<ChartType>('bar')
  const [xCol, setXCol] = useState('')
  const [agg, setAgg] = useState<ChartAggregation>('none')
  const [series, setSeries] = useState<Set<string>>(new Set())
  const [ai, setAi] = useState<AiDashboard | null>(null)
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  // (Ré)initialise le constructeur quand la sheet change (nouveau run / régénération).
  useEffect(() => {
    setXCol(categoricalKey(cols, numericKeys))
    setSeries(new Set(numericKeys.slice(0, 5)))
    setType('bar'); setAgg('none'); setAi(null); setErr(null)
  }, [cols, numericKeys])

  const toggleSeries = (key: string) => setSeries((prev) => {
    const n = new Set(prev)
    if (n.has(key)) n.delete(key); else n.add(key)
    return n
  })

  const spec = useMemo(() => aggregateChartData(rows, cols, {
    chartType: type, xColumn: xCol, valueColumns: [...series].join(','), aggregation: agg, title: '',
  }), [rows, cols, type, xCol, agg, series])

  const kpis = ai?.kpis ?? defaultKpis

  const regen = async () => {
    setLoading(true); setErr(null)
    try {
      const r = await regenerateDashboard(sheet, hint)
      setAi(r)
      const c = r.charts[0]
      if (c) {
        setType(c.type); setXCol(c.xColumn); setAgg(c.aggregation)
        if (c.valueColumns.length) setSeries(new Set(c.valueColumns))
      }
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)) }
    finally { setLoading(false) }
  }

  const selectCls = 'text-[11px] bg-well border border-neutral-800 rounded px-1.5 py-1 text-neutral-300 outline-none focus:border-indigo-500'

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 flex-wrap">
        <button
          onClick={() => void regen()}
          disabled={loading}
          className="px-3 py-1.5 rounded bg-indigo-500/15 hover:bg-indigo-500/25 border border-indigo-500/40 text-indigo-200 flex items-center gap-2 text-sm disabled:opacity-50"
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />} Régénérer avec l'IA
        </button>
        {ai && (
          <button onClick={() => setAi(null)} className="px-2.5 py-1.5 rounded bg-white/[0.06] hover:bg-white/[0.1] text-white/70 flex items-center gap-2 text-sm">
            <RotateCcw className="w-3.5 h-3.5" /> KPI par défaut
          </button>
        )}
        {err && <span className="text-[11px] text-amber-300/90">{err}</span>}
      </div>

      {ai?.insights?.length ? (
        <ul className="space-y-1.5 rounded-lg border border-indigo-500/30 bg-indigo-500/5 p-3 text-sm text-neutral-200">
          {ai.insights.map((s, i) => (
            <li key={i} className="flex gap-2">
              <Sparkles className="w-3.5 h-3.5 text-indigo-400 mt-0.5 shrink-0" /> <span>{s}</span>
            </li>
          ))}
        </ul>
      ) : null}

      <KpiGrid kpis={kpis} />

      <div className="rounded-lg border border-neutral-800 bg-surface p-3 space-y-3">
        <div className="flex items-center gap-3 flex-wrap">
          <label className="flex items-center gap-1.5 text-[11px] text-neutral-500">
            Axe X
            <select value={xCol} onChange={(e) => setXCol(e.target.value)} className={selectCls}>
              {cols.map((c) => <option key={c.key} value={c.key}>{c.label ?? c.key}</option>)}
            </select>
          </label>
          <label className="flex items-center gap-1.5 text-[11px] text-neutral-500">
            Agrégation
            <select value={agg} onChange={(e) => setAgg(e.target.value as ChartAggregation)} className={selectCls}>
              {AGG_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </label>
          <select value={type} onChange={(e) => setType(e.target.value as ChartType)} className={`ml-auto ${selectCls}`} title="Type de graphique">
            {TYPE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>

        <div>
          <div className="text-[10px] uppercase tracking-wider text-neutral-500 mb-1.5">Champs (séries)</div>
          <div className="flex flex-wrap gap-1.5">
            {cols.map((c) => {
              const on = series.has(c.key)
              return (
                <button
                  key={c.key}
                  onClick={() => toggleSeries(c.key)}
                  className={`px-2 py-0.5 rounded-full text-[11px] border transition-colors ${
                    on ? 'border-indigo-500/40 bg-indigo-500/15 text-indigo-100' : 'border-neutral-800 bg-well text-neutral-500'
                  }`}
                  title={on ? 'Retirer cette série' : 'Ajouter cette série'}
                >
                  {c.label ?? c.key}
                </button>
              )
            })}
          </div>
        </div>

        <div className="h-[460px] flex flex-col min-h-0">
          <Suspense fallback={<div className="text-xs text-neutral-500">Chargement du graphe…</div>}>
            <ChartPreview spec={spec} />
          </Suspense>
        </div>
      </div>

      <div className="rounded-lg border border-neutral-800 bg-surface p-2 max-h-[420px] overflow-hidden flex flex-col">
        <SheetPreview sheet={sheet} />
      </div>
    </div>
  )
}

function PanelBody({ panel, hint }: { panel: ResultPanel; hint: string }) {
  switch (panel.kind) {
    case 'dashboard':
      return <DashboardBody sheet={panel.value as SheetLike} hint={hint} />
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

export function ResultPanelView({ panel, contextHint }: { panel: ResultPanel; contextHint?: string }) {
  const meta = KIND_META[panel.kind]
  const { Icon } = meta
  const hint = [contextHint, panel.nodeLabel].filter(Boolean).join(' — ')
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
        <PanelBody panel={panel} hint={hint} />
      </div>
    </section>
  )
}
