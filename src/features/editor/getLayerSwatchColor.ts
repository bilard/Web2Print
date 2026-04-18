import type { CanvasObjectProps } from '@/stores/editor.store'

export type LayerSwatch =
  | { kind: 'solid'; color: string }
  | { kind: 'image' }
  | { kind: 'none' }
  | { kind: 'group' }

export function getLayerSwatchColor(obj: CanvasObjectProps): LayerSwatch {
  if (obj.type === 'group') return { kind: 'group' }
  const t = obj.fillType ?? 'solid'
  if (t === 'image') return { kind: 'image' }
  if (t === 'none') return { kind: 'none' }
  if (t === 'gradient' && obj.gradient && obj.gradient.stops.length > 0) {
    return { kind: 'solid', color: obj.gradient.stops[0].color }
  }
  return { kind: 'solid', color: obj.fill || '#000000' }
}
