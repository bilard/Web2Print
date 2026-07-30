import { useEffect, useMemo, useState } from 'react'
import { Search, Loader2, Braces, Copy, Check, ChevronLeft, ChevronRight } from 'lucide-react'
import { CloseButton } from '@/components/shared/CloseButton'
import type { TableSchema } from './firestoreSchema'
import { useTableData, type TableRow } from './useTableData'
import { formatCell, prettyValue } from './formatValue'
import { ValueViewer } from './ValueViewer'
import { t } from '@/lib/i18n'

/** Panneau bas : données LIVE de la table. Pour les BDD (flattenSheets), un sélecteur
 *  permet de choisir la base ; ses colonnes & lignes propres s'affichent. */
export function TableDataPanel({ table, onClose, rightInset = 0 }: { table: TableSchema; onClose: () => void; rightInset?: number }) {
  const { rows, loading, error, live, sheets } = useTableData(table.query ?? null)
  const isFlat = Boolean(table.query?.flattenSheets)
  const [sheetIdx, setSheetIdx] = useState(0)
  const [filter, setFilter] = useState('')
  const [detail, setDetail] = useState<{ col: string; value: unknown } | null>(null)
  const [copied, setCopied] = useState(false)
  const pkField = table.fields.find((f) => f.pk)?.name

  useEffect(() => { setSheetIdx(0); setFilter('') }, [table.id])

  const activeSheet = isFlat && sheets.length ? sheets[Math.min(sheetIdx, sheets.length - 1)] : null

  // Lignes affichées + en-têtes de colonnes (clé interne + libellé lisible).
  const { dataRows, columns, labelByCol } = useMemo(() => {
    if (isFlat) {
      const cols = activeSheet?.columns.map((c) => c.key) ?? []
      const labels: Record<string, string> = {}
      activeSheet?.columns.forEach((c) => { labels[c.key] = c.label || c.key })
      const rowsOut: TableRow[] = (activeSheet?.rows ?? []).map((r, i) => ({ _docId: `${activeSheet?.name}:${i}`, ...r }))
      return { dataRows: rowsOut, columns: cols, labelByCol: labels }
    }
    const cols: string[] = []
    const seen = new Set<string>()
    const push = (k: string) => { if (!seen.has(k) && k !== '_docId') { seen.add(k); cols.push(k) } }
    table.fields.forEach((f) => push(f.name))
    if (!seen.has('id')) push('id')
    rows.forEach((r) => Object.keys(r).forEach(push))
    return { dataRows: rows, columns: cols, labelByCol: {} as Record<string, string> }
  }, [isFlat, activeSheet, table, rows])

  const cellValue = (r: TableRow, c: string): unknown => {
    if (isFlat) return r[c]
    if (c === 'id') return r._docId
    if (c === pkField && r[c] == null) return r._docId
    return r[c]
  }

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase()
    if (!q) return dataRows
    return dataRows.filter((r) => columns.some((c) => formatCell(c, cellValue(r, c)).toLowerCase().includes(q)))
  }, [dataRows, columns, filter])

  // Pagination (le scroll infini est ingérable sur les grosses bases).
  const PAGE_SIZE = 50
  const [page, setPage] = useState(0)
  useEffect(() => { setPage(0) }, [filter, sheetIdx, table.id])
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const safePage = Math.min(page, pageCount - 1)
  const pageRows = useMemo(() => filtered.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE), [filtered, safePage])
  const firstRow = filtered.length === 0 ? 0 : safePage * PAGE_SIZE + 1
  const lastRow = Math.min(filtered.length, (safePage + 1) * PAGE_SIZE)

  const copyDetail = async () => {
    if (!detail) return
    try { await navigator.clipboard.writeText(prettyValue(detail.value)); setCopied(true); setTimeout(() => setCopied(false), 1500) } catch { /* clipboard indispo */ }
  }

  return (
    <div style={{ right: rightInset }} className="absolute bottom-0 left-0 z-10 flex h-[50%] min-h-[240px] flex-col border-t-2 border-indigo-500/60 bg-well shadow-[0_-12px_30px_rgba(0,0,0,0.4)]">
      <div className="flex shrink-0 items-center gap-3 border-b border-white/10 px-4 py-2.5">
        <span className="rounded-md bg-indigo-500 px-1.5 py-0.5 text-[10px] font-bold tracking-wide text-[#fff]">TABLE</span>
        <span className="font-mono text-[13px] font-semibold text-white">{table.label}</span>
        <span className="text-[11px] text-white/40">({filtered.length} enregistrement{filtered.length > 1 ? 's' : ''})</span>
        {!error && (live ? (
          <span className="flex items-center gap-1 text-[10px] font-semibold text-emerald-400">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" /> LIVE
          </span>
        ) : (
          <span className="text-[10px] font-semibold text-white/35">{t('dg.snapshot')}</span>
        ))}
        <div className="relative ml-auto w-72 max-w-[40%]">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-white/30" />
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder={t('dg.filterResults')}
            className="w-full rounded-lg border border-white/10 bg-surface py-1.5 pl-8 pr-3 text-[12px] text-white placeholder:text-white/30 focus:border-indigo-400/50 focus:outline-none"
          />
        </div>
        <CloseButton onClick={onClose} size="sm" className="shrink-0" />
      </div>

      {/* Sélecteur de BDD (mode feuilles) */}
      {isFlat && sheets.length > 0 && (
        <div className="flex shrink-0 flex-wrap items-center gap-1.5 border-b border-white/10 px-4 py-2">
          <span className="mr-1 text-[10px] font-semibold uppercase tracking-wide text-white/30">Base</span>
          {sheets.map((s, i) => (
            <button key={s.name + i} onClick={() => { setSheetIdx(i); setFilter('') }}
              className={`rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors ${i === Math.min(sheetIdx, sheets.length - 1) ? 'bg-indigo-500/25 text-indigo-200' : 'text-white/45 hover:bg-white/[0.04] hover:text-white/80'}`}>
              {s.name} <span className="text-white/35">({s.rows.length})</span>
            </button>
          ))}
        </div>
      )}

      <div className="flex-1 overflow-auto">
        {loading ? (
          <div className="flex h-full items-center justify-center gap-2 text-[12px] text-white/40"><Loader2 className="h-4 w-4 animate-spin" /> Chargement…</div>
        ) : error ? (
          <div className="flex h-full items-center justify-center text-[12px] text-amber-400/80">{error}</div>
        ) : filtered.length === 0 ? (
          <div className="flex h-full items-center justify-center text-[12px] text-white/30">Aucun enregistrement.</div>
        ) : (
          <table className="w-full border-collapse text-[12px]">
            <thead className="sticky top-0 bg-well">
              <tr>{columns.map((c) => <th key={c} className="whitespace-nowrap border-b border-white/10 px-4 py-2 text-left text-[10px] font-bold uppercase tracking-wide text-white/40">{labelByCol[c] || c}</th>)}</tr>
            </thead>
            <tbody>
              {pageRows.map((r) => (
                <tr key={r._docId} className="hover:bg-white/[0.03]">
                  {columns.map((c) => (
                    <td
                      key={c}
                      onDoubleClick={() => setDetail({ col: labelByCol[c] || c, value: cellValue(r, c) })}
                      title={t('dg.dblClickFullValue')}
                      className="max-w-[260px] cursor-zoom-in truncate border-b border-white/5 px-4 py-2 font-mono text-white/70 hover:text-white"
                    >
                      {formatCell(c, cellValue(r, c))}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      {!loading && !error && filtered.length > PAGE_SIZE && (
        <div className="flex shrink-0 items-center justify-between border-t border-white/10 px-4 py-2 text-[12px] text-white/50">
          <span><span className="tabular-nums text-white/70">{firstRow}–{lastRow}</span> sur <span className="tabular-nums text-white/70">{filtered.length}</span></span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={safePage === 0}
              className="flex items-center gap-1 rounded-lg border border-white/10 px-2.5 py-1.5 transition-colors enabled:hover:text-white disabled:opacity-30"
            >
              <ChevronLeft className="h-3.5 w-3.5" /> Précédent
            </button>
            <span className="tabular-nums text-white/40">Page {safePage + 1} / {pageCount}</span>
            <button
              onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
              disabled={safePage >= pageCount - 1}
              className="flex items-center gap-1 rounded-lg border border-white/10 px-2.5 py-1.5 transition-colors enabled:hover:text-white disabled:opacity-30"
            >
              Suivant <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* Visionneuse de valeur (double-clic sur une cellule) */}
      {detail && (
        <div className="absolute inset-0 z-20 flex flex-col bg-well">
          <div className="flex shrink-0 items-center gap-2 border-b border-white/10 px-4 py-2.5">
            <Braces className="h-4 w-4 text-indigo-400" />
            <span className="font-mono text-[13px] font-semibold text-white">{detail.col}</span>
            <button onClick={copyDetail} className="ml-auto flex items-center gap-1 rounded-lg border border-white/10 px-2.5 py-1.5 text-[12px] text-white/60 transition-colors hover:text-white">
              {copied ? <><Check className="h-3.5 w-3.5 text-emerald-400" /> {t('dg.copiedShort')}</> : <><Copy className="h-3.5 w-3.5" /> {t('dg.copyShort')}</>}
            </button>
            <CloseButton onClick={() => setDetail(null)} size="sm" />
          </div>
          <div className="min-h-0 flex-1"><ValueViewer value={detail.value} /></div>
        </div>
      )}
    </div>
  )
}
