import { useState, useRef, useEffect } from 'react'
import { useUIStore, type ActiveTool } from '@/stores/ui.store'
import { useDamStore } from '@/stores/dam.store'
import type { DamTab } from '@/features/dam/types'
import { useAddObject } from '@/features/editor/useAddObject'
import {
  MousePointer2,
  Type,
  Square,
  Circle,
  Minus,
  Image as ImageIcon,
  Search,
  Upload,
  Sparkles,
  FolderOpen,
  type LucideIcon,
} from 'lucide-react'

/** Map tools to the shape type they create (null = no auto-create) */
const TOOL_SHAPE_MAP: Partial<Record<ActiveTool, string>> = {
  text: 'text',
  rect: 'rect',
  ellipse: 'ellipse',
  line: 'line',
}

const IMAGE_MENU_ITEMS: { id: DamTab; icon: typeof Search; label: string }[] = [
  { id: 'stock', icon: Search, label: 'Stock images' },
  { id: 'my-images', icon: FolderOpen, label: 'Mes images' },
  { id: 'recent', icon: Upload, label: 'Uploader' },
  { id: 'generate', icon: Sparkles, label: 'Générer (IA)' },
]

interface ToolButtonProps {
  tool: ActiveTool
  icon: LucideIcon
  tooltip: string
}

function ToolButton({ tool, icon: Icon, tooltip }: ToolButtonProps) {
  const activeTool = useUIStore((s) => s.activeTool)
  const setActiveTool = useUIStore((s) => s.setActiveTool)
  const toggleRightPanel = useUIStore((s) => s.toggleRightPanel)
  const rightPanels = useUIStore((s) => s.rightPanels)
  const { addObject } = useAddObject()
  const isActive = activeTool === tool

  const handleClick = () => {
    setActiveTool(tool)

    // Creation tools: add shape immediately then switch back to select
    const shapeType = TOOL_SHAPE_MAP[tool]
    if (shapeType) {
      addObject(shapeType)
      setActiveTool('select')
      return
    }

    // Image tool: open the Images panel in the right stack
    if (tool === 'image') {
      const imagesPanel = rightPanels.find((p) => p.id === 'images')
      if (imagesPanel?.collapsed) {
        toggleRightPanel('images')
      }
      setActiveTool('select')
    }
  }

  return (
    <button
      className={`w-[34px] h-[34px] flex items-center justify-center rounded-md transition-colors ${
        isActive
          ? 'bg-indigo-500/20 text-indigo-400'
          : 'text-white/40 hover:text-white/70 hover:bg-white/5'
      }`}
      title={tooltip}
      onClick={handleClick}
    >
      <Icon className="w-4 h-4" />
    </button>
  )
}

function ImageMenuButton() {
  const [open, setOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const setDamPickerOpen = useUIStore((s) => s.setDamPickerOpen)
  const setActiveDamTab = useDamStore((s) => s.setActiveTab)

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const handleSelect = (tab: DamTab) => {
    setActiveDamTab(tab)
    setDamPickerOpen(true)
    setOpen(false)
  }

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={() => setOpen((prev) => !prev)}
        title="Image (I)"
        className={`w-8 h-8 flex items-center justify-center rounded transition ${
          open ? 'bg-indigo-500/20 text-indigo-400' : 'text-white/40 hover:text-white/70 hover:bg-white/5'
        }`}
      >
        <ImageIcon className="w-4 h-4" />
      </button>

      {open && (
        <div className="absolute left-full top-0 ml-2 bg-[#1a1a1a] border border-white/10 rounded-lg py-1 w-[170px] shadow-xl z-50">
          {IMAGE_MENU_ITEMS.map((item) => (
            <button
              key={item.id}
              onClick={() => handleSelect(item.id)}
              className="flex items-center gap-2.5 w-full px-3 py-2 text-[11px] text-white/70 hover:bg-white/5 hover:text-white transition text-left"
            >
              <item.icon className="w-4 h-4 text-white/40" />
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export function ToolBar() {
  return (
    <div className="w-11 bg-[#1a1a1a] border-r border-white/10 flex flex-col items-center py-2 gap-0.5 shrink-0">
      {/* Group 1: Selection */}
      <ToolButton tool="select" icon={MousePointer2} tooltip="Sélection (V)" />

      {/* Separator */}
      <div className="w-6 h-px bg-white/10 my-1" />

      {/* Group 2: Creation */}
      <ToolButton tool="text" icon={Type} tooltip="Texte (T)" />
      <ToolButton tool="rect" icon={Square} tooltip="Rectangle (R)" />
      <ToolButton tool="ellipse" icon={Circle} tooltip="Ellipse (E)" />
      <ToolButton tool="line" icon={Minus} tooltip="Ligne (L)" />

      {/* Separator */}
      <div className="w-6 h-px bg-white/10 my-1" />

      {/* Group 3: Image */}
      <ImageMenuButton />
    </div>
  )
}
