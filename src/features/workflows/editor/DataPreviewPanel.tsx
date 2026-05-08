// src/features/workflows/editor/DataPreviewPanel.tsx
import { useMemo } from 'react'
import { Table2, FileImage, FileText, Download, Eye, Loader2 } from 'lucide-react'
import { useRunContext } from '../runtime/runContext'
import { useWorkflowStore } from '../persistence/workflow.store'
import { nodeRegistry } from '../registry'
import type { NodeRunState, NodeStatus } from '../types'

interface SheetLike {
  name?: string
  columns?: { key: string; label?: string }[]
  rows?: Record<string, unknown>[]
}

interface AssetLike {
  url?: string
  src?: string
  name?: string
  type?: string
  mimeType?: string
}

interface ExportLike {
  url: string
  filename: string
  mime?: string
}

const PREVIEW_PORT_PRIORITY = ['sheet', 'products', 'result', 'assets', 'file']
const MAX_ROWS = 12
const MAX_COLS = 8
const MAX_ASSETS = 16

function isSheet(v: unknown): v is SheetLike {
  return (
    typeof v === 'object' &&
    v !== null &&
    Array.isArray((v as SheetLike).columns) &&
    Array.isArray((v as SheetLike).rows)
  )
}

function isAssetArray(v: unknown): v is AssetLike[] {
  return (
    Array.isArray(v) &&
    v.length > 0 &&
    typeof v[0] === 'object' &&
    v[0] !== null &&
    ('url' in (v[0] as object) || 'src' in (v[0] as object))
  )
}

function isExportResult(v: unknown): v is ExportLike {
  return (
    typeof v === 'object' &&
    v !== null &&
    typeof (v as ExportLike).url === 'string' &&
    typeof (v as ExportLike).filename === 'string'
  )
}

interface PreviewTarget {
  nodeId: string
  nodeLabel: string
  portName: string
  value: unknown
  status: NodeStatus
}

function pickPrimaryOutput(outputs: Record<string, unknown>): { name: string; value: unknown } | null {
  const entries = Object.entries(outputs).filter(([, v]) => v !== null && v !== undefined)
  if (entries.length === 0) return null
  for (const key of PREVIEW_PORT_PRIORITY) {
    const hit = entries.find(([n]) => n === key)
    if (hit) return { name: hit[0], value: hit[1] }
  }
  // Fallback: first non-empty
  return { name: entries[0][0], value: entries[0][1] }
}

function pickLatestPreview(
  states: Record<string, NodeRunState>,
  liveIds: Set<string>,
  nodeLabelFor: (id: string) => string,
): PreviewTarget | null {
  // Priority: a currently running node with partial outputs (live), otherwise
  // the most recently ended successful node. Both keep the preview "live"
  // — running nodes show whatever they've published, and the panel re-renders
  // automatically as Zustand state updates.
  let running: { state: NodeRunState; id: string; startedAt: number } | null = null
  let success: { state: NodeRunState; id: string; endedAt: number } | null = null
  for (const [id, st] of Object.entries(states)) {
    if (!liveIds.has(id)) continue
    if (st.status === 'running' && st.outputs) {
      const startedAt = st.startedAt ?? 0
      if (!running || startedAt > running.startedAt) running = { state: st, id, startedAt }
    } else if (st.status === 'success' && st.outputs) {
      const endedAt = st.endedAt ?? 0
      if (!success || endedAt > success.endedAt) success = { state: st, id, endedAt }
    }
  }
  const pick = running ?? success
  if (!pick || !pick.state.outputs) return null
  const primary = pickPrimaryOutput(pick.state.outputs)
  if (!primary) return null
  return {
    nodeId: pick.id,
    nodeLabel: nodeLabelFor(pick.id),
    portName: primary.name,
    value: primary.value,
    status: pick.state.status,
  }
}

