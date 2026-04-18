import { useCallback } from 'react'
import { Group } from 'fabric'
import { globalFabricCanvas } from './CanvasContainer'
import { useEditorStore } from '@/stores/editor.store'
import { syncToStore } from './useAddObject'
import type { FabricObject } from 'fabric'

/** Cherche un objet par id récursivement (top-level + enfants de groupes) */
function findById(objects: FabricObject[], id: string): FabricObject | undefined {
  for (const o of objects) {
    if ((o as any).data?.id === id) return o
    if (o instanceof Group) {
      const found = findById(o.getObjects(), id)
      if (found) return found
    }
  }
  return undefined
}

/** Cherche le groupe parent contenant l'objet avec cet id */
function findParentGroup(objects: FabricObject[], id: string): Group | undefined {
  for (const o of objects) {
    if (o instanceof Group) {
      if (o.getObjects().some((c) => (c as any).data?.id === id)) return o
      const found = findParentGroup(o.getObjects(), id)
      if (found) return found
    }
  }
  return undefined
}

export function useLayers() {
  const { setSelectedObjectId, setCanvasObjects, selectedObjectIds, setSelectedObjectIds } = useEditorStore()

  const selectLayer = useCallback((id: string) => {
    const canvas = globalFabricCanvas
    if (!canvas) return
    const allObjs = canvas.getObjects()
    // Cherche d'abord en top-level
    const topLevel = allObjs.find((o) => (o as any).data?.id === id)
    if (topLevel) {
      canvas.setActiveObject(topLevel)
      canvas.requestRenderAll()
      setSelectedObjectId(id)
      return
    }
    // Sinon, si l'objet est dans un groupe, sélectionne le groupe parent
    const parentGroup = findParentGroup(allObjs, id)
    if (parentGroup) {
      canvas.setActiveObject(parentGroup)
      canvas.requestRenderAll()
      setSelectedObjectId((parentGroup as any).data?.id ?? null)
    }
  }, [setSelectedObjectId])

  const deleteLayer = useCallback((id: string) => {
    const canvas = globalFabricCanvas
    if (!canvas) return
    const allObjs = canvas.getObjects()
    const topLevel = allObjs.find((o) => (o as any).data?.id === id)
    if (topLevel) {
      canvas.remove(topLevel)
      canvas.discardActiveObject()
      canvas.requestRenderAll()
      syncToStore(canvas)
      setSelectedObjectId(null)
      return
    }
    // Suppression d'un enfant de groupe
    const parentGroup = findParentGroup(allObjs, id)
    if (parentGroup) {
      const child = parentGroup.getObjects().find((c) => (c as any).data?.id === id)
      if (child) {
        parentGroup.remove(child)
        canvas.requestRenderAll()
        syncToStore(canvas)
      }
    }
  }, [setSelectedObjectId])

  const toggleVisibility = useCallback((id: string) => {
    const canvas = globalFabricCanvas
    if (!canvas) return
    const obj = findById(canvas.getObjects(), id)
    if (obj) {
      obj.set({ visible: !obj.visible })
      canvas.requestRenderAll()
      syncToStore(canvas)
    }
  }, [])

  const reorderLayers = useCallback((orderedIds: string[]) => {
    const canvas = globalFabricCanvas
    if (!canvas) return
    // orderedIds[0] = top layer → highest z-index
    const objects = canvas.getObjects().filter((o) => !o.data?.isGrid && !o.data?.isPageBg)
    const gridLines = canvas.getObjects().filter((o) => o.data?.isGrid)

    // Build ordered array (bottom to top)
    const reordered = [...orderedIds].reverse().map((id) =>
      objects.find((o) => o.data?.id === id)
    ).filter(Boolean) as typeof objects

    // Remove all non-grid objects and re-add in order
    objects.forEach((o) => canvas.remove(o))
    reordered.forEach((o) => canvas.add(o))
    gridLines.forEach((l) => canvas.sendObjectToBack(l))
    canvas.requestRenderAll()
    syncToStore(canvas)
  }, [])

  const lockLayer = useCallback((id: string, locked: boolean) => {
    const canvas = globalFabricCanvas
    if (!canvas) return
    const obj = findById(canvas.getObjects(), id)
    if (!obj) return
    // Si l'objet est en édition texte, on sort du mode édition d'abord
    if ((obj as any).isEditing === true && typeof (obj as any).exitEditing === 'function') {
      ;(obj as any).exitEditing()
    }
    ;(obj as any).data = { ...((obj as any).data ?? {}), locked }
    obj.set({
      selectable: !locked,
      evented: !locked,
      lockMovementX: locked,
      lockMovementY: locked,
      lockScalingX: locked,
      lockScalingY: locked,
      lockRotation: locked,
    })
    if (locked && canvas.getActiveObject() === obj) {
      canvas.discardActiveObject()
    }
    canvas.requestRenderAll()
    syncToStore(canvas)
  }, [])

  const renameLayer = useCallback((id: string, name: string) => {
    const canvas = globalFabricCanvas
    if (!canvas) return
    const obj = findById(canvas.getObjects(), id)
    if (!obj) return
    ;(obj as any).data = { ...((obj as any).data ?? {}), name }
    syncToStore(canvas)
  }, [])

  const toggleSelectionTarget = useCallback((id: string, additive: boolean) => {
    const canvas = globalFabricCanvas
    if (!canvas) return
    if (!additive) {
      selectLayer(id)
      setSelectedObjectIds([id])
      return
    }
    const current = selectedObjectIds ?? []
    const next = current.includes(id) ? current.filter((x) => x !== id) : [...current, id]
    setSelectedObjectIds(next)
    if (next.length === 0) {
      canvas.discardActiveObject()
      setSelectedObjectId(null)
    } else {
      const lastId = next[next.length - 1]
      selectLayer(lastId)
    }
    canvas.requestRenderAll()
  }, [selectLayer, selectedObjectIds, setSelectedObjectIds, setSelectedObjectId])

  const moveLayerToGroup = useCallback((childId: string, groupId: string | null) => {
    const canvas = globalFabricCanvas
    if (!canvas) return
    const allObjs = canvas.getObjects()
    const child = findById(allObjs, childId)
    if (!child) return
    const currentParent = findParentGroup(allObjs, childId)

    // No-op : child déjà dans le groupe cible (ou déjà top-level)
    const currentParentId = currentParent ? (currentParent as any).data?.id ?? null : null
    if (currentParentId === groupId) return

    // Anti-cycle: un groupe ne peut pas être déplacé dans l'un de ses descendants
    if (groupId !== null && child instanceof Group) {
      const descendantTargets = findById(child.getObjects(), groupId)
      if (descendantTargets) return
    }

    // Retrait du parent actuel
    if (currentParent) {
      currentParent.remove(child)
      // Cleanup : si le groupe est maintenant vide, le supprimer
      if (currentParent.getObjects().length === 0) {
        canvas.remove(currentParent)
      }
    } else {
      canvas.remove(child)
    }

    // Ajout dans la cible
    if (groupId === null) {
      canvas.add(child)
    } else {
      const targetGroup = findById(allObjs, groupId)
      if (targetGroup && (targetGroup as any).type === 'group') {
        ;(targetGroup as any).add(child)
      } else {
        // Groupe cible introuvable : re-remettre en top-level par sécurité
        canvas.add(child)
      }
    }

    canvas.requestRenderAll()
    syncToStore(canvas)
  }, [])

  return { selectLayer, deleteLayer, toggleVisibility, reorderLayers, lockLayer, renameLayer, toggleSelectionTarget, moveLayerToGroup }
}
