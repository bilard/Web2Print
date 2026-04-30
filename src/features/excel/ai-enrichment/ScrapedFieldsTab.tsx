import { useEffect, useMemo, useState } from 'react'
import { GripVertical, Loader2, Save, Check, ChevronDown, Eye, EyeOff, X, Hash } from 'lucide-react'
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
import { useEnrichmentStore } from './enrichmentStore'
import { enrichmentKey } from './types'
import type { EnrichedProduct } from './types'
import { useMatchingTemplate } from '@/features/scraping-templates/useMatchingTemplate'
import { listTemplates, saveTemplateWithVendorSync } from '@/features/scraping-templates/templatesStore'
import { getVendorFieldRows, type FieldRow } from '@/features/scraping-templates/getVendorFieldRows'
import type { ScrapingTemplate } from '@/features/scraping-templates/types'
import { dispatchAnchorJump } from './anchors'

interface Props {
  sheetName: string
  rowId: string
  url?: string | null
  brand?: string | null
  title?: string | null
}

/**
 * Onglet "Scrapé" de la colonne source : liste tous les champs de la donnée
 * scrapée (template fields + sections synthétiques : images, spécifications,
 * variantes, documents) avec aperçu de la valeur. Drag-and-drop pour trier
 * — l'ordre est persisté dans `vendorFieldOrder` et propagé à tous les
 * templates du même fournisseur. Le panneau d'enrichissement (à droite)
 * se met à jour automatiquement via le listener d'invalidation.
 */