function formatCell(v: unknown): string {
  if (v === null || v === undefined) return ''
  if (typeof v === 'string') return v
  if (typeof v === 'number' || typeof v === 'boolean') return String(v)
  try {
    return JSON.stringify(v)
  } catch {
    return String(v)
  }
}

function SheetPreview({ sheet }: { sheet: SheetLike }) {
  const cols = (sheet.columns ?? []).slice(0, MAX_COLS)
  const rows = (sheet.rows ?? []).slice(0, MAX_ROWS)
  const totalRows = sheet.rows?.length ?? 0
  const totalCols = sheet.columns?.length ?? 0

  if (cols.length === 0 || rows.length === 0) {
    return <EmptyState label="Sheet vide" />
  }
  return (
    <div className="space-y-2">
      <div className="text-[11px] text-neutral-500">
        {sheet.name ? <span className="text-neutral-300">{sheet.name}</span> : null}
        <span className="ml-2">
          {totalRows} ligne{totalRows > 1 ? 's' : ''} · {totalCols} colonne
          {totalCols > 1 ? 's' : ''}
          {totalRows > MAX_ROWS ? ` · aperçu ${MAX_ROWS} premières` : ''}
          {totalCols > MAX_COLS ? ` · ${MAX_COLS}/${totalCols} colonnes` : ''}
        </span>
      </div>
      <div className="rounded border border-neutral-800">
        <table className="text-xs w-full">
          <thead className="bg-[#161616] sticky top-0">
            <tr>
              {cols.map((c) => (
                <th
                  key={c.key}
                  className="text-left px-2 py-1.5 text-neutral-400 font-medium border-b border-neutral-800 whitespace-nowrap"
                >
                  {c.label ?? c.key}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={i} className="odd:bg-[#0f0f0f] even:bg-[#141414]">
                {cols.map((c) => (
                  <td
                    key={c.key}
                    className="px-2 py-1 text-neutral-300 border-b border-neutral-900 max-w-[200px] truncate"
                    title={formatCell(row[c.key])}
                  >
                    {formatCell(row[c.key])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function AssetGridPreview({ assets }: { assets: AssetLike[] }) {
  const items = assets.slice(0, MAX_ASSETS)
  return (
    <div className="space-y-2">
      <div className="text-[11px] text-neutral-500">
        {assets.length} asset{assets.length > 1 ? 's' : ''}
        {assets.length > MAX_ASSETS ? ` · aperçu ${MAX_ASSETS} premiers` : ''}
      </div>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(96px,1fr))] gap-2">
        {items.map((a, i) => {
          const url = a.url ?? a.src
          const isImg =
            (a.type === 'image' || (a.mimeType ?? '').startsWith('image/')) ||
            (typeof url === 'string' && /\.(png|jpe?g|gif|webp|svg)(\?|$)/i.test(url))
          return (
            <div
              key={i}
              className="aspect-square rounded border border-neutral-800 bg-[#161616] overflow-hidden flex items-center justify-center"
              title={a.name ?? url ?? ''}
            >
              {isImg && url ? (
                <img src={url} alt={a.name ?? ''} className="w-full h-full object-cover" />
              ) : (
                <div className="flex flex-col items-center gap-1 text-neutral-500 text-[10px] px-1 text-center">
                  <FileImage className="w-5 h-5" />
                  <span className="truncate max-w-full">{a.name ?? a.type ?? 'asset'}</span>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function ExportPreview({ payload }: { payload: ExportLike }) {
  return (
    <div className="flex items-center gap-3 p-3 rounded border border-neutral-800 bg-[#161616]">
      <div className="w-10 h-10 rounded bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-300">
        <FileText className="w-5 h-5" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm text-white truncate">{payload.filename}</div>
        {payload.mime ? <div className="text-[11px] text-neutral-500">{payload.mime}</div> : null}
      </div>
      <a
        href={payload.url}
        download={payload.filename}
        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/30 text-emerald-200 text-xs"
      >
        <Download className="w-3.5 h-3.5" />
        Télécharger
      </a>
    </div>
  )
}

function ProductsPreview({ value }: { value: unknown }) {
  const arr = Array.isArray(value)
    ? (value as Record<string, unknown>[])
    : Array.isArray((value as { products?: unknown[] })?.products)
      ? ((value as { products: Record<string, unknown>[] }).products)
      : null
  if (!arr || arr.length === 0) return <EmptyState label="Aucun produit" />
  // Reuse table renderer by synthesizing a sheet-like shape
  const keys = Array.from(
    arr.slice(0, 5).reduce<Set<string>>((acc, row) => {
      Object.keys(row).forEach((k) => acc.add(k))
      return acc
    }, new Set()),
  ).slice(0, MAX_COLS)
  return (
    <SheetPreview
      sheet={{
        name: `${arr.length} produit${arr.length > 1 ? 's' : ''}`,
        columns: keys.map((k) => ({ key: k })),
        rows: arr,
      }}
    />
  )
}

function JsonPreview({ value }: { value: unknown }) {
  let text: string
  try {
    text = JSON.stringify(value, null, 2)
  } catch {
    text = String(value)
  }
  return (
    <pre className="text-[11px] text-neutral-300 bg-[#0f0f0f] border border-neutral-800 rounded p-2">
      {text.slice(0, 4000)}
      {text.length > 4000 ? '\n…' : ''}
    </pre>
  )
}

function EmptyState({ label }: { label: string }) {
  return (
    <div className="text-xs text-neutral-500 italic px-2 py-3 text-center">
      {label}
    </div>
  )
}

function renderPreview(value: unknown) {
  if (isSheet(value)) return <SheetPreview sheet={value} />
  if (isAssetArray(value)) return <AssetGridPreview assets={value} />
  if (isExportResult(value)) return <ExportPreview payload={value} />
  if (Array.isArray(value)) return <ProductsPreview value={value} />
  if (
    typeof value === 'object' &&
    value !== null &&
    Array.isArray((value as { products?: unknown[] }).products)
  ) {
    return <ProductsPreview value={value} />
  }
  return <JsonPreview value={value} />
}

export function DataPreviewPanel() {
  const states = useRunContext((s) => s.nodeStates)
  const isRunning = useRunContext((s) => s.isRunning)
  const wf = useWorkflowStore((s) => s.current)

  const liveIds = useMemo(() => new Set((wf?.nodes ?? []).map((n) => n.id)), [wf])
  const labelFor = (id: string) => {
    const node = wf?.nodes.find((n) => n.id === id)
    const spec = node ? nodeRegistry.get(node.type) : undefined
    return spec?.label ?? node?.type ?? id
  }
  const target = useMemo(
    () => pickLatestPreview(states, liveIds, labelFor),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [states, wf],
  )

  return (
    <div className="border-t border-neutral-800 bg-[#0f0f0f] text-sm flex flex-col h-72 shrink-0">
      <div className="px-4 py-1.5 text-xs uppercase text-neutral-500 flex items-center gap-2 border-b border-neutral-900">
        {target?.status === 'running' || isRunning ? (
          <Loader2 className="w-3 h-3 text-indigo-400 animate-spin" />
        ) : (
          <Eye className="w-3 h-3" />
        )}
        <span>Aperçu données</span>
        {target ? (
          <span className="text-neutral-600 normal-case">
            · {target.nodeLabel}
            <span className="text-neutral-700"> → {target.portName}</span>
            {target.status === 'running' ? (
              <span className="ml-2 text-indigo-400">live</span>
            ) : null}
          </span>
        ) : null}
      </div>
      <div className="flex-1 min-h-0 overflow-auto px-4 py-2">
        {target ? (
          renderPreview(target.value)
        ) : (
          <div className="flex items-center gap-2 text-xs text-neutral-500 italic py-3">
            <Table2 className="w-3.5 h-3.5" />
            Lance le workflow pour voir l’aperçu du résultat ici.
          </div>
        )}
      </div>
    </div>
  )
}
