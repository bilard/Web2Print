// Node « Graphique » (type Power BI) : transforme une Sheet en graphe (barres,
// lignes, aire, camembert). Sorties : `chart` (spec d'aperçu interactif, cf.
// DataPreviewPanel), `assets` (1 PNG réutilisable Telegram/Drive/export) et `file`.
// Client-only : le rendu PNG passe par un <canvas> (cf. SERVER_UNSUPPORTED côté serveur).
import { BarChart3 } from 'lucide-react'
import { nodeRegistry } from './index'
import type { NodeSpec } from '../types'
import {
  aggregateChartData,
  toChartJsConfig,
  type ChartNodeConfig,
  type ChartSpec,
  type ChartType,
} from './chartSpec'

interface ColumnLike { key: string; label?: string }
interface SheetIn { columns?: ColumnLike[]; rows?: Record<string, unknown>[] }
interface ChartAsset { url: string; type: 'image'; name: string; mimeType: string; size: number; blob: Blob }
interface ChartOutputs { chart: ChartSpec; assets: ChartAsset[]; file: File }

const CHART_W = 900
const CHART_H = 540

/** Rend un ChartSpec en PNG via un canvas détaché (chart.js/auto, sans animation). */
async function renderChartPng(spec: ChartSpec): Promise<Blob> {
  const canvas = document.createElement('canvas')
  canvas.width = CHART_W
  canvas.height = CHART_H
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas 2D indisponible pour le rendu du graphe.')
  const { Chart } = await import('chart.js/auto')
  const { type, data, options } = toChartJsConfig(spec, { responsive: false })
  // Fond blanc (PNG opaque, lisible dans Telegram / Sheets).
  const bgPlugin = {
    id: 'whiteBg',
    beforeDraw(c: { ctx: CanvasRenderingContext2D; width: number; height: number }) {
      c.ctx.save()
      c.ctx.globalCompositeOperation = 'destination-over'
      c.ctx.fillStyle = '#ffffff'
      c.ctx.fillRect(0, 0, c.width, c.height)
      c.ctx.restore()
    },
  }
  const chart = new Chart(ctx, { type, data, options, plugins: [bgPlugin] } as any)
  chart.draw()
  const dataUrl = canvas.toDataURL('image/png')
  chart.destroy()
  const res = await fetch(dataUrl)
  return res.blob()
}

