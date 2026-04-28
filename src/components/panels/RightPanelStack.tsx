import type { ComponentType, ReactNode } from 'react'
import {
  DndContext, closestCenter, PointerSensor, useSensor, useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext, verticalListSortingStrategy, arrayMove,
} from '@dnd-kit/sortable'
import { Layers, ImagePlus, Palette, FolderOpen, Database, FileText, Printer } from 'lucide-react'
import { useUIStore } from '@/stores/ui.store'
import { PropertiesPanel } from '@/components/panels/PropertiesPanel'
import { CollapsiblePanel } from '@/components/panels/CollapsiblePanel'
import { LayersPanel } from '@/components/panels/LayersPanel'
import { NanoBanaPanel } from '@/features/nanobana/NanoBanaPanel'
import { PalettePanel } from '@/components/panels/PalettePanel'
import { AssetsPanel } from '@/components/panels/AssetsPanel'
import { PagePanel } from '@/components/panels/PagePanel'
import { PrintPanel } from '@/components/panels/PrintPanel'
import { DataMergePanel } from '@/features/merge/DataMergePanel'

const panelConfig: Record<string, { title: string; icon: ComponentType<{ className?: string }>; content: ReactNode; onHeaderClick?: () => void }> = {
  page:   { title: 'Page',       icon: FileText,   content: <PagePanel /> },
  print:  { title: 'Impression', icon: Printer,    content: <PrintPanel /> },
  data:   { title: 'Données',    icon: Database,   content: <DataMergePanel /> },
  layers: { title: 'Calques',    icon: Layers,     content: <LayersPanel /> },
  images: { title: 'Images',     icon: ImagePlus,  content: <NanoBanaPanel /> },
  palette:{ title: 'Palette',    icon: Palette,    content: <PalettePanel /> },
  assets: { title: 'Assets',     icon: FolderOpen, content: <AssetsPanel /> },
}

export function RightPanelStack() {
  const { rightPanelOpen, rightPanels, setRightPanels, toggleRightPanel } = useUIStore()

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  )

  if (!rightPanelOpen) return null

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIndex = rightPanels.findIndex((p) => p.id === active.id)
    const newIndex = rightPanels.findIndex((p) => p.id === over.id)
    setRightPanels(arrayMove(rightPanels, oldIndex, newIndex))
  }

  return (
    <>
      <div className="w-[300px] bg-[#1a1a1a] border-l border-white/10 flex flex-col shrink-0 overflow-hidden">
        {/* Properties always on top */}
        <div className="shrink-0 overflow-y-auto" style={{ maxHeight: '70%' }}>
          <PropertiesPanel />
        </div>

        {/* Separator */}
        <div className="h-px bg-white/10 shrink-0" />

        {/* Draggable accordion panels */}
        <div className="flex-1 overflow-y-auto">
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={rightPanels.map((p) => p.id)} strategy={verticalListSortingStrategy}>
              {rightPanels.map((panel) => {
                const config = panelConfig[panel.id]
                if (!config) return null
                return (
                  <CollapsiblePanel
                    key={panel.id}
                    id={panel.id}
                    title={config.title}
                    icon={config.icon}
                    collapsed={panel.collapsed}
                    onToggle={() => toggleRightPanel(panel.id)}
                    onHeaderClick={config.onHeaderClick}
                  >
                    {config.content}
                  </CollapsiblePanel>
                )
              })}
            </SortableContext>
          </DndContext>
        </div>
      </div>

    </>
  )
}
