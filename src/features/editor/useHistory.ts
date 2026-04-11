import { useEffect, useRef, useCallback } from 'react'
import { Canvas } from 'fabric'
import { useEditorStore } from '@/stores/editor.store'
import { syncToStore } from './useAddObject'

const MAX_HISTORY = 50

export function useHistory(fabricRef: React.RefObject<Canvas | null>) {
  const { setCanUndo, setCanRedo } = useEditorStore()
  const stack = useRef<string[]>([])
  const cursor = useRef<number>(-1)
  const isRestoring = useRef(false)

  const snapshot = useCallback(() => {
    const canvas = fabricRef.current
    if (!canvas || isRestoring.current) return
    const json = JSON.stringify(canvas.toObject(['data']))
    // Drop redo branch
    stack.current = stack.current.slice(0, cursor.current + 1)
    stack.current.push(json)
    if (stack.current.length > MAX_HISTORY) stack.current.shift()
    cursor.current = stack.current.length - 1
    setCanUndo(cursor.current > 0)
    setCanRedo(false)
  }, [fabricRef, setCanUndo, setCanRedo])

  const undo = useCallback(async () => {
    const canvas = fabricRef.current
    if (!canvas || cursor.current <= 0) return
    cursor.current--
    isRestoring.current = true
    await canvas.loadFromJSON(JSON.parse(stack.current[cursor.current]))
    canvas.requestRenderAll()
    syncToStore(canvas)
    isRestoring.current = false
    setCanUndo(cursor.current > 0)
    setCanRedo(true)
  }, [fabricRef, setCanUndo, setCanRedo])

  const redo = useCallback(async () => {
    const canvas = fabricRef.current
    if (!canvas || cursor.current >= stack.current.length - 1) return
    cursor.current++
    isRestoring.current = true
    await canvas.loadFromJSON(JSON.parse(stack.current[cursor.current]))
    canvas.requestRenderAll()
    syncToStore(canvas)
    isRestoring.current = false
    setCanUndo(true)
    setCanRedo(cursor.current < stack.current.length - 1)
  }, [fabricRef, setCanUndo, setCanRedo])

  // Attach canvas events
  useEffect(() => {
    const canvas = fabricRef.current
    if (!canvas) return

    // Initial snapshot
    snapshot()

    const onChange = () => {
      if (isRestoring.current) return
      snapshot()
    }

    canvas.on('object:added', onChange)
    canvas.on('object:removed', onChange)
    canvas.on('object:modified', onChange)

    return () => {
      canvas.off('object:added', onChange)
      canvas.off('object:removed', onChange)
      canvas.off('object:modified', onChange)
    }
  }, [fabricRef.current, snapshot])  

  // Keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const meta = e.metaKey || e.ctrlKey
      if (!meta) return
      if (e.key === 'z' && !e.shiftKey) { e.preventDefault(); undo() }
      if (e.key === 'y' || (e.key === 'z' && e.shiftKey)) { e.preventDefault(); redo() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [undo, redo])

  return { undo, redo, snapshot }
}
