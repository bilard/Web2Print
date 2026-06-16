// src/features/workflows/results/buildDashboard.ts
// Dashboard DÉTERMINISTE depuis une sheet : colonnes numériques → KPI + séries, 1re
// colonne catégorielle → axe X. Réutilise aggregateChartData (chartSpec.ts). Doit être
// bon en standalone — l'IA (Phase 2) remplira la même DashboardSpec pour affiner.
import { aggregateChartData, type ChartSpec } from '../registry/chartSpec'
import type { DashboardSpec, KpiCard } from './types'

interface SheetLike { columns?: { key: string; label?: string }[]; rows?: Record<string, unknown>[] }

const NUM_RE = /^-?\d+(?:[.,]\d+)?$/
const MAX_SERIES = 5
const MAX_BARS = 40

function toNum(v: unknown): number | null {
  const s = String(v ?? '').trim().replace(/\s/g, '')
  if (!NUM_RE.test(s)) return null
  const n = Number(s.replace(',', '.'))
  return Number.isFinite(n) ? n : null
}

function fmt(n: number): string {
  return n.toLocaleString('fr-FR', { maximumFractionDigits: 2 })
}

export function buildDashboard(sheet: SheetLike): DashboardSpec {
  const cols = sheet.columns ?? []
  const rows = sheet.rows ?? []
  const labelByKey: Record<string, string> = {}
  const numericKeys: string[] = []
  for (const c of cols) {
    labelByKey[c.key] = c.label ?? c.key
    const vals = rows.map((r) => r[c.key]).filter((v) => String(v ?? '').trim() !== '')
    if (vals.length === 0) continue
    const nums = vals.filter((v) => toNum(v) !== null)
    if (nums.length / vals.length >= 0.6) numericKeys.push(c.key)
  }
  const catKey = cols.map((c) => c.key).find((k) => !numericKeys.includes(k)) ?? cols[0]?.key ?? ''

  const kpis: KpiCard[] = [{ label: 'Lignes', value: fmt(rows.length) }]
  for (const k of numericKeys.slice(0, 4)) {
    const nums = rows.map((r) => toNum(r[k])).filter((n): n is number => n !== null)
    if (nums.length === 0) continue
    const sum = nums.reduce((a, b) => a + b, 0)
    kpis.push({
      label: `${labelByKey[k]} (moy.)`,
      value: fmt(sum / nums.length),
      sub: `min ${fmt(Math.min(...nums))} · max ${fmt(Math.max(...nums))}`,
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
