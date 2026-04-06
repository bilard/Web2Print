import { Layers, Type, Shapes, Settings, Square, Palette, FolderOpen, ImagePlus } from 'lucide-react'
import { useUIStore } from '@/stores/ui.store'
import type { LeftPanelId } from '@/stores/ui.store'
import { ElementsPanel } from './ElementsPanel'
import { LayersPanel } from './LayersPanel'
import { TextPanel } from './TextPanel'
import { ShapesPanel } from './ShapesPanel'
import { PalettePanel } from './PalettePanel'
import { AssetsPanel } from './AssetsPanel'
import { NanoBanaPanel } from '@/features/nanobana/NanoBanaPanel'

type TabId = LeftPanelId

const tabs: { id: TabId; icon: React.ComponentType<{ className?: string }>; label: string }[] = [
  { id: 'elements', icon: Square,    label: 'Éléments' },
  { id: 'text',     icon: Type,      label: 'Textes'   },
  { id: 'nanobana', icon: ImagePlus, label: 'Images'   },
  { id: 'shapes',   icon: Shapes,    label: 'Formes'   },
  { id: 'palette',  icon: Palette,   label: 'Palette'  },
  { id: 'layers',   icon: Layers,    label: 'Calques'  },
  { id: 'assets',   icon: FolderOpen,label: 'Assets'   },
]

function getPanelContent(id: TabId): React.ReactNode {
  switch (id) {
    case 'elements': return <ElementsPanel />
    case 'text':     return <TextPanel />
    case 'nanobana': return <NanoBanaPanel />
    case 'shapes':   return <ShapesPanel />
    case 'palette':  return <PalettePanel />
    case 'layers':   return <LayersPanel />
    case 'assets':   return <AssetsPanel />
    default:         return null
  }
}

export function LeftSidebar() {
  const { activeLeftPanel, toggleLeftPanel, setSettingsOpen } = useUIStore()

  return (
    <div className="flex h-full shrink-0">
      {/* Icon bar */}
      <div className="w-14 bg-[#1a1a1a] border-r border-white/10 flex flex-col items-center py-2 gap-1 shrink-0">
        {tabs.map(({ id, icon: Icon, label }) => (
          <button
            key={id}
            onClick={() => toggleLeftPanel(id)}
            title={label}
            className={`w-10 h-10 rounded-lg flex flex-col items-center justify-center gap-0.5 transition-all ${
              activeLeftPanel === id
                ? 'bg-indigo-500/20 text-indigo-400'
                : 'text-white/30 hover:text-white/70 hover:bg-white/5'
            }`}
          >
            <Icon className="w-4 h-4" />
            <span className="text-[9px] leading-none">{label.slice(0, 6)}</span>
          </button>
        ))}

        <div className="flex-1" />

        <button
          onClick={() => setSettingsOpen(true)}
          title="Paramètres"
          className="w-10 h-10 rounded-lg flex items-center justify-center text-white/30 hover:text-white/70 hover:bg-white/5 transition-all"
        >
          <Settings className="w-4 h-4" />
        </button>
      </div>

      {/* Expandable panel */}
      <div
        className={`bg-[#161616] border-r border-white/10 transition-all duration-200 ${
          activeLeftPanel ? 'w-64 overflow-y-auto' : 'w-0 overflow-hidden'
        }`}
      >
        {activeLeftPanel && (
          <div className="w-64">
            <div className="px-3 py-2.5 border-b border-white/5 sticky top-0 bg-[#161616] z-10">
              <h3 className="text-xs font-semibold text-white/60 uppercase tracking-wider">
                {tabs.find((t) => t.id === activeLeftPanel)?.label}
              </h3>
            </div>
            {getPanelContent(activeLeftPanel)}
          </div>
        )}
      </div>
    </div>
  )
}
