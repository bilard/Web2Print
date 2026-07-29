import type { ComponentType, ReactNode } from 'react'
import {
  DndContext, closestCenter, PointerSensor, useSensor, useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext, verticalListSortingStrategy, arrayMove,
} from '@dnd-kit/sortable'
import { Layers, ImagePlus, Palette, FolderOpen, Database, FileText, Printer, Aperture, History } from 'lucide-react'
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
import { Animation3DPanel } from '@/components/panels/Animation3DPanel'
import { VersionsPanel } from '@/components/panels/VersionsPanel'
import { useTranslation, type TranslationKey } from '@/lib/i18n'

const panelConfig: Record<string, { titleKey: TranslationKey; icon: ComponentType<{ className?: string }>; content: ReactNode; onHeaderClick?: () => void }> = {
  page:        { titleKey: 'rightPanel.page',         icon: FileText,   content: <PagePanel /> },
  print:       { titleKey: 'rightPanel.print',   icon: Printer,    content: <PrintPanel /> },
  data:        { titleKey: 'rightPanel.data',      icon: Database,   content: <DataMergePanel /> },
  layers:      { titleKey: 'rightPanel.layers',      icon: Layers,     content: <LayersPanel /> },
  images:      { titleKey: 'rightPanel.images',       icon: ImagePlus,  content: <NanoBanaPanel /> },
  palette:     { titleKey: 'rightPanel.palette',      icon: Palette,    content: <PalettePanel /> },
  assets:      { titleKey: 'rightPanel.assets',       icon: FolderOpen, content: <AssetsPanel /> },
  animation3d: { titleKey: 'rightPanel.animation3d', icon: Aperture,   content: <Animation3DPanel /> },
  versions:    { titleKey: 'rightPanel.versions',     icon: History,    content: <VersionsPanel /> },
}

export function RightPanelStack() {
  const { t } = useTranslation()
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
      <div data-tour="right-panel" className="w-[300px] bg-surface border-l border-white/10 flex flex-col shrink-0 overflow-hidden">
        {/* Properties always on top */}
        <div data-tour="properties" className="shrink-0 overflow-y-auto" style={{ maxHeight: '70%' }}>
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
                    title={t(config.titleKey)}
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
