// src/features/workflows/results/classifyResult.ts
// Sélectionne et classe les sorties à visualiser pour un run. Un panneau par sortie
// TERMINALE ; si une sortie terminale est un « puits » (lien/fichier/json), on remonte
// d'un cran chercher la 1re donnée visualisable en amont (ex. la sheet du node compare
// derrière l'export Sheets) et on la place en tête.
import { isChartSpec } from '../registry/chartSpec'
import { nodeRegistry } from '../registry'
import { numericColumnKeys } from './columnTypes'
import type { Workflow } from '../types'
import type { ResultKind, ResultPanel } from './types'

const PORT_PRIORITY = ['chart', 'sheet', 'products', 'result', 'assets', 'file']
const VISUAL: ResultKind[] = ['dashboard', 'table', 'chart', 'gallery']

// Guards locaux (mêmes formes que l'aperçu éditeur) — gardés ici pour découpler la
// logique de résultat du gros arbre de composants de DataPreviewPanel.
function isSheet(v: unknown): boolean {
  return typeof v === 'object' && v !== null &&
    Array.isArray((v as { columns?: unknown }).columns) && Array.isArray((v as { rows?: unknown }).rows)
}
function isAssetArray(v: unknown): boolean {
  return Array.isArray(v) && v.length > 0 && typeof v[0] === 'object' && v[0] !== null &&
    ('url' in (v[0] as object) || 'src' in (v[0] as object))
}
function isExportResult(v: unknown): boolean {
  return typeof v === 'object' && v !== null &&
    typeof (v as { url?: unknown }).url === 'string' && typeof (v as { filename?: unknown }).filename === 'string'
}

function pickPrimaryOutput(outputs: Record<string, unknown>): { name: string; value: unknown } | null {
  const entries = Object.entries(outputs).filter(([, v]) => v !== null && v !== undefined)
  if (entries.length === 0) return null
  for (const key of PORT_PRIORITY) {
    const hit = entries.find(([n]) => n === key)
    if (hit) return { name: hit[0], value: hit[1] }
  }
  return { name: entries[0][0], value: entries[0][1] }
}

function hasNumericColumn(sheet: { columns?: { key: string; label?: string }[]; rows?: Record<string, unknown>[] }): boolean {
  const rows = sheet.rows ?? []
  if (rows.length === 0) return false
  return numericColumnKeys(sheet.columns ?? [], rows).length > 0
}

function classifyValue(value: unknown): ResultKind {
  if (isChartSpec(value)) return 'chart'
  if (isSheet(value)) {
    return hasNumericColumn(value as { columns?: { key: string; label?: string }[]; rows?: Record<string, unknown>[] }) ? 'dashboard' : 'table'
  }
  if (isAssetArray(value)) return 'gallery'
  if (isExportResult(value)) return 'document'
  return 'json'
}

function labelFor(wf: Workflow, id: string): string {
  const node = wf.nodes.find((n) => n.id === id)
  const spec = node ? nodeRegistry.get(node.type) : undefined
  return spec?.label ?? node?.type ?? id
}

function panelFor(wf: Workflow, id: string, outputs: Record<string, Record<string, unknown>>): ResultPanel | null {
  const o = outputs[id]
  if (!o) return null
  const primary = pickPrimaryOutput(o)
  if (!primary) return null
  return { nodeId: id, nodeLabel: labelFor(wf, id), portName: primary.name, kind: classifyValue(primary.value), value: primary.value }
}

/** BFS sur les edges entrants : 1re sortie visualisable en amont, non déjà retenue. */
function findUpstreamVisual(
  wf: Workflow, startId: string,
  outputs: Record<string, Record<string, unknown>>, seen: Set<string>,
): ResultPanel | null {
  const queue = wf.edges.filter((e) => e.target === startId).map((e) => e.source)
  const visited = new Set<string>()
  while (queue.length) {
    const id = queue.shift()!
    if (visited.has(id)) continue
    visited.add(id)
    const p = panelFor(wf, id, outputs)
    if (p && VISUAL.includes(p.kind) && !seen.has(p.nodeId)) return p
    for (const e of wf.edges.filter((e) => e.target === id)) queue.push(e.source)
  }
  return null
}

/** Construit la liste des panneaux à afficher pour un run (outputs par nodeId). */
export function buildResultPanels(
  wf: Workflow,
  outputs: Record<string, Record<string, unknown>>,
): ResultPanel[] {
  const withOutgoing = new Set(wf.edges.map((e) => e.source))
  let terminals = wf.nodes.filter((n) => !withOutgoing.has(n.id) && outputs[n.id]).map((n) => n.id)
  if (terminals.length === 0) terminals = wf.nodes.filter((n) => outputs[n.id]).map((n) => n.id)

  const panels: ResultPanel[] = []
  const seen = new Set<string>()
  const push = (p: ResultPanel | null) => {
    if (p && !seen.has(p.nodeId)) { seen.add(p.nodeId); panels.push(p) }
  }
  for (const id of terminals) {
    const p = panelFor(wf, id, outputs)
    if (!p) continue
    // Puits (lien/fichier/json) → remonter chercher une donnée visualisable, placée avant.
    if (!VISUAL.includes(p.kind)) push(findUpstreamVisual(wf, id, outputs, seen))
    push(p)
  }
  return panels
}
