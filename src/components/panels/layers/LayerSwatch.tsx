import {
  Square, Circle, Type, Image as ImageIcon, Minus, Layers,
} from 'lucide-react'
import { getLayerSwatchColor } from '@/features/editor/getLayerSwatchColor'
import type { CanvasObjectProps } from '@/stores/editor.store'

const typeIcons: Partial<Record<CanvasObjectProps['type'], React.ComponentType<{ className?: string }>>> = {
  rect: Square, ellipse: Circle, text: Type, image: ImageIcon,
  path: Square, line: Minus, group: Layers, polygon: Square, triangle: Square,
}

interface Props {
  obj: CanvasObjectProps
}

export function LayerSwatch({ obj }: Props) {
  const swatch = getLayerSwatchColor(obj)
  const Icon = typeIcons[obj.type] ?? Square

  const bg =
    swatch.kind === 'solid' ? swatch.color :
    swatch.kind === 'group' ? 'linear-gradient(135deg, #6366f1 0%, #4338ca 100%)' :
    swatch.kind === 'none' ?
      'linear-gradient(135deg, #fff 0%, #fff 45%, #ef4444 45%, #ef4444 55%, #fff 55%)' :
    'repeating-conic-gradient(#444 0% 25%, #222 0% 50%) 50% / 6px 6px'

  return (
    <div className="relative w-3.5 h-3.5 shrink-0">
      <div
        className="absolute inset-0 rounded-sm border border-white/20"
        style={{ background: bg }}
      />
      <Icon
        className="absolute -right-0.5 -bottom-0.5 w-2.5 h-2.5 text-white/90"
        style={{ filter: 'drop-shadow(0 0 1px rgba(0,0,0,0.8))' }}
      />
    </div>
  )
}
