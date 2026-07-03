// src/features/catalog/components/steps/FlatplanBoard.tsx
// Nappe de planches du chemin de fer : pages groupées par doubles pages
// (verso/recto), tri manuel par glisser-déposer (@dnd-kit) des pages d'ouverture
// et de produits — couverture, sommaire et 4e restent verrouillés.
import { DndContext, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core'
import { SortableContext, arrayMove, rectSortingStrategy, useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { CatalogPageDescriptor } from '../../catalogTypes'
import { buildSpreads, isLockedPage } from '../../catalogFlatplan'
import type { CatalogRenderCtx } from '../pages/catalogCss'
import { FlatplanThumb } from './FlatplanThumb'

interface Props {
  pages: CatalogPageDescriptor[]
  keys: string[]
  ctx: CatalogRenderCtx
  colors: Map<string, string>
  thumbWidth: number
  /** Nœud taxonomique sélectionné dans le rail : les autres pages sont estompées. */
  selectedNode: string | null
  onReorder: (order: string[]) => void
  onOpen: (index: number) => void
}

const NEUTRAL = '#64748b'

function pageMatchesNode(page: CatalogPageDescriptor, nodeId: string): boolean {
  if (page.kind === 'opener') return page.nodeId === nodeId
  if (page.kind === 'products') return (page.nodeIds ?? [page.nodeId]).includes(nodeId)
  return false
}

function SortableThumb({ id, locked, children }: { id: string; locked: boolean; children: React.ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id, disabled: locked })
  return (
    <div ref={setNodeRef} {...attributes} {...listeners} data-fpkey={id}
      className={isDragging ? 'z-10 opacity-80' : ''}
      style={{ transform: CSS.Transform.toString(transform), transition, cursor: locked ? undefined : 'grab' }}>
      {children}
    </div>
  )
}

export function FlatplanBoard({ pages, keys, ctx, colors, thumbWidth, selectedNode, onReorder, onOpen }: Props) {
  // distance 5 px avant activation : le simple clic reste un clic (lightbox).
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))
  const sortableKeys = keys.filter((_, i) => !isLockedPage(pages[i]))

  const handleDragEnd = (e: DragEndEvent) => {
    const { active, over } = e
    if (!over || active.id === over.id) return
    const from = sortableKeys.indexOf(String(active.id))
    const to = sortableKeys.indexOf(String(over.id))
    if (from < 0 || to < 0) return
    const middle = arrayMove(sortableKeys, from, to)
    // Ordre complet persisté : verrouillées en tête/queue canoniques + milieu trié.
    const head = keys.filter((_, i) => isLockedPage(pages[i]) && pages[i].kind !== 'back-cover')
    onReorder([...head, ...middle, 'back-cover'])
  }

  const spreads = buildSpreads(pages.length)
  const thumbHeight = thumbWidth * (ctx.format.heightMm / ctx.format.widthMm)

  const renderSlot = (idx: number | null) => {
    if (idx === null) {
      return <div className="rounded-sm border border-dashed border-border/60" style={{ width: thumbWidth, height: thumbHeight }} />
    }
    const page = pages[idx]
    const color = colors.get(page.kind === 'opener' || page.kind === 'products' ? page.nodeId : '') ?? NEUTRAL
    const thumb = (
      <FlatplanThumb page={page} ctx={ctx} color={color} width={thumbWidth}
        dimmed={selectedNode !== null && !pageMatchesNode(page, selectedNode)} onOpen={() => onOpen(idx)} />
    )
    if (isLockedPage(page)) return <div data-fpkey={keys[idx]}>{thumb}</div>
    return <SortableThumb id={keys[idx]} locked={false}>{thumb}</SortableThumb>
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={sortableKeys} strategy={rectSortingStrategy}>
        <div className="flex flex-wrap gap-x-5 gap-y-6 p-4 content-start">
          {spreads.map((sp) => {
            const nums = [sp.left, sp.right].filter((i): i is number => i !== null).map((i) => pages[i].pageNumber)
            return (
              <div key={sp.index} className="flex flex-col gap-1">
                <span className="text-[10px] text-muted-foreground tabular-nums">
                  Planche {sp.index} · p. {nums.join('–')}
                </span>
                <div className="flex gap-[3px] p-1.5 rounded-md bg-surface border border-border/60">
                  {renderSlot(sp.left)}
                  {renderSlot(sp.right)}
                </div>
              </div>
            )
          })}
        </div>
      </SortableContext>
    </DndContext>
  )
}
