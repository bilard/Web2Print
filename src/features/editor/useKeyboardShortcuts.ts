import { useEffect } from 'react'
import { globalFabricCanvas } from './CanvasContainer'
import { globalObjOps } from './useObjectOperations'

function isInputFocused() {
  const tag = document.activeElement?.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT'
}

function isFabricTextEditing() {
  const active = globalFabricCanvas?.getActiveObject() as any
  return active?.isEditing === true
}

export function useKeyboardShortcuts() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Never intercept when typing in an input or Fabric text
      if (isInputFocused() || isFabricTextEditing()) return

      const meta = e.metaKey || e.ctrlKey
      const canvas = globalFabricCanvas
      const ops = globalObjOps

      // Delete / Backspace → delete selected
      if ((e.key === 'Delete' || e.key === 'Backspace') && !meta) {
        e.preventDefault()
        ops?.deleteSelected()
        return
      }

      // Escape → deselect
      if (e.key === 'Escape') {
        canvas?.discardActiveObject()
        canvas?.requestRenderAll()
        return
      }

      // Arrow keys → nudge
      if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) {
        e.preventDefault()
        const obj = canvas?.getActiveObject()
        if (!obj || !canvas) return
        const step = e.shiftKey ? 10 : 1
        if (e.key === 'ArrowLeft') obj.set('left', (obj.left ?? 0) - step)
        if (e.key === 'ArrowRight') obj.set('left', (obj.left ?? 0) + step)
        if (e.key === 'ArrowUp') obj.set('top', (obj.top ?? 0) - step)
        if (e.key === 'ArrowDown') obj.set('top', (obj.top ?? 0) + step)
        obj.setCoords()
        canvas.requestRenderAll()
        return
      }

      if (!meta) return

      // Ctrl+S → save
      if (e.key === 's') {
        e.preventDefault()
        import('./useAutoSave').then((mod) => {
          console.log('[Save] Ctrl+S pressed, globalSave =', mod.globalSave ? 'function' : 'null')
          mod.globalSave?.()
        })
        return
      }

      // Ctrl+D → duplicate
      if (e.key === 'd') {
        e.preventDefault()
        ops?.duplicateSelected()
        return
      }

      // Ctrl+A → select all
      if (e.key === 'a') {
        e.preventDefault()
        ops?.selectAll()
        return
      }

      // Ctrl+G → group
      if (e.key === 'g' && !e.shiftKey) {
        e.preventDefault()
        ops?.groupSelected()
        return
      }

      // Ctrl+Shift+G → ungroup
      if (e.key === 'g' && e.shiftKey) {
        e.preventDefault()
        ops?.ungroupSelected()
        return
      }

      // Ctrl+] → bring forward, Ctrl+[ → send backward
      if (e.key === ']' && !e.shiftKey) {
        e.preventDefault()
        ops?.bringForward()
        return
      }
      if (e.key === '[' && !e.shiftKey) {
        e.preventDefault()
        ops?.sendBackward()
        return
      }
      // Ctrl+Shift+] → bring to front
      if (e.key === ']' && e.shiftKey) {
        e.preventDefault()
        ops?.bringToFront()
        return
      }
      // Ctrl+Shift+[ → send to back
      if (e.key === '[' && e.shiftKey) {
        e.preventDefault()
        ops?.sendToBack()
        return
      }
    }

    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
}
