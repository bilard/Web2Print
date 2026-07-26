// Phase 2 — « Régénérer avec l'IA » : à partir d'un échantillon de la sheet + le contexte
// (nom du node/workflow), un LLM compose un dashboard pertinent (colonnes, types de
// graphes, KPI) + des insights en français. Coût : uniquement au clic (hybride).
// Renvoie des CONFIGS de graphe (axe X / séries / type / agrégation) que le constructeur
// de l'écran adopte — l'utilisateur peut ensuite ajuster les champs comme dans le node.
import { z } from 'zod'
import { generateJson } from '@/features/ai/llmRouter'
import type { ChartType } from '../registry/chartSpec'
import { isIdentifierColumn, numericColumnKeys, toNumber, formatNumber } from './columnTypes'
import type { KpiCard } from './types'

interface ColumnLike { key: string; label?: string }
interface SheetLike { columns?: ColumnLike[]; rows?: Record<string, unknown>[] }

export type ChartAggregation = 'none' | 'sum' | 'avg' | 'count'

/** Config d'un graphe (clés de colonnes résolues) — pilote le constructeur de l'écran. */
interface DashChartConfig {
  type: ChartType
  xColumn: string
  valueColumns: string[]
  aggregation: ChartAggregation
  title: string
}

export interface AiDashboard {
  title?: string
  insights: string[]
  kpis: KpiCard[]
  charts: DashChartConfig[]
}

const CHART_TYPES = ['bar', 'line', 'area', 'pie', 'doughnut'] as const
const AGGS = ['none', 'sum', 'avg', 'count'] as const
const KPI_AGGS = ['sum', 'avg', 'min', 'max', 'count'] as const

const schema = z.object({
  title: z.string().optional(),
  insights: z.array(z.string()).default([]),
  kpis: z.array(z.object({
    label: z.string(),
    column: z.string(),
    agg: z.enum(KPI_AGGS),
  })).default([]),
  charts: z.array(z.object({
    type: z.enum(CHART_TYPES),
    xColumn: z.string(),
    valueColumns: z.array(z.string()).default([]),
    aggregation: z.enum(AGGS).default('none'),
    title: z.string().default(''),
  })).default([]),
})
type AiSpec = z.infer<typeof schema>

const schemaForLLM = {
  type: 'object',
  properties: {
    title: { type: 'string' },
    insights: { type: 'array', items: { type: 'string' } },
    kpis: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          label: { type: 'string' },
          column: { type: 'string' },
          agg: { type: 'string', enum: [...KPI_AGGS] },
        },
        required: ['label', 'column', 'agg'],
      },
    },
    charts: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          type: { type: 'string', enum: [...CHART_TYPES] },
          xColumn: { type: 'string' },
          valueColumns: { type: 'array', items: { type: 'string' } },
          aggregation: { type: 'string', enum: [...AGGS] },
          title: { type: 'string' },
        },
        required: ['type', 'xColumn', 'valueColumns', 'aggregation'],
      },
    },
  },
  required: ['insights', 'kpis', 'charts'],
}

/** Décrit chaque colonne pour le LLM : type détecté + 3 exemples. */
function describeColumns(cols: ColumnLike[], rows: Record<string, unknown>[]): string {
  const numeric = new Set(numericColumnKeys(cols, rows))
  return cols.map((c) => {
    const samples = rows.map((r) => r[c.key]).filter((v) => String(v ?? '').trim() !== '').slice(0, 3)
    const kind = isIdentifierColumn(c.key, c.label) ? 'identifiant' : numeric.has(c.key) ? 'numérique' : 'texte'
    return `- "${c.label ?? c.key}" (clé: ${c.key}, type: ${kind}) ex: ${samples.map((s) => JSON.stringify(s)).join(', ') || '—'}`
  }).join('\n')
}

function aggregate(nums: number[], agg: string): number {
  if (nums.length === 0) return 0
  const sum = nums.reduce((a, b) => a + b, 0)
  switch (agg) {
    case 'avg': return sum / nums.length
    case 'min': return Math.min(...nums)
    case 'max': return Math.max(...nums)
    default: return sum
  }
}

/** Résout la spec IA : KPI calculés sur les données + configs de graphe (clés valides). */
function resolveSpec(spec: AiSpec, sheet: SheetLike): { kpis: KpiCard[]; charts: DashChartConfig[] } {
  const cols = sheet.columns ?? []
  const rows = sheet.rows ?? []
  const keys = new Set(cols.map((c) => c.key))
  const labelToKey = new Map(cols.map((c) => [c.label ?? c.key, c.key]))
  const resolveKey = (name: string) => (keys.has(name) ? name : labelToKey.get(name) ?? name)

  const kpis: KpiCard[] = [{ label: 'Lignes', value: formatNumber(rows.length) }]
  for (const k of spec.kpis.slice(0, 5)) {
    const key = resolveKey(k.column)
    if (!keys.has(key)) continue
    if (k.agg === 'count') {
      kpis.push({ label: k.label, value: formatNumber(rows.filter((r) => String(r[key] ?? '').trim() !== '').length) })
      continue
    }
    const nums = rows.map((r) => toNumber(r[key])).filter((n): n is number => n !== null)
    if (nums.length === 0) continue
    kpis.push({ label: k.label, value: formatNumber(aggregate(nums, k.agg)) })
  }

  const charts: DashChartConfig[] = []
  for (const c of spec.charts.slice(0, 4)) {
    const xColumn = resolveKey(c.xColumn)
    const valueColumns = c.valueColumns.map(resolveKey).filter((k) => keys.has(k))
    if (!keys.has(xColumn)) continue
    charts.push({ type: c.type as ChartType, xColumn, valueColumns, aggregation: c.aggregation as ChartAggregation, title: c.title || '' })
  }
  return { kpis, charts }
}

/** Appelle le LLM pour composer un dashboard contextuel + insights. */
export async function regenerateDashboard(sheet: SheetLike, hint: string): Promise<AiDashboard> {
  const cols = sheet.columns ?? []
  const rows = sheet.rows ?? []
  if (cols.length === 0 || rows.length === 0) throw new Error('Données insuffisantes pour régénérer.')

  const prompt = [
    `Tu composes un tableau de bord pour visualiser le résultat d'un workflow : « ${hint} ».`,
    `Le jeu de données a ${rows.length} ligne(s). Colonnes :`,
    describeColumns(cols, rows),
    '',
    'Règles :',
    "- N'utilise JAMAIS une colonne de type « identifiant » (EAN/SKU/réf) comme valeur ou comme KPI numérique.",
    "- Axe X = une colonne « texte » pertinente (ex. nom du produit) ; séries = colonnes « numériques ».",
    '- Choisis des types de graphes adaptés (barres pour comparer, lignes pour une évolution, camembert pour une répartition).',
    '- Propose 1 à 3 KPI utiles et 1 à 3 graphes maximum.',
    "- Rédige 1 à 3 « insights » courts en FRANÇAIS : faits saillants, écarts, valeurs extrêmes (pas de généralités).",
    'Réponds uniquement via le schéma fourni.',
  ].join('\n')

  const spec = await generateJson<AiSpec>({
    task: 'workflow.resultViz',
    version: 'v1',
    prompt,
    schema,
    schemaForLLM,
  })
  const resolved = resolveSpec(spec, sheet)
  return { title: spec.title, insights: spec.insights.slice(0, 3), kpis: resolved.kpis, charts: resolved.charts }
}
