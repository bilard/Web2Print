import type { CanvasObjectProps } from '@/stores/editor.store'
import { getAutoName } from './getAutoName'

export function getDisplayName(
  obj: CanvasObjectProps,
  columns: { key: string; label: string }[],
): string {
  if (obj.name) {
    const col = columns.find((c) => c.key === obj.name)
    if (col) return col.label
    return obj.name
  }
  return getAutoName(obj.type)
}