export function ScrapedFieldsTab({ sheetName, rowId, url, brand, title }: Props) {
  const enrichmentData = useEnrichmentStore((s) => s.entries[enrichmentKey(sheetName, rowId)]?.data ?? null)
  const hiddenGroupsState = useEnrichmentStore((s) => s.hiddenGroups[enrichmentKey(sheetName, rowId)])
  const setData = useEnrichmentStore((s) => s.setData)
  const toggleHiddenGroup = useEnrichmentStore((s) => s.toggleHiddenGroup)
  const matchedTemplate = useMatchingTemplate({
    url: url ?? null,
    brand: brand ?? null,
    title: title ?? null,
  })

  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [rows, setRows] = useState<FieldRow[]>([])
  const [vendorTemplates, setVendorTemplates] = useState<ScrapingTemplate[]>([])
  const [initialOrder, setInitialOrder] = useState<string[]>([])

  // Charger les templates du vendor (si matché) + calculer les rows depuis
  // l'enrichissement réel. Fonctionne SANS template : la liste est alors
  // dérivée des sections qui ont du contenu dans la data scrapée.
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    ;(async () => {
      try {
        let vt: ScrapingTemplate[] = []
        if (matchedTemplate) {
          const all = await listTemplates()
          if (cancelled) return
          vt = all.filter((t) => t.vendorDomain === matchedTemplate.vendorDomain)
        }
        if (cancelled) return
        setVendorTemplates(vt)
        const saved = matchedTemplate?.vendorFieldOrder ?? []
        setInitialOrder(saved)
        setRows(getVendorFieldRows(vt, enrichmentData, saved))
      } catch (err) {
        toast.error(`Impossible de charger les templates : ${err instanceof Error ? err.message : String(err)}`)
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [matchedTemplate, enrichmentData])

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }))
  const ids = useMemo(() => rows.map((r) => `sft-${r.key}`), [rows])

  const currentOrder = useMemo(() => rows.map((r) => r.key), [rows])
  const dirty = useMemo(() => {
    if (currentOrder.length !== initialOrder.length) return currentOrder.length > 0 && initialOrder.length !== currentOrder.length
    return currentOrder.some((k, i) => initialOrder[i] !== k)
  }, [currentOrder, initialOrder])

  const handleDragEnd = (e: DragEndEvent) => {
    const { active, over } = e
    if (!over || active.id === over.id) return
    const oldIdx = ids.indexOf(active.id as string)
    const newIdx = ids.indexOf(over.id as string)
    if (oldIdx < 0 || newIdx < 0) return
    setRows((prev) => arrayMove(prev, oldIdx, newIdx))
  }

  const handleSave = async () => {
    if (!matchedTemplate) return
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
      setInitialOrder(nextOrder)
    } catch (err) {
      toast.error(`Sauvegarde échouée : ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setSaving(false)
    }
  }

  // Rien à afficher tant que le scraping n'a pas eu lieu.
  if (!enrichmentData) return null
  if (!loading && rows.length === 0) return null

  if (loading && rows.length === 0) {
    return (
      <div className="flex items-center justify-center py-10 gap-2 text-white/50 text-[11px]">
        <Loader2 className="w-4 h-4 animate-spin" />
        Chargement des champs du fournisseur…
      </div>
    )
  }

  const hasTemplate = !!matchedTemplate

  // Extraire les sources disponibles
  const sourceHost = (() => {
    if (!url) return null
    try { return new URL(url).hostname.replace('www.', '') }
    catch { return null }
  })()
  const additionalSources = enrichmentData?.additionalSources ?? []

  return (
    <div className="flex flex-col py-3 px-4 gap-4">
      {/* Section de sélection des sources */}
      {sourceHost && additionalSources.length > 0 && (
        <div className="border border-amber-500/40 bg-amber-950/30 rounded-lg p-3">
          <p className="text-[10px] font-bold text-amber-300 uppercase tracking-widest mb-2.5">
            Choisir la source
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              className="px-3 py-1.5 rounded-md text-[10px] font-semibold bg-gradient-to-r from-amber-500/40 to-amber-600/20 text-amber-100 border border-amber-500/50 hover:from-amber-500/60 hover:to-amber-600/40 hover:text-white transition-all"
              title={`Source actuelle : ${sourceHost}`}
            >
              {sourceHost}
            </button>
            {additionalSources.map((url, i) => {
              const host = (() => {
                try { return new URL(url).hostname.replace('www.', '') }
                catch { return url }
              })()
              return (
                <button
                  key={i}
                  className="px-3 py-1.5 rounded-md text-[10px] font-semibold bg-white/[0.06] text-white/70 border border-white/[0.12] hover:bg-white/[0.1] hover:text-white/90 hover:border-white/[0.2] transition-all"
                  title={`Basculer vers : ${url}`}
                >
                  {host}
                </button>
              )
            })}
          </div>
        </div>
      )}

      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold text-white/50 uppercase tracking-wider">
            Champs scrapés{hasTemplate ? ` — ${matchedTemplate.vendorDomain}` : ''}
          </p>
          <p className="text-[10px] text-white/30 mt-0.5 leading-relaxed">
            {hasTemplate
              ? `Drag & drop pour réordonner l'affichage dans le panneau droit. L'ordre s'applique à tous les produits de ce fournisseur (${vendorTemplates.length} template${vendorTemplates.length > 1 ? 's' : ''}).`
              : `Aucun template fournisseur — l'ordre affiché correspond à la data scrapée de ce produit.`}
          </p>
        </div>
        {hasTemplate && (
          <button
            onClick={handleSave}
            disabled={saving || !dirty || rows.length === 0}
            className={`shrink-0 inline-flex items-center gap-1 px-2 py-1 rounded text-[10px] transition-colors ${
              dirty && !saving
                ? 'bg-indigo-500/20 text-indigo-200 hover:bg-indigo-500/30 border border-indigo-400/30'
                : 'bg-white/[0.03] text-white/30 border border-white/[0.06] cursor-default'
            }`}
            title={dirty ? 'Enregistrer le nouvel ordre' : 'Aucun changement à enregistrer'}
          >
            {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : dirty ? <Save className="w-3 h-3" /> : <Check className="w-3 h-3" />}
            {saving ? 'Sauvegarde…' : dirty ? 'Enregistrer' : 'À jour'}
          </button>
        )}
      </div>

      {loading && rows.length === 0 ? (
        <div className="flex items-center justify-center py-6 gap-2 text-white/40 text-[11px]">
          <Loader2 className="w-3 h-3 animate-spin" />
          Chargement…
        </div>
      ) : rows.length === 0 ? (
        <p className="text-[11px] text-white/30 italic py-6 text-center">
          Aucun champ à afficher.
        </p>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={ids} strategy={verticalListSortingStrategy}>
            <div className="space-y-1">
              {rows.map((r, i) => {
                const section = r.key === 'specifications' ? 'specifications'
                  : r.key === 'advantages' ? 'advantages' : null
                const subGroups = section && enrichmentData
                  ? getSubGroups(section, enrichmentData)
                  : []
                const hiddenList = section && hiddenGroupsState
                  ? hiddenGroupsState[section] ?? []
                  : []
                return (
                  <SortableRow
                    key={ids[i]}
                    id={ids[i]}
                    row={r}
                    position={i + 1}
                    hasTemplate={hasTemplate}
                    section={section}
                    subGroups={subGroups}
                    hiddenGroups={hiddenList}
                    onToggleHide={(groupName) => section && toggleHiddenGroup(sheetName, rowId, section, groupName)}
                    onDeleteGroup={(groupName) => {
                      if (!section || !enrichmentData) return
                      const next = deleteGroup(section, enrichmentData, groupName)
                      setData(sheetName, rowId, next)
                      toast.success(`Groupe "${groupName || 'sans nom'}" supprimé`)
                    }}
                    onJumpToGroup={(groupName) => {
                      if (!section) return
                      // Auto-révéler un groupe caché : DoneState ne le rend pas
                      // tant qu'il est dans hiddenGroups, donc le scroll
                      // viserait un id inexistant.
                      if (hiddenList.includes(groupName)) {
                        toggleHiddenGroup(sheetName, rowId, section, groupName)
                      }
                      dispatchAnchorJump({ section, group: groupName })
                    }}
                  />
                )
              })}
            </div>
          </SortableContext>
        </DndContext>
      )}
    </div>
  )
}

