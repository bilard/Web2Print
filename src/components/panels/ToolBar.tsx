import { useUIStore, type ActiveTool } from '@/stores/ui.store'
import { useAddObject } from '@/features/editor/useAddObject'
import {
  MousePointer2,
  Type,
  Square,
  Circle,
  Minus,
  ImagePlus,
  type LucideIcon,
} from 'lucide-react'

/** Map tools to the shape type they create (null = no auto-create) */
const TOOL_SHAPE_MAP: Partial<Record<ActiveTool, string>> = {
  text: 'text',
  rect: 'rect',
  ellipse: 'ellipse',
  line: 'line',
}

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
    </div>
  )
}
