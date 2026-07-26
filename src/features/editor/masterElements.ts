// « Master pages » v1 : répéter un objet (logo, pagination, mentions…) sur
// toutes les pages du document. L'objet porte un data.masterId ; ré-appliquer
// remplace les copies existantes sur chaque page (positions/styles resynchronisés).
import type { FabricObject } from 'fabric'
import { usePagesStore } from '@/stores/pages.store'
import { globalFabricCanvas, globalSnapshot } from './CanvasContainer'
import { syncToStore } from './useAddObject'
import { FABRIC_SERIALIZED_PROPS } from './serializationProps'

interface SerializedObject {
  data?: { masterId?: string }
}

/**
 * Insère (ou remplace) l'objet maître dans le JSON sérialisé d'une page.
 * Pur — retourne le nouveau JSON, ou null si le JSON est illisible.
 */
export function upsertMasterObject(
  canvasJSON: string,
  masterId: string,
  objJson: unknown,
): string | null {
  try {
    const json = JSON.parse(canvasJSON) as { objects?: SerializedObject[] }
    const objects = (json.objects ?? []).filter((o) => o?.data?.masterId !== masterId)
    objects.push(objJson as SerializedObject)
    return JSON.stringify({ ...json, objects })
  } catch {
    return null
  }
}

/** Retire l'objet maître du JSON sérialisé d'une page. Pur. */
export function removeMasterObject(canvasJSON: string, masterId: string): string | null {
  try {
    const json = JSON.parse(canvasJSON) as { objects?: SerializedObject[] }
    const objects = (json.objects ?? []).filter((o) => o?.data?.masterId !== masterId)
    return JSON.stringify({ ...json, objects })
  } catch {
    return null
  }
}

export interface RepeatResult {
  applied: number
  /** Pages jamais visitées (canvasJSON null) — l'élément n'y est pas posé. */
  skipped: number
}

/** Répète l'objet sélectionné sur toutes les autres pages (remplace les copies). */
export function repeatSelectedOnAllPages(): RepeatResult | null {
  const canvas = globalFabricCanvas
  if (!canvas) return null
  if (canvas.getActiveObjects().length !== 1) return null
  const obj = canvas.getActiveObject() as FabricObject | undefined
  if (!obj) return null

  const data = (obj.data ?? {}) as Record<string, unknown>
  const masterId = (data.masterId as string | undefined) ?? (data.id as string | undefined) ?? `master_${Date.now()}`
  obj.set({ data: { ...data, id: data.id ?? masterId, masterId } })
  const objJson = obj.toObject(FABRIC_SERIALIZED_PROPS)

  const { pages, currentPageIndex, updatePage } = usePagesStore.getState()
  let applied = 0
  let skipped = 0
  pages.forEach((p, idx) => {
    if (idx === currentPageIndex) return
    if (!p.canvasJSON) {
      skipped++
      return
    }
    const next = upsertMasterObject(p.canvasJSON, masterId, objJson)
    if (next) {
      updatePage(p.id, { canvasJSON: next })
      applied++
    } else {
      skipped++
    }
  })
  syncToStore(canvas)
  globalSnapshot?.()
  return { applied, skipped }
}

/** Retire les copies de l'objet sélectionné des autres pages (la sélection reste). */
export function removeSelectedFromOtherPages(): number {
  const canvas = globalFabricCanvas
  const obj = canvas?.getActiveObject() as FabricObject | undefined
  const masterId = (obj?.data as Record<string, unknown> | undefined)?.masterId as string | undefined
  if (!masterId) return 0
  const { pages, currentPageIndex, updatePage } = usePagesStore.getState()
  let removed = 0
  pages.forEach((p, idx) => {
    if (idx === currentPageIndex || !p.canvasJSON) return
    const next = removeMasterObject(p.canvasJSON, masterId)
    if (next && next !== p.canvasJSON) {
      updatePage(p.id, { canvasJSON: next })
      removed++
    }
  })
  return removed
}
