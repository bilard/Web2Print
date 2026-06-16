// src/features/workflows/results/types.ts
import type { ChartSpec } from '../registry/chartSpec'

/** Nature du résultat d'une sortie de node → pilote le rendu contextuel. */
export type ResultKind = 'dashboard' | 'table' | 'chart' | 'gallery' | 'document' | 'json'

/** Un panneau de résultat = une sortie d'un node (terminal ou donnée amont remontée). */
export interface ResultPanel {
  nodeId: string
  nodeLabel: string
  portName: string
  kind: ResultKind
  value: unknown
}

export interface KpiCard {
  label: string
  value: string
  sub?: string
}

/** Dashboard déterministe construit depuis une sheet (réutilise ChartSpec). */
export interface DashboardSpec {
  kpis: KpiCard[]
  charts: ChartSpec[]
}