function ChartConfigUi({
  config,
  onChange,
  availableColumns = [],
}: {
  config: ChartNodeConfig
  onChange: (next: ChartNodeConfig) => void
  availableColumns?: string[]
}) {
  const selectedValues = String(config.valueColumns || '').split(',').map((s) => s.trim()).filter(Boolean)
  const toggleValue = (col: string) => {
    const set = new Set(selectedValues)
    if (set.has(col)) set.delete(col)
    else set.add(col)
    onChange({ ...config, valueColumns: Array.from(set).join(', ') })
  }
  const isCount = config.aggregation === 'count'
  return (
    <div className="space-y-3">
      <div>
        <label className="text-[10px] uppercase tracking-wider text-neutral-500 mb-1 block">Type de graphique</label>
        <select
          value={config.chartType}
          onChange={(e) => onChange({ ...config, chartType: e.target.value as ChartType })}
          className="w-full bg-background border border-neutral-700 rounded px-2 py-1.5 text-sm text-white outline-none focus:border-indigo-500"
        >
          <option value="bar">Barres</option>
          <option value="line">Lignes</option>
          <option value="area">Aire</option>
          <option value="pie">Camembert</option>
          <option value="doughnut">Anneau</option>
        </select>
      </div>

      <div>
        <label className="text-[10px] uppercase tracking-wider text-neutral-500 mb-1 block">Axe X (catégories)</label>
        <select
          value={config.xColumn}
          onChange={(e) => onChange({ ...config, xColumn: e.target.value })}
          className="w-full bg-background border border-neutral-700 rounded px-2 py-1.5 text-sm text-white outline-none focus:border-indigo-500"
        >
          <option value="">— choisir une colonne —</option>
          {availableColumns.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
      </div>

      <div>
        <label className="text-[10px] uppercase tracking-wider text-neutral-500 mb-1 block">Agrégation</label>
        <select
          value={config.aggregation}
          onChange={(e) => onChange({ ...config, aggregation: e.target.value as ChartNodeConfig['aggregation'] })}
          className="w-full bg-background border border-neutral-700 rounded px-2 py-1.5 text-sm text-white outline-none focus:border-indigo-500"
        >
          <option value="none">Aucune (une barre par ligne)</option>
          <option value="sum">Somme par catégorie</option>
          <option value="avg">Moyenne par catégorie</option>
          <option value="count">Nombre par catégorie</option>
        </select>
      </div>

      {!isCount && (
        <div>
          <label className="text-[10px] uppercase tracking-wider text-neutral-500 mb-1 block">
            Colonnes de valeurs (séries)
          </label>
          {availableColumns.length === 0 ? (
            <p className="text-[10px] text-neutral-600 italic">Lance le node amont pour voir les colonnes disponibles.</p>
          ) : (
            <div className="max-h-40 overflow-auto rounded border border-neutral-800 bg-background divide-y divide-neutral-900">
              {availableColumns.map((c) => (
                <label key={c} className="flex items-center gap-2 px-2 py-1 text-sm text-neutral-300 cursor-pointer hover:bg-white/[0.03]">
                  <input
                    type="checkbox"
                    checked={selectedValues.includes(c)}
                    onChange={() => toggleValue(c)}
                    className="accent-indigo-500"
                  />
                  <span className="truncate">{c}</span>
                </label>
              ))}
            </div>
          )}
        </div>
      )}

      <div>
        <label className="text-[10px] uppercase tracking-wider text-neutral-500 mb-1 block">Titre (optionnel)</label>
        <input
          type="text"
          value={config.title}
          onChange={(e) => onChange({ ...config, title: e.target.value })}
          className="w-full bg-background border border-neutral-700 rounded px-2 py-1.5 text-sm text-white outline-none focus:border-indigo-500"
          placeholder="Ex : Comparaison de prix"
        />
      </div>
    </div>
  )
}

const chartNode: NodeSpec<ChartNodeConfig, { sheet: SheetIn }, ChartOutputs> = {
  type: 'chart',
  category: 'transformation',
  labelKey: 'node.chart.label',
  descriptionKey: 'node.chart.desc',
  icon: BarChart3,
  inputs: [{ name: 'sheet', type: 'sheet', required: true }],
  outputs: [
    { name: 'chart', type: 'chart' },
    { name: 'assets', type: 'asset[]' },
    { name: 'file', type: 'file' },
  ],
  configSchema: [],
  defaultConfig: { chartType: 'bar', xColumn: '', valueColumns: '', aggregation: 'none', title: '' },
  runtime: 'client',
  ConfigComponent: ChartConfigUi,
  cardSummary: (c) => {
    const labels: Record<ChartType, string> = { bar: 'Barres', line: 'Lignes', area: 'Aire', pie: 'Camembert', doughnut: 'Anneau' }
    return c.xColumn ? `${labels[c.chartType]} · ${c.xColumn}` : labels[c.chartType]
  },
  run: async (ctx, config, inputs) => {
    const sheet = inputs.sheet
    const rows = sheet?.rows ?? []
    const columns = sheet?.columns ?? []
    if (rows.length === 0) throw new Error('Sheet vide en entrée — branche un node qui produit des données.')
    if (!config.xColumn) throw new Error("Choisis une colonne d'axe X dans la config du node.")

    const spec = aggregateChartData(rows, columns, config)
    if (spec.datasets.length === 0 || spec.datasets.every((d) => d.data.length === 0)) {
      throw new Error('Aucune série à tracer — sélectionne au moins une colonne de valeurs (ou l’agrégation « Nombre »).')
    }
    ctx.log('info', `Graphe ${config.chartType} : ${spec.labels.length} catégorie(s), ${spec.datasets.length} série(s).`)

    const blob = await renderChartPng(spec)
    const name = `graphique_${config.chartType}_${spec.labels.length}cat.png`
    const url = URL.createObjectURL(blob)
    const asset: ChartAsset = { url, type: 'image', name, mimeType: 'image/png', size: blob.size, blob }
    ctx.log('info', `PNG généré (${(blob.size / 1024).toFixed(1)} KB).`)
    return { chart: spec, assets: [asset], file: new File([blob], name, { type: 'image/png' }) }
  },
}

nodeRegistry.register(chartNode)
