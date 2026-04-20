import type { CanvasObjectProps } from '@/stores/editor.store'
import { getAutoName } from './getAutoName'

function textPreview(text: string): string {
  const firstLine = text.split(/\r?\n/)[0]?.trim() ?? ''
  if (!firstLine) return ''
  const collapsed = firstLine.replace(/\s+/g, ' ')
  return collapsed.length > 40 ? collapsed.slice(0, 40) + '…' : collapsed
}

export function getDisplayName(
  obj: CanvasObjectProps,
  columns: { key: string; label: string }[],
): string {
  if (obj.name) {
    const col = columns.find((c) => c.key === obj.name)
    if (col) return col.label
    return obj.name
  }
  if (obj.type === 'text' && typeof obj.text === 'string') {
    const preview = textPreview(obj.text)
    if (preview) return preview
  }
  return getAutoName(obj.type)
}
