import { useState, useRef, useCallback } from 'react'
import {
  X, Upload, FileSpreadsheet, Loader2, Plus, Minus,
  RefreshCw, ArrowRight, Check, AlertTriangle, MonitorUp,
} from 'lucide-react'
import type { SheetDiff, RowDiff, ColumnDiff } from './diffEngine'
import type { ExcelSheet } from './types'
import { diffSheets } from './diffEngine'
import { parseExcelFile } from './useExcelImport'
import { useExcelStore } from '@/stores/excel.store'

interface Props {
  open: boolean
  onClose: () => void
  onApply: (newSheets: ExcelSheet[]) => void
}

type DiffFilter = 'all' | 'added' | 'removed' | 'modified'

export function UpdatePreviewModal({ open, onClose, onApply }: Props) {
  const { sheets } = useExcelStore()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [newSheets, setNewSheets] = useState<ExcelSheet[] | null>(null)
  const [diffs, setDiffs] = useState<SheetDiff[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [dragActive, setDragActive] = useState(false)
  const [filter, setFilter] = useState<DiffFilter>('all')
  const [activeTab, setActiveTab] = useState(0)

  const handleFile = useCallback(async (file: File) => {
    setLoading(true)
    try {
      const parsed = await parseExcelFile(file)
      setNewSheets(parsed)

      const results: SheetDiff[] = []
      for (let i = 0; i < Math.max(sheets.length, parsed.length); i++) {
        const oldSheet = sheets[i]
        const newSheet = parsed[i]
        if (oldSheet && newSheet) {
          results.push(diffSheets(oldSheet, newSheet))
        } else if (newSheet) {
          results.push({
            name: newSheet.name,
            columns: newSheet.columns.map((c) => ({ key: c.key, label: c.label, type: 'added' })),
            rows: newSheet.rows.map((r) => ({ type: 'added' as const, rowId: r._id, cells: [], data: r })),
            summary: {
              columnsAdded: newSheet.columns.length, columnsRemoved: 0,
              rowsAdded: newSheet.rows.length, rowsRemoved: 0, rowsModified: 0, cellsModified: 0,
            },
          })
        }
      }
      setDiffs(results)
    } catch (err) {
      console.error('[Update] Parse error:', err)
    } finally {
      setLoading(false)
    }
  }, [sheets])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragActive(false)
    const file = e.dataTransfer.files[0]
    if (file) handleFile(file)
  }, [handleFile])

  const handleApply = () => {
    if (!newSheets) return
    onApply(newSheets)
    handleReset()
    onClose()
  }

  const handleReset = () => {
    setNewSheets(null)
    setDiffs(null)
    setFilter('all')
    setActiveTab(0)
  }

  if (!open) return null

  const diff = diffs?.[activeTab]
  const totalChanges = diff
    ? diff.summary.columnsAdded + diff.summary.columnsRemoved +
      diff.summary.rowsAdded + diff.summary.rowsRemoved +
      diff.summary.rowsModified
    : 0

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-[#1a1a1a] border border-white/10 rounded-2xl w-full max-w-4xl shadow-2xl overflow-hidden flex flex-col" style={{ height: '80vh' }}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-white/10 shrink-0">
          <div className="flex items-center gap-2">
            <RefreshCw className="w-4 h-4 text-amber-400" />
            <h2 className="font-semibold text-white text-sm">Mettre a jour les donnees</h2>
          </div>
          <button onClick={() => { handleReset(); onClose() }} className="text-white/30 hover:text-white transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {!diffs ? (
          /* File selection */
          <div className="flex-1 flex items-center justify-center p-8">
            {loading ? (
              <div className="flex flex-col items-center gap-4">
                <Loader2 className="w-10 h-10 text-indigo-400 animate-spin" />
                <p className="text-sm font-medium text-white/70">Analyse des differences...</p>
              </div>
            ) : (
              <div
                onDragOver={(e) => { e.preventDefault(); setDragActive(true) }}
                onDragLeave={() => setDragActive(false)}
                onDrop={handleDrop}
                className={`w-full h-full border-2 border-dashed rounded-xl flex flex-col items-center justify-center gap-4 transition-colors cursor-pointer ${
                  dragActive ? 'border-amber-500 bg-amber-500/10' : 'border-white/15 hover:border-white/30'
                }`}
                onClick={() => fileInputRef.current?.click()}
              >
                <div className="w-16 h-16 bg-amber-500/10 rounded-2xl flex items-center justify-center">
                  <MonitorUp className="w-8 h-8 text-amber-400" />
                </div>
                <div className="text-center">
                  <p className="text-sm text-white/50">
                    Deposer le fichier mis a jour ici ou{' '}
                    <span className="text-amber-400 underline underline-offset-2">parcourir</span>
                  </p>
                  <p className="text-[11px] text-white/25 mt-1">.xlsx, .xls, .csv</p>
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx,.xls,.csv,.tsv"
                  className="hidden"
                  onChange={(e) => { if (e.target.files?.[0]) handleFile(e.target.files[0]); e.target.value = '' }}
                />
              </div>
            )}
          </div>
        ) : (
          /* Diff preview */
          <>
            {/* Summary bar */}
            <div className="px-5 py-3 border-b border-white/10 shrink-0">
              {/* Sheet tabs if multiple */}
              {diffs.length > 1 && (
                <div className="flex gap-1 mb-3">
                  {diffs.map((d, i) => (
                    <button
                      key={i}
                      onClick={() => setActiveTab(i)}
                      className={`text-xs px-3 py-1 rounded-md transition-colors ${
                        i === activeTab ? 'bg-indigo-500/20 text-indigo-300' : 'text-white/40 hover:text-white/60'
                      }`}
                    >
                      {d.name}
                    </button>
                  ))}
                </div>
              )}

              {diff && (
                <div className="flex items-center gap-3 flex-wrap">
                  <SummaryBadge icon={<Plus className="w-3 h-3" />} count={diff.summary.columnsAdded} label="champs" color="emerald" />
                  <SummaryBadge icon={<Minus className="w-3 h-3" />} count={diff.summary.columnsRemoved} label="champs" color="red" />
                  <span className="w-px h-4 bg-white/10" />
                  <SummaryBadge icon={<Plus className="w-3 h-3" />} count={diff.summary.rowsAdded} label="lignes" color="emerald" />
                  <SummaryBadge icon={<Minus className="w-3 h-3" />} count={diff.summary.rowsRemoved} label="lignes" color="red" />
                  <SummaryBadge icon={<RefreshCw className="w-3 h-3" />} count={diff.summary.rowsModified} label="modifiees" color="blue" />
                  <SummaryBadge icon={<RefreshCw className="w-3 h-3" />} count={diff.summary.cellsModified} label="cellules" color="amber" />
                </div>
              )}
            </div>

            {/* Filter tabs */}
            <div className="flex gap-1 px-5 py-2 border-b border-white/10 shrink-0">
              {([
                { id: 'all' as const, label: 'Tout', count: totalChanges },
                { id: 'added' as const, label: 'Ajoutees', count: diff ? diff.summary.rowsAdded + diff.summary.columnsAdded : 0 },
                { id: 'removed' as const, label: 'Supprimees', count: diff ? diff.summary.rowsRemoved + diff.summary.columnsRemoved : 0 },
                { id: 'modified' as const, label: 'Modifiees', count: diff ? diff.summary.rowsModified : 0 },
              ]).map((f) => (
                <button
                  key={f.id}
                  onClick={() => setFilter(f.id)}
                  className={`text-[11px] px-2.5 py-1 rounded-md transition-colors ${
                    filter === f.id ? 'bg-white/10 text-white/80' : 'text-white/40 hover:text-white/60'
                  }`}
                >
                  {f.label} ({f.count})
                </button>
              ))}
            </div>

            {/* Diff content */}
            <div className="flex-1 overflow-y-auto p-5">
              {diff && (
                <div className="flex flex-col gap-4">
                  {/* Column changes */}
                  <ColumnChanges columns={diff.columns} filter={filter} />
                  {/* Row changes */}
                  <RowChanges rows={diff.rows} columns={diff.columns} filter={filter} />
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between px-5 py-3 border-t border-white/10 shrink-0">
              <button
                onClick={handleReset}
                className="text-xs text-white/40 hover:text-white/60 px-3 py-1.5 rounded-lg hover:bg-white/5 transition-colors"
              >
                Choisir un autre fichier
              </button>
              <div className="flex items-center gap-3">
                {totalChanges === 0 && (
                  <span className="text-xs text-white/30 flex items-center gap-1.5">
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                    Aucune difference
                  </span>
                )}
                <button
                  onClick={() => { handleReset(); onClose() }}
                  className="text-xs px-4 py-2 rounded-lg text-white/50 hover:text-white/70 hover:bg-white/5 transition-colors"
                >
                  Annuler
                </button>
                <button
                  onClick={handleApply}
                  disabled={totalChanges === 0}
                  className="text-xs px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-600 text-white font-medium transition-colors disabled:opacity-30 disabled:cursor-not-allowed flex items-center gap-1.5"
                >
                  <Check className="w-3.5 h-3.5" />
                  Appliquer ({totalChanges} changement{totalChanges > 1 ? 's' : ''})
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function SummaryBadge({ icon, count, label, color }: { icon: React.ReactNode; count: number; label: string; color: string }) {
  if (count === 0) return null
  const colors: Record<string, string> = {
    emerald: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20',
    red: 'bg-red-500/15 text-red-400 border-red-500/20',
    blue: 'bg-blue-500/15 text-blue-400 border-blue-500/20',
    amber: 'bg-amber-500/15 text-amber-400 border-amber-500/20',
  }
  return (
    <span className={`inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full border ${colors[color]}`}>
      {icon} {count} {label}
    </span>
  )
}

function ColumnChanges({ columns, filter }: { columns: ColumnDiff[]; filter: DiffFilter }) {
  const filtered = columns.filter((c) => {
    if (filter === 'all') return c.type !== 'unchanged'
    return c.type === filter
  })
  if (filtered.length === 0) return null

  return (
    <div>
      <h4 className="text-xs font-medium text-white/50 mb-2">Champs</h4>
      <div className="flex flex-wrap gap-1.5">
        {filtered.map((col) => (
          <span
            key={col.key}
            className={`inline-flex items-center gap-1.5 text-[11px] font-medium px-2.5 py-1 rounded-lg border ${colDiffStyle(col.type)}`}
          >
            {col.type === 'added' && <Plus className="w-3 h-3" />}
            {col.type === 'removed' && <Minus className="w-3 h-3" />}
            {col.type === 'modified' && <RefreshCw className="w-3 h-3" />}
            {col.label}
            {col.oldLabel && (
              <span className="text-white/30 ml-1">(ex: {col.oldLabel})</span>
            )}
          </span>
        ))}
      </div>
    </div>
  )
}

function RowChanges({ rows, columns, filter }: { rows: RowDiff[]; columns: ColumnDiff[]; filter: DiffFilter }) {
  const filtered = rows.filter((r) => {
    if (filter === 'all') return r.type !== 'unchanged'
    return r.type === filter
  })
  if (filtered.length === 0) return null

  // Show first visible columns for context
  const visibleCols = columns.filter((c) => c.type !== 'removed').slice(0, 5)

  return (
    <div>
      <h4 className="text-xs font-medium text-white/50 mb-2">
        Lignes ({filtered.length})
      </h4>
      <div className="border border-white/10 rounded-lg overflow-hidden">
        <table className="w-full text-[11px]">
          <thead>
            <tr className="bg-white/5">
              <th className="px-2 py-1.5 text-left text-white/30 font-medium w-8" />
              {visibleCols.map((c) => (
                <th key={c.key} className={`px-2 py-1.5 text-left font-medium ${colDiffTextColor(c.type)}`}>
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.slice(0, 100).map((row) => (
              <tr key={row.rowId} className={`border-t border-white/5 ${rowBgStyle(row.type)}`}>
                <td className="px-2 py-1.5">
                  {row.type === 'added' && <Plus className="w-3 h-3 text-emerald-400" />}
                  {row.type === 'removed' && <Minus className="w-3 h-3 text-red-400" />}
                  {row.type === 'modified' && <RefreshCw className="w-3 h-3 text-blue-400" />}
                </td>
                {visibleCols.map((c) => {
                  const cellDiff = row.cells.find((cd) => cd.colKey === c.key)
                  const val = row.data[c.key]
                  return (
                    <td key={c.key} className={`px-2 py-1.5 ${cellDiffStyle(cellDiff?.type)}`}>
                      <span className="truncate block max-w-[200px]">
                        {val !== null && val !== undefined ? String(val) : ''}
                      </span>
                      {cellDiff?.type === 'modified' && cellDiff.oldValue !== null && (
                        <span className="text-red-400/50 line-through block truncate max-w-[200px]">
                          {String(cellDiff.oldValue)}
                        </span>
                      )}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length > 100 && (
          <div className="px-3 py-2 text-[10px] text-white/30 bg-white/5 border-t border-white/5">
            ... et {filtered.length - 100} autres lignes
          </div>
        )}
      </div>
    </div>
  )
}

function colDiffStyle(type: string): string {
  switch (type) {
    case 'added': return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
    case 'removed': return 'bg-red-500/10 text-red-400 border-red-500/20'
    case 'modified': return 'bg-blue-500/10 text-blue-400 border-blue-500/20'
    default: return 'bg-white/5 text-white/50 border-white/10'
  }
}

function colDiffTextColor(type: string): string {
  switch (type) {
    case 'added': return 'text-emerald-400'
    case 'modified': return 'text-blue-400'
    default: return 'text-white/40'
  }
}

function rowBgStyle(type: string): string {
  switch (type) {
    case 'added': return 'bg-emerald-500/[0.04]'
    case 'removed': return 'bg-red-500/[0.04]'
    case 'modified': return 'bg-blue-500/[0.04]'
    default: return ''
  }
}

function cellDiffStyle(type?: string): string {
  switch (type) {
    case 'added': return 'text-emerald-400'
    case 'modified': return 'text-amber-400'
    default: return 'text-white/60'
  }
}
