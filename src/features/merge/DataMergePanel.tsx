import { useState, useEffect, useRef } from 'react'
import { Textbox, FabricImage } from 'fabric'
import { ChevronLeft, ChevronRight, Unlink, Rocket, RefreshCw, Link2, Type, Image, Palette, Eye, FunctionSquare, X, Hash, ToggleLeft } from 'lucide-react'
import { globalFabricCanvas } from '@/features/editor/CanvasContainer'
import { useEditorStore } from '@/stores/editor.store'
import { useMergeStore, type FormulaResultType, type FormulaConfig } from '@/stores/merge.store'
import { useDataMerge } from './useDataMerge'
import { hasPlaceholders, evaluateFormula, formatFormulaResult } from './mergeEngine'
import { syncToStore } from '@/features/editor/useAddObject'
import { DataSourcePicker } from './DataSourcePicker'
import { SourceSwitcher } from './SourceSwitcher'
import { VendorStatusPanel } from './VendorStatusPanel'
import { ExportModal } from './ExportModal'

/** Convertit les clés [col_key] → [col_label] pour l'affichage */
function normalizeForDisplay(formula: string, columns: { key: string; label: string }[]): string {
  return formula.replace(/\[([^\]]+)\]/g, (_, ref: string) => {
    const col = columns.find((c) => c.key === ref && c.label !== ref)
    return col ? `[${col.label}]` : `[${ref}]`
  })
}

/** Convertit les labels [col_label] → [col_key] pour le stockage */
function normalizeForStorage(formula: string, columns: { key: string; label: string }[]): string {
  return formula.replace(/\[([^\]]+)\]/g, (_, ref: string) => {
    const col = columns.find((c) => c.label === ref && c.key !== ref)
    return col ? `[${col.key}]` : `[${ref}]`
  })
}

export function DataMergePanel() {
  const { isConnected, dataSource, columns, currentRowIndex, totalRows, nextRow, prevRow, disconnectSource, connectSource } =
    useDataMerge()
  const selectedObjectId = useEditorStore((s) => s.selectedObjectId)
  const idmlSourceFileName = useEditorStore((s) => s.idmlSourceFileName)
  const [exportOpen, setExportOpen] = useState(false)
  const [refreshing, setRefreshing] = useState(false)

  // Always use Fabric mode for preview — IDML mode is for export only.
  // IDML preview replaces canvas objects and loses user-configured bindings.
  const hasIdmlSource = isConnected && !!idmlSourceFileName

  const handleRefresh = async () => {
    if (!dataSource || refreshing) return
    setRefreshing(true)
    try {
      disconnectSource()
      await connectSource(dataSource)
    } catch (err) {
      console.error('Refresh error:', err)
    } finally {
      setRefreshing(false)
    }
  }

  if (!isConnected) {
    return <DataSourcePicker />
  }

  return (
    <div className="text-sm">
      {/* Source info + mode badge — nom cliquable pour switcher vers un autre dataset */}
      <div className="px-3 py-2 flex items-center gap-2 border-b border-white/5">
        <SourceSwitcher />
        {/* IDML badge — shown when IDML export is available */}
        {hasIdmlSource && (
          <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400 shrink-0">
            IDML
          </span>
        )}
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          className="p-1 rounded hover:bg-white/10 text-white/30 hover:text-indigo-400 transition-colors disabled:opacity-50 shrink-0"
          title="Reconnecter la source"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
        </button>
        <span className="text-xs text-white/30 shrink-0">{totalRows} lignes</span>
      </div>

      {/* Fournisseurs de la source */}
      <VendorStatusPanel />

      {/* Navigation */}
      <div className="px-3 py-2 border-b border-white/5">
        <div className="flex items-center gap-2 justify-center">
          <button
            onClick={prevRow}
            disabled={currentRowIndex <= 0}
            className="p-1 rounded bg-white/5 hover:bg-white/10 disabled:opacity-20 transition-colors"
          >
            <ChevronLeft className="w-4 h-4 text-white/70" />
          </button>
          <span className="text-indigo-400 font-semibold min-w-[80px] text-center">
            {currentRowIndex + 1} / {totalRows}
          </span>
          <button
            onClick={nextRow}
            disabled={currentRowIndex >= totalRows - 1}
            className="p-1 rounded bg-white/5 hover:bg-white/10 disabled:opacity-20 transition-colors"
          >
            <ChevronRight className="w-4 h-4 text-white/70" />
          </button>
        </div>
      </div>

      {/* Bindings actifs */}
      <ActiveBindings columns={columns} />

      {/* Tags variables cliquables */}
      <VariableTags columns={columns} />

      {/* Binding pour objet sélectionné */}
      {selectedObjectId && (
        <BindingEditor selectedObjectId={selectedObjectId} columns={columns} />
      )}

      {/* Actions */}
      <div className="px-3 py-2 flex gap-2">
        <button
          onClick={() => setExportOpen(true)}
          className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-md bg-indigo-500 hover:bg-indigo-600 text-white text-xs font-medium transition-colors"
        >
          <Rocket className="w-3.5 h-3.5" />
          Exporter tout ({totalRows})
        </button>
        <button
          onClick={disconnectSource}
          className="p-2 rounded-md bg-white/5 hover:bg-red-500/20 text-white/40 hover:text-red-400 transition-colors"
          title="Déconnecter"
        >
          <Unlink className="w-3.5 h-3.5" />
        </button>
      </div>

      <ExportModal open={exportOpen} onClose={() => setExportOpen(false)} />
    </div>
  )
}

