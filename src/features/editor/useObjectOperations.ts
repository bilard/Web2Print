import { useCallback } from 'react'
import { Group, util } from 'fabric'
import type { Canvas } from 'fabric'
import { globalFabricCanvas } from './CanvasContainer'
import { syncToStore } from './useAddObject'
import { useEditorStore } from '@/stores/editor.store'
import { useUIStore } from '@/stores/ui.store'

export function useObjectOperations() {
  const { setSelectedObjectId } = useEditorStore()

  const deleteSelected = useCallback(() => {
    const canvas = globalFabricCanvas
    if (!canvas) return
    const objs = canvas.getActiveObjects()
    if (!objs.length) return
    objs.forEach((o) => canvas.remove(o))
    canvas.discardActiveObject()
    canvas.requestRenderAll()
    syncToStore(canvas)
    setSelectedObjectId(null)
  }, [setSelectedObjectId])

  const duplicateSelected = useCallback(async () => {
    const canvas = globalFabricCanvas
    if (!canvas) return
    const obj = canvas.getActiveObject()
    if (!obj) return
    const clone = await obj.clone()
    const id = `obj_${Date.now()}`
    clone.set({
      left: (obj.left ?? 0) + 20,
      top: (obj.top ?? 0) + 20,
      data: { ...((obj as any).data ?? {}), id },
    })
    canvas.add(clone)
    canvas.setActiveObject(clone)
    canvas.requestRenderAll()
    syncToStore(canvas)
    setSelectedObjectId(id)
  }, [setSelectedObjectId])

  const bringForward = useCallback(() => {
    const canvas = globalFabricCanvas
    const obj = canvas?.getActiveObject()
    if (!canvas || !obj) return
    canvas.bringObjectForward(obj)
    canvas.requestRenderAll()
    syncToStore(canvas)
  }, [])

  const sendBackward = useCallback(() => {
    const canvas = globalFabricCanvas
    const obj = canvas?.getActiveObject()
    if (!canvas || !obj) return
    canvas.sendObjectBackwards(obj)
    canvas.requestRenderAll()
    syncToStore(canvas)
  }, [])

  const bringToFront = useCallback(() => {
    const canvas = globalFabricCanvas
    const obj = canvas?.getActiveObject()
    if (!canvas || !obj) return
    canvas.bringObjectToFront(obj)
    canvas.requestRenderAll()
    syncToStore(canvas)
  }, [])

  const sendToBack = useCallback(() => {
    const canvas = globalFabricCanvas
    const obj = canvas?.getActiveObject()
    if (!canvas || !obj) return
    canvas.sendObjectToBack(obj)
    canvas.requestRenderAll()
    syncToStore(canvas)
  }, [])

  const flipHorizontal = useCallback(() => {
    const canvas = globalFabricCanvas
    const obj = canvas?.getActiveObject()
    if (!canvas || !obj) return
    obj.set('flipX', !obj.flipX)
    canvas.requestRenderAll()
    syncToStore(canvas)
  }, [])

  const flipVertical = useCallback(() => {
    const canvas = globalFabricCanvas
    const obj = canvas?.getActiveObject()
    if (!canvas || !obj) return
    obj.set('flipY', !obj.flipY)
    canvas.requestRenderAll()
    syncToStore(canvas)
  }, [])

  type AlignDir = 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom'

  const alignObjects = useCallback((direction: AlignDir) => {
    const canvas = globalFabricCanvas
    if (!canvas) return
    const objs = canvas.getActiveObjects()
    if (!objs.length) return
    const { canvasWidth: docW, canvasHeight: docH } = useUIStore.getState()

    objs.forEach((obj) => {
      const w = obj.getScaledWidth()
      const h = obj.getScaledHeight()
      switch (direction) {
        case 'left':   obj.set('left', 0); break
        case 'center': obj.set('left', (docW - w) / 2); break
        case 'right':  obj.set('left', docW - w); break
        case 'top':    obj.set('top', 0); break
        case 'middle': obj.set('top', (docH - h) / 2); break
        case 'bottom': obj.set('top', docH - h); break
      }
      obj.setCoords()
    })
    canvas.requestRenderAll()
    syncToStore(canvas)
  }, [])

  const groupSelected = useCallback(() => {
    const canvas = globalFabricCanvas
    if (!canvas) return
    const objs = canvas.getActiveObjects()
    if (objs.length < 2) return
    const id = `group_${Date.now()}`
    const group = new Group(objs)
    ;(group as any).data = { id, type: 'group', name: 'Groupe' }
    objs.forEach((o) => canvas.remove(o))
    canvas.discardActiveObject()
    canvas.add(group)
    canvas.setActiveObject(group)
    canvas.requestRenderAll()
    syncToStore(canvas)
    setSelectedObjectId(id)
  }, [setSelectedObjectId])

  const ungroupSelected = useCallback(() => {
    const canvas = globalFabricCanvas
    if (!canvas) return
    const obj = canvas.getActiveObject()
    if (!obj || obj.type !== 'group') return
    const group = obj as Group

    // Save world transforms before removing from group
    const items = group.getObjects()
    const worldTransforms = items.map((item) => item.calcTransformMatrix())

    group.removeAll()
    canvas.remove(group)
    canvas.discardActiveObject()

    for (let i = 0; i < items.length; i++) {
      const item = items[i]
      const d = util.qrDecompose(worldTransforms[i])
      item.set({
        left: d.translateX,
        top: d.translateY,
        angle: d.angle,
        scaleX: d.scaleX,
        scaleY: d.scaleY,
        skewX: d.skewX,
      })
      item.setCoords()
      canvas.add(item)
    }

    canvas.requestRenderAll()
    syncToStore(canvas)
    setSelectedObjectId(null)
  }, [setSelectedObjectId])

  const lockSelected = useCallback(() => {
    const canvas = globalFabricCanvas
    const obj = canvas?.getActiveObject()
    if (!canvas || !obj) return
    const isLocked = (obj as any).data?.locked
    obj.set({
      selectable: isLocked,
      evented: isLocked,
      data: { ...((obj as any).data ?? {}), locked: !isLocked },
    })
    canvas.requestRenderAll()
    syncToStore(canvas)
  }, [])

  const distributeHorizontally = useCallback(() => {
    const canvas = globalFabricCanvas
    if (!canvas) return
    const objs = canvas.getActiveObjects()
    if (objs.length < 3) return
    const sorted = [...objs].sort((a, b) => (a.left ?? 0) - (b.left ?? 0))
    const first = sorted[0], last = sorted[sorted.length - 1]
    const totalSpan = (last.left ?? 0) + last.getScaledWidth() - (first.left ?? 0)
    const totalObjWidth = sorted.reduce((sum, o) => sum + o.getScaledWidth(), 0)
    const gap = (totalSpan - totalObjWidth) / (sorted.length - 1)
    let x = first.left ?? 0
    sorted.forEach((obj) => {
      obj.set('left', x)
      obj.setCoords()
      x += obj.getScaledWidth() + gap
    })
    canvas.requestRenderAll()
    syncToStore(canvas)
  }, [])

  const distributeVertically = useCallback(() => {
    const canvas = globalFabricCanvas
    if (!canvas) return
    const objs = canvas.getActiveObjects()
    if (objs.length < 3) return
    const sorted = [...objs].sort((a, b) => (a.top ?? 0) - (b.top ?? 0))
    const first = sorted[0], last = sorted[sorted.length - 1]
    const totalSpan = (last.top ?? 0) + last.getScaledHeight() - (first.top ?? 0)
    const totalObjHeight = sorted.reduce((sum, o) => sum + o.getScaledHeight(), 0)
    const gap = (totalSpan - totalObjHeight) / (sorted.length - 1)
    let y = first.top ?? 0
    sorted.forEach((obj) => {
      obj.set('top', y)
      obj.setCoords()
      y += obj.getScaledHeight() + gap
    })
    canvas.requestRenderAll()
    syncToStore(canvas)
  }, [])

  const selectAll = useCallback(() => {
    const canvas = globalFabricCanvas
    if (!canvas) return
    const selectableObjs = canvas.getObjects().filter((o) => !o.data?.isGrid && o.selectable !== false)
    if (!selectableObjs.length) return
    if (selectableObjs.length === 1) {
      canvas.setActiveObject(selectableObjs[0])
    } else {
      // Use ActiveSelection via dynamic import to avoid issues
      import('fabric').then(({ ActiveSelection }) => {
        const sel = new ActiveSelection(selectableObjs, { canvas })
        canvas.setActiveObject(sel)
        canvas.requestRenderAll()
      })
      return
    }
    canvas.requestRenderAll()
  }, [])

  return {
    deleteSelected,
    duplicateSelected,
    bringForward,
    sendBackward,
    bringToFront,
    sendToBack,
    flipHorizontal,
    flipVertical,
    alignObjects,
    groupSelected,
    ungroupSelected,
    lockSelected,
    selectAll,
    distributeHorizontally,
    distributeVertically,
  }
}

// Export as global for keyboard shortcuts
export let globalObjOps: ReturnType<typeof useObjectOperations> | null = null
export function setGlobalObjOps(ops: ReturnType<typeof useObjectOperations>) {
  globalObjOps = ops
}
