import { useState, useRef, useCallback } from 'react'
import {
  X, Upload, FileSpreadsheet, Loader2, MonitorUp, Plus,
  Check, ChevronDown, ChevronRight, Layers,
} from 'lucide-react'
import { useExcelStore } from '@/stores/excel.store'
import { useExcelImport } from './useExcelImport'
import { parseExcelFile } from './useExcelImport'
import { FieldTypeIcon } from './FieldTypeIcon'
import { FIELD_TYPES, type ExcelSheet, type ExcelColumn, type FieldTypeId, type TaxonomyLevelMap } from './types'
import { buildTaxonomyFromLevels, getLevelColor, getMaxLevel } from './taxonomyBuilder'

interface Props {
  open: boolean
  onClose: () => void
}

type Source = 'local' | 'url' | 'new'


export function ExcelImportModal({ open, onClose }: Props) {
  const [source, setSource] = useState<Source>('local')
  const [dragActive, setDragActive] = useState(false)
  const [urlValue, setUrlValue] = useState('')
  const [error, setError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const { detecting } = useExcelStore()
  const { importFile, createEmpty } = useExcelImport()

  // Step 2 state: parsed sheets awaiting configuration
  const [parsedSheets, setParsedSheets] = useState<ExcelSheet[] | null>(null)
  const [parsedFileName, setParsedFileName] = useState('')
  const [columnTypes, setColumnTypes] = useState<Record<string, FieldTypeId>>({})
  const [taxoLevels, setTaxoLevels] = useState<TaxonomyLevelMap>({})
  const [expandedCol, setExpandedCol] = useState<string | null>(null)

  const resetConfig = () => {
    setParsedSheets(null)
    setParsedFileName('')
    setColumnTypes({})
    setTaxoLevels({})
    setExpandedCol(null)
    setError(null)
  }

  const handleFile = useCallback(async (file: File) => {
    setError(null)
    const ext = file.name.split('.').pop()?.toLowerCase()
    if (!['xlsx', 'xls', 'csv', 'tsv'].includes(ext ?? '')) {
      setError('Format non supporte. Utilisez .xlsx, .xls ou .csv')
      return
    }
    try {
      const sheets = await parseExcelFile(file)
      setParsedSheets(sheets)
      setParsedFileName(file.name.replace(/\.[^.]+$/, ''))
      // Init column types from detected types
      const types: Record<string, FieldTypeId> = {}
      for (const sheet of sheets) {
        for (const col of sheet.columns) {
          types[col.key] = col.fieldType
        }
      }
      setColumnTypes(types)
      setTaxoLevels({})
    } catch (err) {
      setError(String(err))
    }
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragActive(false)
    const file = e.dataTransfer.files[0]
    if (file) handleFile(file)
  }, [handleFile])

  const handleCreate = () => {
    createEmpty()
    resetConfig()
    onClose()
  }

  const handleConfirmImport = () => {
    if (!parsedSheets) return
    const { setSheets, setCurrentFileName } = useExcelStore.getState()

    // Apply configured types and build taxonomy
    const finalSheets = parsedSheets.map((sheet) => {
      const columns = sheet.columns.map((col) => ({
        ...col,
        fieldType: columnTypes[col.key] ?? col.fieldType,
      }))

      const taxonomy = buildTaxonomyFromLevels(sheet, taxoLevels)

      return { ...sheet, columns, taxonomy, taxonomyLevels: taxoLevels }
    })

    setCurrentFileName(parsedFileName)
    setSheets(finalSheets)
    resetConfig()
    onClose()
  }

  const setColumnType = (key: string, type: FieldTypeId) => {
    setColumnTypes((prev) => ({ ...prev, [key]: type }))
  }

  const setTaxoLevel = (key: string, level: number) => {
    setTaxoLevels((prev) => {
      const next = { ...prev }
      if (level === 0) delete next[key]
      else next[key] = level
      return next
    })
  }

  if (!open) return null

  const sources: { id: Source; icon: React.ReactNode; label: string }[] = [
    { id: 'local', icon: <MonitorUp className="w-4 h-4" />, label: 'Fichiers locaux' },
    { id: 'url', icon: <Upload className="w-4 h-4" />, label: 'Lien (URL)' },
    { id: 'new', icon: <Plus className="w-4 h-4" />, label: 'Creer vide' },
  ]

  // Step 2: Configuration
  if (parsedSheets) {
    const sheet = parsedSheets[0]
    if (!sheet) return null

    const taxoColumns = sheet.columns
      .filter((c) => (taxoLevels[c.key] ?? 0) > 0)
      .sort((a, b) => (taxoLevels[a.key] ?? 0) - (taxoLevels[b.key] ?? 0))
    const maxLevel = getMaxLevel(taxoLevels)

    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
        <div className="bg-[#1a1a1a] border border-white/10 rounded-2xl w-full max-w-3xl shadow-2xl overflow-hidden flex flex-col" style={{ height: '85vh' }}>
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-3 border-b border-white/10 shrink-0">
            <div className="flex items-center gap-2">
              <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
              <h2 className="font-semibold text-white text-sm">Configuration — {parsedFileName}</h2>
              <span className="text-[10px] text-white/30 ml-2">
                {sheet.columns.length} champs · {sheet.rows.length} lignes
              </span>
            </div>
            <button onClick={() => { resetConfig(); onClose() }} className="text-white/30 hover:text-white transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Content */}
          <div className="flex-1 flex overflow-hidden">
            {/* Left: column list */}
            <div className="flex-1 overflow-y-auto p-4">
              <div className="flex flex-col gap-1.5">
                {sheet.columns.map((col) => {
                  const lvl = taxoLevels[col.key] ?? 0
                  const currentType = columnTypes[col.key] ?? col.fieldType
                  const isExpanded = expandedCol === col.key
                  const isTaxo = lvl > 0

                  // Count unique values for preview
                  const uniqueVals = new Set(sheet.rows.map((r) => r[col.key]).filter((v) => v !== null && v !== ''))

                  return (
                    <div
                      key={col.key}
                      className={`rounded-lg border transition-colors ${
                        isTaxo
                          ? 'border-l-2 bg-white/5 border-white/10'
                          : 'bg-white/[0.03] border-white/[0.06] hover:border-white/10'
                      }`}
                      style={isTaxo ? { borderLeftColor: getLevelColor(lvl) } : undefined}
                    >
                      {/* Column row */}
                      <div className="flex items-center gap-2 px-3 py-2">
                        <button
                          onClick={() => setExpandedCol(isExpanded ? null : col.key)}
                          className="text-white/20 hover:text-white/50 shrink-0"
                        >
                          {isExpanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                        </button>

                        <FieldTypeIcon type={currentType} className="w-3.5 h-3.5 text-white/30 shrink-0" />
                        <span className="text-xs text-white/80 flex-1 truncate font-medium">{col.label}</span>

                        <span className="text-[10px] text-white/25 shrink-0">{uniqueVals.size} val.</span>

                        {/* Taxonomy level selector */}
                        <select
                          value={lvl}
                          onChange={(e) => setTaxoLevel(col.key, parseInt(e.target.value))}
                          className="bg-white/5 border border-white/10 rounded text-[10px] text-white/50 px-1.5 py-0.5 outline-none hover:border-white/20 cursor-pointer shrink-0"
                          title="Niveau taxonomie"
                        >
                          <option value={0}>— Donnee</option>
                          {Array.from({ length: maxLevel + 2 }, (_, i) => i + 1).map((lvl) => (
                            <option key={lvl} value={lvl}>Niveau {lvl}</option>
                          ))}
                        </select>

                        {/* Type selector compact */}
                        <TypeDropdown value={currentType} onChange={(t) => setColumnType(col.key, t)} />
                      </div>

                      {/* Expanded: preview values */}
                      {isExpanded && (
                        <div className="px-3 pb-2.5 pt-0.5">
                          <div className="flex flex-wrap gap-1 max-h-24 overflow-y-auto">
                            {[...uniqueVals].slice(0, 30).map((v, i) => (
                              <span
                                key={i}
                                className="text-[10px] px-2 py-0.5 rounded-full bg-white/5 border border-white/[0.06] text-white/50 truncate max-w-[150px]"
                              >
                                {String(v)}
                              </span>
                            ))}
                            {uniqueVals.size > 30 && (
                              <span className="text-[10px] text-white/20 px-2 py-0.5">
                                +{uniqueVals.size - 30}
                              </span>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Right: taxonomy preview */}
            <div className="w-56 bg-[#161616] border-l border-white/10 overflow-y-auto p-3 shrink-0 flex flex-col gap-3">
              <h3 className="text-xs font-semibold text-white/50 uppercase tracking-wider flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5" />
                Taxonomie
              </h3>

              {taxoColumns.length === 0 ? (
                <p className="text-[11px] text-white/20 text-center py-6">
                  Assignez un niveau a un champ pour creer la hierarchie
                </p>
              ) : (
                <TaxonomyPreview sheet={sheet} taxoLevels={taxoLevels} taxoColumns={taxoColumns} />
              )}

              {/* Legend */}
              <div className="mt-auto border-t border-white/10 pt-3">
                <p className="text-[10px] text-white/25 mb-2">Niveaux</p>
                {taxoColumns.map((col) => {
                  const colLevel = taxoLevels[col.key] ?? 0
                  return (
                    <div key={col.key} className="flex items-center gap-2 py-0.5">
                      <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: getLevelColor(colLevel) }} />
                      <span className="text-[10px] text-white/40 truncate">{col.label}</span>
                      <span className="text-[9px] text-white/20 ml-auto">N{colLevel}</span>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between px-5 py-3 border-t border-white/10 shrink-0">
            <button
              onClick={resetConfig}
              className="text-xs text-white/40 hover:text-white/60 px-3 py-1.5 rounded-lg hover:bg-white/5 transition-colors"
            >
              Retour
            </button>
            <button
              onClick={handleConfirmImport}
              className="flex items-center gap-1.5 text-xs px-5 py-2 rounded-lg bg-indigo-500 hover:bg-indigo-600 text-white font-medium transition-colors"
            >
              <Check className="w-3.5 h-3.5" />
              Importer
            </button>
          </div>
        </div>
      </div>
    )
  }

  // Step 1: File selection
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-[#1a1a1a] border border-white/10 rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden flex" style={{ height: 480 }}>
        {/* Left sidebar - sources */}
        <div className="w-48 bg-[#161616] border-r border-white/10 py-2 shrink-0">
          {sources.map((s) => (
            <button
              key={s.id}
              onClick={() => setSource(s.id)}
              className={`w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-left transition-colors ${
                source === s.id
                  ? 'bg-white/10 text-white font-medium'
                  : 'text-white/50 hover:text-white/70 hover:bg-white/5'
              }`}
            >
              {s.icon}
              {s.label}
            </button>
          ))}
        </div>

        {/* Right content */}
        <div className="flex-1 flex flex-col">
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-3 border-b border-white/10">
            <div className="flex items-center gap-2">
              <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
              <h2 className="font-semibold text-white text-sm">Import Excel / CSV</h2>
            </div>
            <button onClick={onClose} className="text-white/30 hover:text-white transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Content area */}
          <div className="flex-1 flex items-center justify-center p-8">
            {detecting ? (
              <div className="flex flex-col items-center gap-4">
                <Loader2 className="w-10 h-10 text-indigo-400 animate-spin" />
                <p className="text-sm font-medium text-white/70">Detection des types de champs...</p>
              </div>
            ) : source === 'local' ? (
              <div
                onDragOver={(e) => { e.preventDefault(); setDragActive(true) }}
                onDragLeave={() => setDragActive(false)}
                onDrop={handleDrop}
                className={`w-full h-full border-2 border-dashed rounded-xl flex flex-col items-center justify-center gap-4 transition-colors cursor-pointer ${
                  dragActive
                    ? 'border-indigo-500 bg-indigo-500/10'
                    : 'border-white/15 hover:border-white/30'
                }`}
                onClick={() => fileInputRef.current?.click()}
              >
                <div className="w-16 h-16 bg-white/5 rounded-2xl flex items-center justify-center">
                  <FileSpreadsheet className="w-8 h-8 text-white/30" />
                </div>
                <div className="text-center">
                  <p className="text-sm text-white/50">
                    Deposer les fichiers ici, coller ou{' '}
                    <span className="text-indigo-400 underline underline-offset-2">naviguer</span>
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
            ) : source === 'url' ? (
              <div className="w-full flex flex-col gap-4">
                <label className="text-sm text-white/60">URL du fichier Excel / CSV</label>
                <input
                  type="url"
                  value={urlValue}
                  onChange={(e) => setUrlValue(e.target.value)}
                  placeholder="https://exemple.com/data.xlsx"
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-sm text-white/80 placeholder:text-white/30 outline-none focus:border-indigo-500/50"
                />
                <button
                  onClick={async () => {
                    if (!urlValue.trim()) return
                    try {
                      const resp = await fetch(urlValue)
                      const blob = await resp.blob()
                      const name = urlValue.split('/').pop() ?? 'import.xlsx'
                      await handleFile(new File([blob], name))
                    } catch (err) {
                      setError(`Erreur de telechargement: ${err}`)
                    }
                  }}
                  className="self-end bg-indigo-500 hover:bg-indigo-600 text-white text-sm font-medium px-6 py-2.5 rounded-lg transition-colors"
                >
                  Importer
                </button>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-4">
                <div className="w-16 h-16 bg-emerald-500/10 rounded-2xl flex items-center justify-center">
                  <Plus className="w-8 h-8 text-emerald-400" />
                </div>
                <p className="text-sm text-white/60 text-center">
                  Creer un tableau vide avec des colonnes par defaut
                </p>
                <button
                  onClick={handleCreate}
                  className="bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-medium px-6 py-2.5 rounded-lg transition-colors"
                >
                  Creer un tableau
                </button>
              </div>
            )}
          </div>

          {/* Error */}
          {error && (
            <div className="px-5 pb-3">
              <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
                {error}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

/** Compact type dropdown */
function TypeDropdown({ value, onChange }: { value: FieldTypeId; onChange: (t: FieldTypeId) => void }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const current = FIELD_TYPES.find((t) => t.id === value)

  // Close on outside click
  const handleClick = useCallback((e: MouseEvent) => {
    if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
  }, [])

  useState(() => {
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  })

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] text-white/40 hover:text-white/60 bg-white/5 hover:bg-white/10 border border-white/[0.06] transition-colors"
      >
        <FieldTypeIcon type={value} className="w-3 h-3" />
        {current?.shortLabel ?? current?.label}
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 w-56 bg-[#1e1e1e] border border-white/15 rounded-lg shadow-2xl z-50 max-h-64 overflow-y-auto py-1">
          {FIELD_TYPES.map((ft) => (
            <button
              key={ft.id}
              onClick={() => { onChange(ft.id); setOpen(false) }}
              className={`w-full flex items-center gap-2 px-3 py-1.5 text-left transition-colors ${
                ft.id === value ? 'bg-indigo-500/15 text-indigo-300' : 'text-white/60 hover:bg-white/5'
              }`}
            >
              <FieldTypeIcon type={ft.id} className="w-3.5 h-3.5 shrink-0" />
              <span className="text-[11px]">{ft.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

/** Preview of the taxonomy tree being built */
function TaxonomyPreview({ sheet, taxoLevels }: {
  sheet: ExcelSheet
  taxoLevels: TaxonomyLevelMap
  taxoColumns: ExcelColumn[]
}) {
  const taxonomy = buildTaxonomyFromLevels(sheet, taxoLevels)
  if (taxonomy.length === 0) return null

  return (
    <div className="flex flex-col gap-1">
      {taxonomy.slice(0, 15).map((cat) => (
        <div key={cat.id} className="rounded-lg border border-white/10 overflow-hidden">
          <div className="flex items-center gap-1.5 px-2 py-1.5 bg-white/5">
            <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: cat.color }} />
            <span className="text-[11px] text-white/70 truncate">{cat.name}</span>
            {cat.tags.length > 0 && (
              <span className="text-[9px] text-white/25 ml-auto">{cat.tags.length}</span>
            )}
          </div>
          {cat.tags.length > 0 && (
            <div className="px-2 py-1 flex flex-wrap gap-0.5">
              {cat.tags.slice(0, 8).map((tag) => (
                <span
                  key={tag.id}
                  className="text-[9px] px-1.5 py-0.5 rounded-full border truncate max-w-[100px]"
                  style={{
                    backgroundColor: `${tag.color}15`,
                    borderColor: `${tag.color}30`,
                    color: tag.color,
                  }}
                >
                  {tag.label}
                </span>
              ))}
              {cat.tags.length > 8 && (
                <span className="text-[9px] text-white/20 px-1">+{cat.tags.length - 8}</span>
              )}
            </div>
          )}
        </div>
      ))}
      {taxonomy.length > 15 && (
        <p className="text-[10px] text-white/20 text-center">+{taxonomy.length - 15} categories</p>
      )}
    </div>
  )
}