type GroupSection = 'specifications' | 'advantages'

interface SubGroup {
  /** Nom du groupe (chaîne vide = "sans groupe") */
  name: string
  /** Nombre d'items dans le groupe */
  count: number
}

function getSubGroups(section: GroupSection, data: EnrichedProduct): SubGroup[] {
  const items = section === 'specifications' ? data.specifications : data.advantages
  const map = new Map<string, number>()
  const order: string[] = []
  for (const item of items) {
    const g = item.group ?? ''
    if (!map.has(g)) { map.set(g, 0); order.push(g) }
    map.set(g, (map.get(g) ?? 0) + 1)
  }
  // N'afficher les sous-groupes que s'il y a au moins un groupe nommé.
  const hasNamedGroup = order.some((g) => g.length > 0)
  if (!hasNamedGroup) return []
  return order.map((name) => ({ name, count: map.get(name) ?? 0 }))
}

function deleteGroup(section: GroupSection, data: EnrichedProduct, groupName: string): EnrichedProduct {
  if (section === 'specifications') {
    return { ...data, specifications: data.specifications.filter((s) => (s.group ?? '') !== groupName) }
  }
  return { ...data, advantages: data.advantages.filter((a) => (a.group ?? '') !== groupName) }
}

function SortableRow({
  id,
  row,
  position,
  hasTemplate,
  section,
  subGroups,
  hiddenGroups,
  onToggleHide,
  onDeleteGroup,
  onJumpToGroup,
}: {
  id: string
  row: FieldRow
  position: number
  hasTemplate: boolean
  section: GroupSection | null
  subGroups: SubGroup[]
  hiddenGroups: string[]
  onToggleHide: (groupName: string) => void
  onDeleteGroup: (groupName: string) => void
  onJumpToGroup: (groupName: string) => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id })
  const [expanded, setExpanded] = useState(false)
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }
  const hasSubGroups = !!section && subGroups.length > 0
  const hiddenSet = new Set(hiddenGroups)

  return (
    <div ref={setNodeRef} style={style}>
      <div className="flex items-center gap-2 px-2 py-2 bg-white/[0.03] hover:bg-white/[0.05] border border-white/[0.06] rounded text-[11px] transition-colors">
        <button
          {...attributes}
          {...listeners}
          className="text-white/25 hover:text-white/60 cursor-grab active:cursor-grabbing shrink-0"
          aria-label="Déplacer"
        >
          <GripVertical className="w-3 h-3" />
        </button>
        <span className="w-5 text-right text-[9px] text-white/30 tabular-nums shrink-0">{position}.</span>
        <button
          type="button"
          onClick={() => dispatchAnchorJump({ section: row.key })}
          className="flex-1 min-w-0 flex items-center gap-2 text-left group/anchor cursor-pointer"
          title={`Voir « ${row.label} » dans le panneau de droite`}
        >
          <Hash className="w-2.5 h-2.5 text-white/15 group-hover/anchor:text-indigo-300/80 transition-colors shrink-0" />
          <span className="text-indigo-200/90 font-medium truncate group-hover/anchor:text-indigo-200">{row.label}</span>
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
          {hasTemplate && row.total > 0 && (
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
          )}
        </button>
        {hasSubGroups && (
          <button
            onClick={() => setExpanded((v) => !v)}
            className="shrink-0 text-white/30 hover:text-white/70 transition-colors"
            aria-label={expanded ? 'Réduire les groupes' : 'Afficher les groupes'}
            title={`${subGroups.length} groupe${subGroups.length > 1 ? 's' : ''}`}
          >
            <ChevronDown className={`w-3.5 h-3.5 transition-transform ${expanded ? '' : '-rotate-90'}`} />
          </button>
        )}
      </div>
      {hasSubGroups && expanded && (
        <div className="ml-6 mt-1 space-y-0.5">
          {subGroups.map((g) => {
            const hidden = hiddenSet.has(g.name)
            const displayName = g.name || 'Sans groupe'
            return (
              <div
                key={g.name}
                className={`group flex items-center gap-2 pl-3 pr-2 py-1 border-l border-white/[0.08] text-[10.5px] rounded-r transition-colors ${
                  hidden
                    ? 'bg-white/[0.01] text-white/25'
                    : 'bg-white/[0.02] hover:bg-white/[0.04] text-white/60'
                }`}
              >
                <button
                  type="button"
                  onClick={() => onJumpToGroup(g.name)}
                  className={`flex-1 min-w-0 flex items-center gap-1.5 truncate uppercase tracking-wider text-[9.5px] font-semibold text-left ${g.name ? '' : 'italic'} ${hidden ? 'hover:text-white/50' : 'hover:text-indigo-200'} transition-colors`}
                  title={hidden
                    ? `Afficher « ${displayName} » et y accéder dans le panneau de droite`
                    : `Voir « ${displayName} » dans le panneau de droite`}
                >
                  <Hash className="w-2.5 h-2.5 opacity-40 shrink-0" />
                  <span className="truncate">{displayName}</span>
                </button>
                <span className="shrink-0 text-[9px] text-white/30 tabular-nums">{g.count}</span>
                <button
                  onClick={() => onToggleHide(g.name)}
                  className="shrink-0 p-0.5 text-white/30 hover:text-white/80 transition-colors"
                  title={hidden ? 'Afficher dans le panneau' : 'Cacher dans le panneau'}
                >
                  {hidden ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                </button>
                <button
                  onClick={() => onDeleteGroup(g.name)}
                  className="shrink-0 p-0.5 text-white/25 hover:text-red-400 transition-colors"
                  title="Supprimer ce groupe"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
