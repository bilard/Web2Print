import { useState } from 'react'
import { X, FileText, Image, Presentation, Loader2 } from 'lucide-react'
import { useMergeStore } from '@/stores/merge.store'
import { useBatchExport, type ExportFormat, type ExportMode, type BatchExportConfig } from './useBatchExport'

interface ExportModalProps {
  open: boolean
  onClose: () => void
}

export function ExportModal({ open, onClose }: ExportModalProps) {
  const totalRows = useMergeStore((s) => s.rows.length)
  const { exportBatch, cancel, isExporting, progress, total } = useBatchExport()

  const [format, setFormat] = useState<ExportFormat>('pdf')
  const [mode, setMode] = useState<ExportMode>('zip')
  const [rangeAll, setRangeAll] = useState(true)
  const [rangeStart, setRangeStart] = useState(1)
  const [rangeEnd, setRangeEnd] = useState(totalRows)
  const [fileNamePattern, setFileNamePattern] = useState('export_{{_id}}')

  if (!open) return null

  const handleExport = () => {
    const config: BatchExportConfig = {
      format,
      mode: format === 'pdf' ? mode : 'zip',
      rangeStart: rangeAll ? 0 : rangeStart - 1,
      rangeEnd: rangeAll ? totalRows - 1 : rangeEnd - 1,
      fileNamePattern,
    }
    exportBatch(config)
  }

  const progressPercent = total > 0 ? Math.round((progress / total) * 100) : 0

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="bg-[#1a1a1a] border border-white/10 rounded-xl w-[420px] max-h-[80vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
          <h3 className="text-sm font-semibold text-white">Export en masse</h3>
          <button onClick={onClose} className="text-white/40 hover:text-white/70">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 space-y-4">
          {/* Format */}
          <div>
            <label className="text-xs text-white/50 font-medium mb-2 block">Format</label>
            <div className="flex gap-2">
              {([
                { id: 'pdf', label: 'PDF', icon: FileText },
                { id: 'pptx', label: 'PPTX', icon: Presentation },
                { id: 'png', label: 'PNG', icon: Image },
              ] as const).map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  onClick={() => setFormat(id)}
                  className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-md text-sm transition-colors ${
                    format === id
                      ? 'bg-indigo-500/20 text-indigo-400 border border-indigo-500/30'
                      : 'bg-white/5 text-white/50 hover:bg-white/10 border border-transparent'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Mode (PDF only) */}
          {format === 'pdf' && (
            <div>
              <label className="text-xs text-white/50 font-medium mb-2 block">Mode</label>
              <div className="flex gap-2">
                <button
                  onClick={() => setMode('multi-page')}
                  className={`flex-1 px-3 py-2 rounded-md text-sm transition-colors ${
                    mode === 'multi-page'
                      ? 'bg-indigo-500/20 text-indigo-400 border border-indigo-500/30'
                      : 'bg-white/5 text-white/50 hover:bg-white/10 border border-transparent'
                  }`}
                >
                  PDF multi-pages
                </button>
                <button
                  onClick={() => setMode('zip')}
                  className={`flex-1 px-3 py-2 rounded-md text-sm transition-colors ${
                    mode === 'zip'
                      ? 'bg-indigo-500/20 text-indigo-400 border border-indigo-500/30'
                      : 'bg-white/5 text-white/50 hover:bg-white/10 border border-transparent'
                  }`}
                >
                  ZIP individuels
                </button>
              </div>
            </div>
          )}

          {/* Rows */}
          <div>
            <label className="text-xs text-white/50 font-medium mb-2 block">Lignes</label>
            <div className="space-y-2">
              <label className="flex items-center gap-2 text-sm text-white/70">
                <input type="radio" checked={rangeAll} onChange={() => setRangeAll(true)} className="accent-indigo-500" />
                Toutes ({totalRows})
              </label>
              <label className="flex items-center gap-2 text-sm text-white/70">
                <input type="radio" checked={!rangeAll} onChange={() => setRangeAll(false)} className="accent-indigo-500" />
                Plage :
                <input type="number" min={1} max={totalRows} value={rangeStart} onChange={(e) => setRangeStart(Number(e.target.value))} disabled={rangeAll} className="w-16 px-2 py-1 bg-white/5 border border-white/10 rounded text-xs text-white disabled:opacity-30" />
                <span>à</span>
                <input type="number" min={1} max={totalRows} value={rangeEnd} onChange={(e) => setRangeEnd(Number(e.target.value))} disabled={rangeAll} className="w-16 px-2 py-1 bg-white/5 border border-white/10 rounded text-xs text-white disabled:opacity-30" />
              </label>
            </div>
          </div>

          {/* Naming (ZIP only) */}
          {(mode === 'zip' || format !== 'pdf') && (
            <div>
              <label className="text-xs text-white/50 font-medium mb-2 block">Nommage des fichiers</label>
              <input type="text" value={fileNamePattern} onChange={(e) => setFileNamePattern(e.target.value)} placeholder="export_{{nom}}_{{poste}}" className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-md text-sm text-white placeholder:text-white/20" />
              <p className="text-xs text-white/30 mt-1">Utilisez {'{{colonne}}'} pour insérer des valeurs dynamiques</p>
            </div>
          )}

          {/* Progress */}
          {isExporting && (
            <div>
              <div className="flex items-center justify-between text-xs text-white/50 mb-1">
                <span>Export en cours...</span>
                <span>{progress}/{total} ({progressPercent}%)</span>
              </div>
              <div className="w-full h-2 bg-white/5 rounded-full overflow-hidden">
                <div className="h-full bg-indigo-500 transition-all duration-200" style={{ width: `${progressPercent}%` }} />
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 px-4 py-3 border-t border-white/10">
          {isExporting ? (
            <button onClick={cancel} className="px-4 py-2 rounded-md bg-red-500/20 text-red-400 text-sm hover:bg-red-500/30 transition-colors">
              Annuler
            </button>
          ) : (
            <>
              <button onClick={onClose} className="px-4 py-2 rounded-md bg-white/5 text-white/50 text-sm hover:bg-white/10 transition-colors">
                Fermer
              </button>
              <button onClick={handleExport} className="px-4 py-2 rounded-md bg-indigo-500 text-white text-sm hover:bg-indigo-600 transition-colors flex items-center gap-2">
                Exporter {rangeAll ? totalRows : Math.max(0, rangeEnd - rangeStart + 1)} lignes
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
