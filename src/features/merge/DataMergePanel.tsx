import { useState, useMemo } from 'react'
import { Textbox, FabricImage } from 'fabric'
import { ChevronLeft, ChevronRight, Unlink, Rocket } from 'lucide-react'
import { globalFabricCanvas } from '@/features/editor/CanvasContainer'
import { useEditorStore } from '@/stores/editor.store'
import { useMergeStore } from '@/stores/merge.store'
import { useDataMerge } from './useDataMerge'
import { hasPlaceholders } from './mergeEngine'
import { DataSourcePicker } from './DataSourcePicker'
import { ExportModal } from './ExportModal'

export function DataMergePanel() {
  const { isConnected, dataSource, columns, currentRowIndex, totalRows, nextRow, prevRow, disconnectSource } =
    useDataMerge()
  const selectedObjectId = useEditorStore((s) => s.selectedObjectId)
  const [exportOpen, setExportOpen] = useState(false)

  if (!isConnected) {
    return <DataSourcePicker />
  }

  return (
    <div className="text-sm">
      {/* Source info */}
      <div className="px-3 py-2 flex items-center justify-between border-b border-white/5">
        <span className="text-white/70 truncate flex-1">
          <span className="text-indigo-400 font-medium">{dataSource?.fileName}</span>
        </span>
        <span className="text-xs text-white/30 ml-2 shrink-0">{totalRows} lignes</span>
      </div>

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
      <ActiveBindings />

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

function ActiveBindings() {
  const canvas = globalFabricCanvas
  const { isConnected } = useMergeStore()

  const bindings = useMemo(() => {
    if (!canvas || !isConnected) return []
    const result: { name: string; type: string; variables: string[] }[] = []

    for (const obj of canvas.getObjects()) {
      if (obj.data?.isGrid || obj.data?.isPageBg) continue
      const name = (obj.data?.name ?? obj.type ?? 'Objet') as string

      if (obj instanceof Textbox && obj.data?.templateText && hasPlaceholders(obj.data.templateText as string)) {
        const vars = (obj.data.templateText as string).match(/\{\{(\w+)\}\}/g)?.map((m: string) => m.slice(2, -2)) ?? []
        result.push({ name, type: 'texte', variables: vars })
      }

      const b = obj.data?.bindings as Record<string, string> | undefined
      if (b) {
        for (const [prop, col] of Object.entries(b)) {
          result.push({ name, type: prop, variables: [col] })
        }
      }
    }
    return result
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canvas, isConnected])

  if (bindings.length === 0) {
    return (
      <div className="px-3 py-3 border-b border-white/5">
        <p className="text-xs text-white/30 text-center">
          Aucune liaison. Tapez {'{{colonne}}'} dans un texte ou liez une propriété ci-dessous.
        </p>
      </div>
    )
  }

  return (
    <div className="px-3 py-2 border-b border-white/5">
      <div className="text-[10px] text-white/30 uppercase tracking-wider mb-1.5">Liaisons actives</div>
      <div className="space-y-1">
        {bindings.map((b, i) => (
          <div key={i} className="flex items-center justify-between text-xs">
            <span className="text-white/60 truncate">
              {b.name} → <code className="text-indigo-400">{b.variables.join(', ')}</code>
            </span>
            <span className={`text-[10px] shrink-0 ml-2 ${
              b.type === 'texte' ? 'text-green-400' :
              b.type === 'src' ? 'text-blue-400' : 'text-amber-400'
            }`}>
              {b.type}
            </span>
          </div>
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

  const bindableProps: { key: string; label: string }[] = []
  if (obj instanceof FabricImage) {
    bindableProps.push({ key: 'src', label: 'Source image' })
  }
  bindableProps.push(
    { key: 'fill', label: 'Couleur de fond' },
    { key: 'stroke', label: 'Contour' },
    { key: 'opacity', label: 'Opacité' },
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
      <div className="text-[10px] text-white/30 uppercase tracking-wider mb-1.5">
        Lier une propriété — {(obj.data?.name ?? obj.type) as string}
      </div>
      <div className="space-y-1.5">
        {bindableProps.map(({ key, label }) => (
          <div key={key} className="flex items-center gap-2">
            <span className="text-xs text-white/50 w-24 shrink-0">{label}</span>
            <select
              value={currentBindings[key] ?? ''}
              onChange={(e) => updateBinding(key, e.target.value)}
              className="flex-1 bg-white/5 border border-white/10 rounded px-2 py-1 text-xs text-white"
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