const BINDING_ICON: Record<string, typeof Type> = {
  texte: Type,
  src: Image,
  fill: Palette,
  stroke: Palette,
  opacity: Eye,
}

function ActiveBindings({ columns }: { columns: { key: string; label: string; fieldType?: string }[] }) {
  const canvas = globalFabricCanvas
  const { isConnected } = useMergeStore()
  const selectedObjectId = useEditorStore((s) => s.selectedObjectId)
  const [bindings, setBindings] = useState<{ id: string; name: string; type: string; variable: string; matched: boolean }[]>([])

  // Recalculer les bindings après chaque changement (connection, navigation, sélection)
  useEffect(() => {
    // Petit délai pour laisser applyRow capturer les templateText
    const timer = setTimeout(() => {
      if (!canvas || !isConnected) { setBindings([]); return }
      const result: typeof bindings = []
      const colKeys = new Set(columns.map((c) => c.key))

      for (const obj of canvas.getObjects()) {
        if (obj.data?.isGrid || obj.data?.isPageBg) continue
        const objId = (obj.data?.id ?? '') as string
        const name = (obj.data?.name ?? obj.type ?? 'Objet') as string

        if (obj instanceof Textbox) {
          const tmpl = (obj.data?.templateText as string | undefined) ?? obj.text ?? ''
          if (hasPlaceholders(tmpl)) {
            const vars = tmpl.match(/\{\{([^}]+)\}\}/g)?.map((m: string) => m.slice(2, -2)) ?? []
            for (const v of vars) {
              result.push({ id: objId, name, type: 'texte', variable: v, matched: colKeys.has(v) })
            }
          }
        }

        const b = obj.data?.bindings as Record<string, string> | undefined
        if (b) {
          for (const [prop, col] of Object.entries(b)) {
            result.push({ id: objId, name, type: prop, variable: col, matched: colKeys.has(col) })
          }
        }
      }
      // Dédupliquer par variable + type
      const seen = new Set<string>()
      setBindings(result.filter((b) => {
        const key = `${b.type}:${b.variable}`
        if (seen.has(key)) return false
        seen.add(key)
        return true
      }))
    }, 100)
    return () => clearTimeout(timer)
  }, [canvas, isConnected, columns, selectedObjectId])

  const formulas = useMergeStore((s) => s.formulas)
  const formulaConfigs = useMergeStore((s) => s.formulaConfigs)
  const rows = useMergeStore((s) => s.rows)
  const setFormula = useMergeStore((s) => s.setFormula)
  const removeFormula = useMergeStore((s) => s.removeFormula)
  const setFormulaConfig = useMergeStore((s) => s.setFormulaConfig)
  const removeFormulaConfig = useMergeStore((s) => s.removeFormulaConfig)
  const hideLineIfEmpty = useMergeStore((s) => s.hideLineIfEmpty)
  const setHideLineIfEmpty = useMergeStore((s) => s.setHideLineIfEmpty)
  const [editingVar, setEditingVar] = useState<string | null>(null)
  const [formulaDraft, setFormulaDraft] = useState('')
  const [configDraft, setConfigDraft] = useState<FormulaConfig>({ resultType: 'auto', decimals: null })
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  if (bindings.length === 0) {
    return (
      <div className="px-3 py-3 border-b border-white/5">
        <div className="flex flex-col items-center gap-2 py-1">
          <Link2 className="w-5 h-5 text-white/15" />
          <p className="text-[11px] text-white/25 text-center leading-relaxed">
            Aucune liaison.<br />
            Tapez <code className="text-indigo-400/50 bg-white/5 px-1 rounded">{'{{colonne}}'}</code> dans un texte<br />
            ou liez une propriété ci-dessous.
          </p>
        </div>
      </div>
    )
  }

  const openFormulaEditor = (variable: string) => {
    const rawFormula = formulas[variable] ?? `[${variable}]`
    setFormulaDraft(normalizeForDisplay(rawFormula, columns))
    setConfigDraft(formulaConfigs[variable] ?? { resultType: 'auto', decimals: null })
    setEditingVar(variable)
  }

  const insertAtCursor = (text: string) => {
    const ta = textareaRef.current
    if (!ta) { setFormulaDraft((d) => d + text); return }
    const start = ta.selectionStart
    const end = ta.selectionEnd
    const newVal = formulaDraft.slice(0, start) + text + formulaDraft.slice(end)
    setFormulaDraft(newVal)
    requestAnimationFrame(() => {
      ta.focus()
      ta.setSelectionRange(start + text.length, start + text.length)
    })
  }

  const saveFormula = () => {
    if (!editingVar) return
    const trimmed = formulaDraft.trim()
    const storageFmt = normalizeForStorage(trimmed, columns)
    if (!trimmed || storageFmt === `[${editingVar}]`) {
      removeFormula(editingVar)
      removeFormulaConfig(editingVar)
    } else {
      setFormula(editingVar, storageFmt)
      setFormulaConfig(editingVar, configDraft)
    }
    setEditingVar(null)
  }

  // Aperçu sur les 3 premières lignes (avec formatage selon config)
  const preview = editingVar ? rows.slice(0, 3).map((row) => {
    const rawFormula = normalizeForStorage(formulaDraft, columns)
    const raw = evaluateFormula(rawFormula, row)
    return formatFormulaResult(raw, configDraft.resultType !== 'auto' ? configDraft : undefined)
  }) : []

  const FIELD_ICON: Record<string, typeof Type> = {
    select: ToggleLeft,
    number: Hash,
  }

  return (
    <div className="px-3 py-2 border-b border-white/5">
      <div className="text-[10px] text-white/30 uppercase tracking-wider mb-2 flex items-center gap-1.5">
        <Link2 className="w-3 h-3" />
        Liaisons actives
        <span className="ml-auto text-indigo-400/60 normal-case tracking-normal">{bindings.length}</span>
      </div>
      <div className="space-y-0.5">
        {bindings.map((b, i) => {
          const Icon = BINDING_ICON[b.type] ?? Link2
          const typeColor = b.type === 'texte' ? 'text-green-400' :
            b.type === 'src' ? 'text-blue-400' : 'text-amber-400'
          const hasFormula = !!formulas[b.variable]
          return (
            <div
              key={i}
              onClick={() => openFormulaEditor(b.variable)}
              className={`flex items-center gap-2 py-1.5 px-2 rounded-md cursor-pointer transition-colors ${
                editingVar === b.variable ? 'bg-indigo-500/10 border border-indigo-500/20' : 'hover:bg-white/[0.04]'
              }`}
            >
              <Icon className={`w-3 h-3 shrink-0 ${typeColor} opacity-60`} />
              <span className={`text-[10px] shrink-0 ${typeColor} opacity-50 w-10`}>
                {b.type}
              </span>
              <span className={`flex-1 text-xs font-semibold ${
                b.matched ? 'text-white' : 'text-red-400'
              }`}>
                {columns.find((c) => c.key === b.variable)?.label ?? b.variable}
              </span>
              {hasFormula && <FunctionSquare className="w-3 h-3 text-amber-400/70 shrink-0" />}
              {!b.matched && <span className="text-[9px] text-red-400/50 shrink-0">!</span>}
            </div>
          )
        })}
      </div>

      {/* Éditeur de formule — panneau complet */}
      {editingVar && (
        <div className="mt-2 p-2.5 rounded-lg bg-[#111] border border-white/10">
          {/* Header */}
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <FunctionSquare className="w-3.5 h-3.5 text-indigo-400" />
              <span className="text-[10px] text-white/40 uppercase tracking-wider">Formule</span>
            </div>
            <button onClick={() => setEditingVar(null)} className="text-white/30 hover:text-white/60">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Nom du champ + Type résultat + Décimales */}
          <div className="flex gap-2 mb-3">
            <div className="flex-1 min-w-0">
              <div className="text-[10px] text-white/30 uppercase tracking-wider mb-1">Nom du champ</div>
              <div className="bg-black/40 rounded px-2.5 py-1.5 text-sm text-white font-medium truncate">
                {columns.find((c) => c.key === editingVar)?.label ?? editingVar}
              </div>
            </div>
            <div className="w-28 shrink-0">
              <div className="text-[10px] text-white/30 uppercase tracking-wider mb-1">Type résultat</div>
              <select
                value={configDraft.resultType}
                onChange={(e) => setConfigDraft((d) => ({ ...d, resultType: e.target.value as FormulaResultType, decimals: d.decimals ?? 0 }))}
                className="w-full bg-black/40 border border-white/10 rounded px-2 py-1.5 text-xs text-white focus:border-indigo-500/50 focus:outline-none"
              >
                <option value="auto">Auto</option>
                <option value="number">Nombre</option>
                <option value="text">Texte</option>
              </select>
            </div>
            {configDraft.resultType === 'number' && (
              <div className="w-24 shrink-0">
                <div className="text-[10px] text-white/30 uppercase tracking-wider mb-1">Décimales</div>
                <select
                  value={configDraft.decimals ?? 0}
                  onChange={(e) => setConfigDraft((d) => ({ ...d, decimals: parseInt(e.target.value) }))}
                  className="w-full bg-black/40 border border-white/10 rounded px-2 py-1.5 text-xs text-white focus:border-indigo-500/50 focus:outline-none"
                >
                  {[0, 1, 2, 3, 4].map((d) => (
                    <option key={d} value={d}>{d}{d === 0 ? ' (entier)' : ''}</option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {/* Textarea */}
          <div className="text-[10px] text-white/30 uppercase tracking-wider mb-1">Formule</div>
          <textarea
            ref={textareaRef}
            value={formulaDraft}
            onChange={(e) => setFormulaDraft(e.target.value)}
            className="w-full bg-black/40 border border-indigo-500/30 rounded px-2.5 py-2 text-sm text-white font-mono resize-none focus:border-indigo-500/60 focus:outline-none"
            rows={3}
            placeholder={`[${columns.find((c) => c.key === editingVar)?.label ?? editingVar}]`}
            spellCheck={false}
          />

          {/* Option : supprimer ligne si vide */}
          <label className="flex items-center gap-2 mt-3 px-1 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={!!hideLineIfEmpty[editingVar]}
              onChange={(e) => setHideLineIfEmpty(editingVar, e.target.checked)}
              className="rounded border-white/20 bg-white/5 text-indigo-500 focus:ring-indigo-500/30 w-3.5 h-3.5"
            />
            <span className="text-[11px] text-white/50">Supprimer la ligne si vide</span>
          </label>

          {/* Champs disponibles */}
          <div className="text-[10px] text-white/30 uppercase tracking-wider mt-3 mb-1.5">
            Champs — cliquer pour insérer
          </div>
          <div className="max-h-32 overflow-y-auto space-y-0.5">
            {columns.map((col) => {
              const FIcon = (col.fieldType && FIELD_ICON[col.fieldType]) || Type
              return (
                <button
                  key={col.key}
                  onClick={() => insertAtCursor(`[${col.label}]`)}
                  className="w-full flex items-center gap-2 px-2 py-1 rounded text-left hover:bg-indigo-500/10 transition-colors"
                >
                  <FIcon className="w-3 h-3 text-white/30 shrink-0" />
                  <span className="text-xs text-white/70">{col.label}</span>
                </button>
              )
            })}
          </div>

          {/* Aperçu */}
          {preview.length > 0 && (
            <>
              <div className="text-[10px] text-white/30 uppercase tracking-wider mt-3 mb-1.5">
                Aperçu ({preview.length} premières lignes)
              </div>
              <div className="space-y-0.5">
                {preview.map((val, idx) => (
                  <div key={idx} className="flex items-center gap-2 px-2 py-1 rounded bg-black/20 text-xs">
                    <span className="text-white/20 w-4 text-right shrink-0">{idx + 1}</span>
                    <span className="text-white/70 truncate">{val || '—'}</span>
                  </div>
                ))}
              </div>
            </>
          )}

          {/* Actions */}
          <div className="flex gap-2 mt-3">
            {!!formulas[editingVar] && (
              <button
                onClick={() => { removeFormula(editingVar); removeFormulaConfig(editingVar); setEditingVar(null) }}
                className="text-xs px-3 py-1.5 rounded bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-colors"
              >
                Supprimer
              </button>
            )}
            <button
              onClick={saveFormula}
              className="flex-1 text-xs px-3 py-1.5 rounded bg-indigo-500 hover:bg-indigo-600 text-white font-medium transition-colors"
            >
              Appliquer
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function VariableTags({ columns }: { columns: { key: string; label: string }[] }) {
  if (columns.length === 0) return null

  const insertTag = (key: string) => {
    const tag = `{{${key}}}`
    const canvas = globalFabricCanvas
    if (!canvas) return

    const active = canvas.getActiveObject()

    // Si un Textbox est en mode édition, insérer à la position du curseur
    if (active instanceof Textbox && (active as any).isEditing) {
      const tb = active as any
      const selStart = tb.selectionStart ?? 0
      const selEnd = tb.selectionEnd ?? selStart
      const currentText: string = tb.text ?? ''
      const newText = currentText.slice(0, selStart) + tag + currentText.slice(selEnd)
      tb.text = newText
      tb.selectionStart = selStart + tag.length
      tb.selectionEnd = selStart + tag.length
      tb.dirty = true
      tb.initDimensions()
      canvas.requestRenderAll()
      tb.enterEditing()
      tb.setSelectionStart(selStart + tag.length)
      tb.setSelectionEnd(selStart + tag.length)
      return
    }

    // Si un Textbox est sélectionné (sans mode édition), remplacer son texte par le tag
    if (active instanceof Textbox) {
      if (!active.data) active.data = {}
      active.data.templateText = tag
      delete active.data.templateStyles
      active.set('text', tag)
      ;(active as any).dirty = true
      active.setCoords()
      canvas.requestRenderAll()
      syncToStore(canvas)
      canvas.fire('object:modified', { target: active })
      return
    }

    // Sinon copier dans le presse-papier
    navigator.clipboard.writeText(tag).catch(() => {})
  }

  return (
    <div className="px-3 py-2 border-b border-white/5">
      <div className="text-[10px] text-white/30 uppercase tracking-wider mb-1.5">
        Champs — cliquer pour insérer
      </div>
      <div className="space-y-0.5">
        {columns.map((col) => (
          <button
            key={col.key}
            onMouseDown={(e) => {
              e.preventDefault()
              insertTag(col.key)
            }}
            className="w-full flex items-center gap-2 px-2 py-1.5 rounded hover:bg-indigo-500/10 transition-colors cursor-pointer group text-left"
            title={`Insérer {{${col.key}}}`}
          >
            <span className="text-xs text-white/70 group-hover:text-white flex-1 truncate">{col.label}</span>
            <span className="text-[10px] text-indigo-400/40 group-hover:text-indigo-400/70 font-mono shrink-0">{`{{${col.key}}}`}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

function BindingEditor({ selectedObjectId, columns }: { selectedObjectId: string; columns: { key: string; label: string }[] }) {
  const canvas = globalFabricCanvas
  if (!canvas) return null

  const obj = canvas.getObjects().find((o) => o.data?.id === selectedObjectId)
  if (!obj || obj.data?.isGrid || obj.data?.isPageBg) return null

  const bindableProps: { key: string; label: string; icon: typeof Type }[] = []
  if (obj instanceof FabricImage) {
    bindableProps.push({ key: 'src', label: 'Source image', icon: Image })
  }
  bindableProps.push(
    { key: 'fill', label: 'Couleur de fond', icon: Palette },
    { key: 'stroke', label: 'Contour', icon: Palette },
    { key: 'opacity', label: 'Opacité', icon: Eye },
  )

  const currentBindings = (obj.data?.bindings ?? {}) as Record<string, string>

  const updateBinding = (prop: string, columnKey: string) => {
    if (!obj.data) obj.data = {}
    const bindings = { ...(obj.data.bindings as Record<string, string> ?? {}) }
    if (columnKey === '') {
      delete bindings[prop]
    } else {
      bindings[prop] = columnKey
    }
    obj.data.bindings = bindings
    canvas.requestRenderAll()
  }

  return (
    <div className="px-3 py-2 border-b border-white/5">
      <div className="space-y-1.5">
        {bindableProps.map(({ key, label, icon: Icon }) => (
          <div key={key} className="flex items-center gap-2">
            <Icon className="w-3.5 h-3.5 text-white/25 shrink-0" />
            <span className="text-xs text-white/50 w-20 shrink-0">{label}</span>
            <select
              value={currentBindings[key] ?? ''}
              onChange={(e) => updateBinding(key, e.target.value)}
              className="flex-1 bg-white/5 border border-white/10 rounded px-2 py-1 text-xs text-white hover:border-white/20 transition-colors"
            >
              <option value="">— aucun —</option>
              {columns.map((col) => (
                <option key={col.key} value={col.key}>{col.label}</option>
              ))}
            </select>
          </div>
        ))}
      </div>
    </div>
  )
}
