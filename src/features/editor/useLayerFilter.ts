import { useMemo } from 'react'
import { getDisplayName } from './getDisplayName'
import type { CanvasObjectProps } from '@/stores/editor.store'

export function normalizeForSearch(s: string): string {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
}

interface FilterResult {
  filtered: CanvasObjectProps[]
  forceExpandedIds: Set<string>
}

export function filterLayers(
  objects: CanvasObjectProps[],
  query: string,
  columns: { key: string; label: string }[],
): FilterResult {
  const q = normalizeForSearch(query.trim())
  if (!q) return { filtered: objects, forceExpandedIds: new Set() }

  const forceExpandedIds = new Set<string>()

  function filterNode(obj: CanvasObjectProps): CanvasObjectProps | null {
    const label = normalizeForSearch(getDisplayName(obj, columns))
    const selfMatch = label.includes(q)
    const filteredChildren = (obj.children ?? [])
      .map(filterNode)
      .filter((c): c is CanvasObjectProps => c !== null)
    if (selfMatch || filteredChildren.length > 0) {
      if (filteredChildren.length > 0) forceExpandedIds.add(obj.id)
      return filteredChildren.length > 0 || obj.children
        ? { ...obj, children: filteredChildren.length > 0 ? filteredChildren : obj.children }
        : obj
    }
    return null
  }

  const filtered = objects.map(filterNode).filter((o): o is CanvasObjectProps => o !== null)
  return { filtered, forceExpandedIds }
}

export function useLayerFilter(
  objects: CanvasObjectProps[],
  query: string,
  columns: { key: string; label: string }[],
): FilterResult {
  return useMemo(() => filterLayers(objects, query, columns), [objects, query, columns])
}
