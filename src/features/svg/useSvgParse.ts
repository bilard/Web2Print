import { useState, useCallback, useRef } from 'react'
import { parseSvgToFabric } from './svgToFabric'
import { globalFabricCanvas, globalFitCanvas } from '@/features/editor/CanvasContainer'
import { syncToStore } from '@/features/editor/useAddObject'
import { globalSave } from '@/features/editor/useAutoSave'

function waitForCanvas(timeoutMs: number): Promise<typeof globalFabricCanvas> {
  return new Promise((resolve) => {
    if (globalFabricCanvas) return resolve(globalFabricCanvas)
    const start = Date.now()
    const interval = setInterval(() => {
      if (globalFabricCanvas) {
        clearInterval(interval)
        resolve(globalFabricCanvas)
      } else if (Date.now() - start > timeoutMs) {
        clearInterval(interval)
        resolve(null)
      }
    }, 100)
  })
}

type Step = 'idle' | 'reading' | 'parsing' | 'rendering' | 'done' | 'error'

interface SvgParseState {
  step: Step
  objectCount: number
  error: string | null
}

export function useSvgParse() {
  const [state, setState] = useState<SvgParseState>({ step: 'idle', objectCount: 0, error: null })
  const runningRef = useRef(false)

  const parseAndRender = useCallback(async (file: File) => {
    if (runningRef.current) return
    runningRef.current = true
    setState({ step: 'reading', objectCount: 0, error: null })

    try {
      const svgText = await file.text()

      setState((s) => ({ ...s, step: 'parsing' }))
      const { objects, width, height } = await parseSvgToFabric(svgText)

      setState((s) => ({ ...s, step: 'rendering', objectCount: objects.length }))

      let canvas = globalFabricCanvas
      if (!canvas) canvas = await waitForCanvas(5000)
      if (!canvas) {
        setState({ step: 'error', objectCount: 0, error: 'Canvas non disponible' })
        runningRef.current = false
        return
      }

      const toRemove = canvas.getObjects().filter((o) => !o.data?.isGrid && !o.data?.isPageBg)
      for (const o of toRemove) canvas.remove(o)

      const { useUIStore } = await import('@/stores/ui.store')
      useUIStore.getState().setCanvasSize(Math.round(width), Math.round(height), '#ffffff')

      for (const obj of objects) {
        canvas.add(obj)
        obj.on('modified', () => syncToStore(canvas))
      }

      canvas.requestRenderAll()
      syncToStore(canvas)

      requestAnimationFrame(() => {
        if (globalFitCanvas) globalFitCanvas()
        setTimeout(() => globalFitCanvas?.(), 200)
      })

      setState({ step: 'done', objectCount: objects.length, error: null })
      runningRef.current = false

      setTimeout(() => {
        globalSave?.().catch((err) => console.warn('[SVG Parse] Post-import save failed:', err))
      }, 500)
    } catch (err) {
      console.error('SVG parse error', err)
      runningRef.current = false
      setState({ step: 'error', objectCount: 0, error: String(err) })
    }
  }, [])

  const reset = useCallback(() => {
    runningRef.current = false
    setState({ step: 'idle', objectCount: 0, error: null })
  }, [])

  return { state, parseAndRender, reset }
}
