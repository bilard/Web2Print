import { useUIStore, type ActiveTool } from '@/stores/ui.store'
import {
  MousePointer2,
  Type,
  Square,
  Circle,
  Minus,
  ImagePlus,
  Hand,
  ZoomIn,
  type LucideIcon,
} from 'lucide-react'

interface ToolButtonProps {
  tool: ActiveTool
  icon: LucideIcon
  tooltip: string
}

function ToolButton({ tool, icon: Icon, tooltip }: ToolButtonProps) {
  const activeTool = useUIStore((s) => s.activeTool)
  const setActiveTool = useUIStore((s) => s.setActiveTool)
  const isActive = activeTool === tool

  return (
    <button
      className={`w-[34px] h-[34px] flex items-center justify-center rounded-md transition-colors ${
        isActive
          ? 'bg-indigo-500/20 text-indigo-400'
          : 'text-white/40 hover:text-white/70 hover:bg-white/5'
      }`}
      title={tooltip}
      onClick={() => setActiveTool(tool)}
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
      <ToolButton tool="image" icon={ImagePlus} tooltip="Image (I)" />

      {/* Separator */}
      <div className="w-6 h-px bg-white/10 my-1" />

      {/* Group 3: Navigation */}
      <ToolButton tool="hand" icon={Hand} tooltip="Main (H)" />
      <ToolButton tool="zoom" icon={ZoomIn} tooltip="Zoom (Z)" />
    </div>
  )
}
