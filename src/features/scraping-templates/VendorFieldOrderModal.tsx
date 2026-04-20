import { useEffect, useMemo, useState } from 'react'
import { GripVertical, X, Loader2, ListOrdered } from 'lucide-react'
import {
  DndContext, closestCenter, PointerSensor,
  useSensor, useSensors, type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext, verticalListSortingStrategy,
  useSortable, arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { toast } from 'sonner'
import type { ScrapingTemplate } from './types'
import type { EnrichedProduct } from '@/features/excel/ai-enrichment/types'
import { listTemplates, saveTemplateWithVendorSync } from './templatesStore'
import { getVendorFieldRows, type FieldRow } from './getVendorFieldRows'

interface Props {
  matchedTemplate: ScrapingTemplate
  /** Enrichissement courant — permet d'afficher l'aperçu de la valeur scrapée
   *  à côté de chaque champ pour trier en connaissance de cause. */
  enriched?: EnrichedProduct | null
  onClose: () => void
  onSaved: () => void
}

/**
 * Modal vendor-scoped : tous les champs rendus par l'EnrichmentPanel (fields
 * de template + sections synthétiques comme images/specifications/variantes)
 * avec aperçu de la valeur scrapée. Drag-and-drop pour réordonner. L'ordre
 * est sauvé dans `vendorFieldOrder` et propagé à tous les templates du
 * vendor via saveTemplateWithVendorSync.
 */
export function VendorFieldOrderModal({ matchedTemplate, enriched, onClose, onSaved }: Props) {
  const vendorDomain = matchedTemplate.vendorDomain
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [rows, setRows] = useState<FieldRow[]>([])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setLoading(true)
      try {
        const all = await listTemplates()
        if (cancelled) return
        const vendorTemplates = all.filter((t) => t.vendorDomain === vendorDomain)
        setRows(getVendorFieldRows(vendorTemplates, enriched ?? null, matchedTemplate.vendorFieldOrder ?? []))
      } catch (err) {
        if (!cancelled) toast.error(`Impossible de charger les templates : ${err instanceof Error ? err.message : String(err)}`)
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [vendorDomain, matchedTemplate.vendorFieldOrder, enriched])

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }))
  const ids = useMemo(() => rows.map((r) => `vfo-${r.key}`), [rows])

  const handleDragEnd = (e: DragEndEvent) => {
    const { active, over } = e
    if (!over || active.id === over.id) return
    const oldIdx = ids.indexOf(active.id as string)
    const newIdx = ids.indexOf(over.id as string)
    if (oldIdx < 0 || newIdx < 0) return
    setRows((prev) => arrayMove(prev, oldIdx, newIdx))
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      const nextOrder = rows.map((r) => r.key)
      const updated: ScrapingTemplate = {
        ...matchedTemplate,
        vendorFieldOrder: nextOrder,
        updatedAt: Date.now(),
      }
      const { syncedCount } = await saveTemplateWithVendorSync(updated)
      toast.success(
        syncedCount > 0
          ? `Ordre enregistré — propagé à ${syncedCount} autre(s) template(s) du fournisseur`
          : `Ordre enregistré`,
      )
      onSaved()
      onClose()
    } catch (err) {
      toast.error(`Sauvegarde échouée : ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      className="fixed inset-0 bg-black/70 flex items-center justify-center z-50"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-[#1a1a1a] border border-white/10 rounded-lg w-full max-w-xl flex flex-col max-h-[85vh]"
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.06] shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-md bg-indigo-500/15 border border-indigo-400/30 flex items-center justify-center">
              <ListOrdered className="w-3.5 h-3.5 text-indigo-300" />
            </div>
            <div>
              <h3 className="text-[13px] font-semibold text-white/90">Ordre d'affichage — {vendorDomain}</h3>
              <p className="text-[10px] text-white/40 mt-0.5">
                S'applique à tous les produits de ce fournisseur. Drag & drop pour réordonner.
              </p>
            </div>
          </div>
          <button onClick={onClose} className="text-white/40 hover:text-white/80 shrink-0">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-3">
          {loading ? (
            <div className="flex items-center justify-center py-10 gap-2 text-white/50 text-[11px]">
              <Loader2 className="w-4 h-4 animate-spin" />
              Chargement des champs du fournisseur…
            </div>
          ) : rows.length === 0 ? (
            <p className="text-[11px] text-white/40 italic py-6 text-center">
              Aucun champ à afficher.
            </p>
          ) : (
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext items={ids} strategy={verticalListSortingStrategy}>
                <div className="space-y-1">
                  {rows.map((r, i) => (
                    <SortableRow key={ids[i]} id={ids[i]} row={r} position={i + 1} />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-white/[0.06] shrink-0">
          <button
            onClick={onClose}
            disabled={saving}
            className="px-3 py-1.5 rounded text-[11px] text-white/60 hover:text-white/90 hover:bg-white/5 transition-colors disabled:opacity-50"
          >
            Annuler
          </button>
          <button
            onClick={handleSave}
            disabled={loading || saving || rows.length === 0}
            className="px-3 py-1.5 rounded text-[11px] bg-indigo-500/20 text-indigo-200 hover:bg-indigo-500/30 border border-indigo-400/30 disabled:opacity-50 inline-flex items-center gap-1.5 transition-colors"
          >
            {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <ListOrdered className="w-3 h-3" />}
            Enregistrer
          </button>
        </div>
      </div>
    </div>
  )
}

function SortableRow({ id, row, position }: { id: string; row: FieldRow; position: number }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id })
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }
  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-2 px-2 py-2 bg-white/[0.03] hover:bg-white/[0.05] border border-white/[0.06] rounded text-[11px] transition-colors"
    >
      <button
        {...attributes}
        {...listeners}
        className="text-white/25 hover:text-white/60 cursor-grab active:cursor-grabbing shrink-0"
        aria-label="Déplacer"
      >
        <GripVertical className="w-3 h-3" />
      </button>
      <span className="w-5 text-right text-[9px] text-white/30 tabular-nums shrink-0">{position}.</span>
      <div className="flex-1 min-w-0 flex items-center gap-2">
        <span className="text-indigo-200/90 font-medium truncate">{row.label}</span>
        {row.count !== null && (
          <span
            className={`shrink-0 px-1.5 py-0.5 rounded text-[9px] tabular-nums border ${
              row.count > 0
                ? 'bg-indigo-500/10 text-indigo-300/90 border-indigo-400/20'
                : 'bg-white/[0.03] text-white/30 border-white/[0.06]'
            }`}
            title={`${row.count} item${row.count > 1 ? 's' : ''} scrapé${row.count > 1 ? 's' : ''}`}
          >
            {row.count}
          </span>
        )}
        <span
          className={`shrink-0 px-1.5 py-0.5 rounded text-[9px] tabular-nums border ${
            row.shared
              ? 'bg-emerald-500/10 text-emerald-300/80 border-emerald-500/20'
              : 'bg-amber-500/10 text-amber-300/80 border-amber-500/20'
          }`}
          title={row.shared ? 'Présent dans tous les templates du fournisseur' : 'Présent dans une partie des templates uniquement'}
        >
          {row.used}/{row.total}
        </span>
      </div>
    </div>
  )
}
