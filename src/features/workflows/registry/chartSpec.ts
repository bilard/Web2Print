// Logique PARTAGÉE entre le node Graphique (rendu PNG offscreen) et l'aperçu éditeur
// (ChartPreview, react-chartjs-2) : agrégation des données + construction de la config
// Chart.js. Aucune dépendance à React ni à chart.js ici (juste des types/objets).

export type ChartType = 'bar' | 'line' | 'area' | 'pie' | 'doughnut'
type ChartAggregation = 'none' | 'sum' | 'avg' | 'count'

export interface ChartNodeConfig {
  chartType: ChartType
  /** Colonne d'axe X (clé ou libellé). */
  xColumn: string
  /** Colonnes de valeurs / séries (clés ou libellés séparés par des virgules). */
  valueColumns: string
  aggregation: ChartAggregation
  title: string
}

/** Spec sérialisable d'un graphe — sortie du node, consommée par l'aperçu ET le PNG. */
export interface ChartSpec {
  kind: 'chart'
  chartType: ChartType
  title: string
  labels: string[]
  datasets: { label: string; data: number[] }[]
}

interface ColumnLike {
  key: string
  label?: string
}

/** Palette d'accents (alignée sur l'accent app `#6366f1`). */
const CHART_PALETTE = [
  '#6366f1', '#22c55e', '#f59e0b', '#ef4444', '#06b6d4',
  '#a855f7', '#ec4899', '#84cc16', '#f97316', '#14b8a6',
]

/** Convertit une valeur de cellule en nombre (gère « 12,5 », « 1 299 € »…). */
function numberFrom(v: unknown): number {
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0
  const s = String(v ?? '').trim()
  if (!s) return 0
  const n = Number(s.replace(/\s/g, '').replace(',', '.').replace(/[^\d.+-]/g, ''))
  return Number.isFinite(n) ? n : 0
}

/** Résout un nom (clé OU libellé) vers la clé de colonne. Retourne le nom tel quel si absent. */
function resolveKey(columns: ColumnLike[], name: string): string {
  const t = name.trim()
  const hit = columns.find((c) => c.key === t || c.label === t)
  return hit ? hit.key : t
}

function labelFor(columns: ColumnLike[], key: string): string {
  return columns.find((c) => c.key === key)?.label ?? key
}

/** Agrège les lignes en `ChartSpec` selon la config (axe X + séries + agrégation). */
export function aggregateChartData(
  rows: Record<string, unknown>[],
  columns: ColumnLike[],
  config: ChartNodeConfig,
): ChartSpec {
  const xKey = resolveKey(columns, config.xColumn || '')
  const valueKeys = String(config.valueColumns || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((n) => resolveKey(columns, n))

  const agg = config.aggregation || 'none'
  let labels: string[] = []
  let datasets: { label: string; data: number[] }[] = []

  if (agg === 'none') {
    labels = rows.map((r) => String(r[xKey] ?? ''))
    if (valueKeys.length === 0) {
      datasets = [{ label: 'Valeur', data: rows.map(() => 0) }]
    } else {
      datasets = valueKeys.map((vk) => ({
        label: labelFor(columns, vk),
        data: rows.map((r) => numberFrom(r[vk])),
      }))
    }
  } else {
    // Regroupe par valeur d'axe X (ordre d'apparition).
    const order: string[] = []
    const groups = new Map<string, Record<string, unknown>[]>()
    for (const r of rows) {
      const k = String(r[xKey] ?? '')
      if (!groups.has(k)) { groups.set(k, []); order.push(k) }
      groups.get(k)!.push(r)
    }
    labels = order
    if (agg === 'count') {
      datasets = [{ label: 'Nombre', data: order.map((k) => groups.get(k)!.length) }]
    } else {
      datasets = valueKeys.map((vk) => ({
        label: labelFor(columns, vk),
        data: order.map((k) => {
          const g = groups.get(k)!
          const sum = g.reduce((acc, r) => acc + numberFrom(r[vk]), 0)
          return agg === 'avg' && g.length > 0 ? sum / g.length : sum
        }),
      }))
    }
  }

  return { kind: 'chart', chartType: config.chartType, title: config.title || '', labels, datasets }
}

/** Type-guard : la sortie d'un node est-elle un `ChartSpec` ? */
export function isChartSpec(v: unknown): v is ChartSpec {
  return (
    typeof v === 'object' && v !== null &&
    (v as ChartSpec).kind === 'chart' &&
    Array.isArray((v as ChartSpec).labels) &&
    Array.isArray((v as ChartSpec).datasets)
  )
}

/** Construit une config Chart.js depuis un `ChartSpec`. `responsive=false` pour le PNG. */
export function toChartJsConfig(
  spec: ChartSpec,
  opts: { responsive?: boolean } = {},
): { type: string; data: unknown; options: unknown } {
  const isPie = spec.chartType === 'pie' || spec.chartType === 'doughnut'
  const isArea = spec.chartType === 'area'
  const cjsType = isArea ? 'line' : spec.chartType

  const data = isPie
    ? {
        labels: spec.labels,
        datasets: [{
          label: spec.datasets[0]?.label ?? '',
          data: spec.datasets[0]?.data ?? [],
          backgroundColor: spec.labels.map((_, i) => CHART_PALETTE[i % CHART_PALETTE.length]),
          borderColor: '#1e1e2e',
          borderWidth: 1,
        }],
      }
    : {
        labels: spec.labels,
        datasets: spec.datasets.map((ds, i) => {
          const color = CHART_PALETTE[i % CHART_PALETTE.length]
          return {
            label: ds.label,
            data: ds.data,
            backgroundColor: isArea ? `${color}55` : color,
            borderColor: color,
            borderWidth: 2,
            fill: isArea,
            tension: isArea ? 0.3 : 0,
            pointRadius: cjsType === 'line' ? 2 : undefined,
          }
        }),
      }

  // Tronque les libellés d'axe X (noms produits longs → illisibles/superposés). Le
  // tooltip Chart.js garde le libellé complet. autoSkip évite l'empilement si trop de barres.
  const xTicks = {
    autoSkip: true,
    maxRotation: 0,
    callback(this: { getLabelForValue: (v: number) => string }, value: number) {
      const l = String(this.getLabelForValue(value))
      return l.length > 16 ? `${l.slice(0, 15)}…` : l
    },
  }
  const options = {
    responsive: opts.responsive ?? true,
    maintainAspectRatio: false,
    animation: false as const,
    plugins: {
      legend: { display: spec.datasets.length > 1 || isPie, position: isPie ? 'right' : 'bottom' },
      title: { display: !!spec.title, text: spec.title },
    },
    scales: isPie ? undefined : { x: { ticks: xTicks }, y: { beginAtZero: true } },
  }

  return { type: cjsType, data, options }
}
