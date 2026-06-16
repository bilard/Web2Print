// src/features/workflows/results/buildDashboard.ts
// Dashboard DÉTERMINISTE depuis une sheet : colonnes numériques (hors identifiants) →
// KPI + séries, 1re colonne catégorielle → axe X. Réutilise aggregateChartData. Doit
// être bon en standalone — l'IA (regenerateViz) remplit la même DashboardSpec pour affiner.
import { aggregateChartData, type ChartSpec } from '../registry/chartSpec'
import { numericColumnKeys, categoricalKey, toNumber, formatNumber } from './columnTypes'
import type { DashboardSpec, KpiCard } from './types'

interface SheetLike { columns?: { key: string; label?: string }[]; rows?: Record<string, unknown>[] }

const MAX_SERIES = 5
const MAX_BARS = 40

export function buildDashboard(sheet: SheetLike): DashboardSpec {
  const cols = sheet.columns ?? []
  const rows = sheet.rows ?? []
  const labelByKey: Record<string, string> = {}
  cols.forEach((c) => { labelByKey[c.key] = c.label ?? c.key })
  const numericKeys = numericColumnKeys(cols, rows)
  const catKey = categoricalKey(cols, numericKeys)

  const kpis: KpiCard[] = [{ label: 'Lignes', value: formatNumber(rows.length) }]
  for (const k of numericKeys.slice(0, 4)) {
    const nums = rows.map((r) => toNumber(r[k])).filter((n): n is number => n !== null)
    if (nums.length === 0) continue
    const sum = nums.reduce((a, b) => a + b, 0)
    kpis.push({
      label: `${labelByKey[k]} (moy.)`,
      value: formatNumber(sum / nums.length),
      sub: `min ${formatNumber(Math.min(...nums))} · max ${formatNumber(Math.max(...nums))}`,
    })
  }

  const charts: ChartSpec[] = []
  if (catKey && numericKeys.length > 0) {
    const usedRows = rows.length > MAX_BARS ? rows.slice(0, MAX_BARS) : rows
    charts.push(aggregateChartData(usedRows, cols, {
      chartType: 'bar',
      xColumn: catKey,
      valueColumns: numericKeys.slice(0, MAX_SERIES).join(','),
      aggregation: 'none',
      title: rows.length > MAX_BARS ? `${MAX_BARS} premières lignes sur ${rows.length}` : '',
    }))
  }
  return { kpis, charts }
}
