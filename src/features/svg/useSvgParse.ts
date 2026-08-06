import { useState, useCallback, useRef } from 'react'
import { FabricImage, type Canvas, type Group, type FabricObject } from 'fabric'
import { parseSvgToFabric, type SvgParseOptions } from './svgToFabric'
import { globalFabricCanvas, waitForCanvas, globalFitCanvas } from '@/features/editor/globalCanvas'
import { syncToStore } from '@/features/editor/useAddObject'
import { globalSave } from '@/features/editor/useAutoSave'

async function reloadHttpImagesWithCors(canvas: Canvas): Promise<void> {
  const collectFromGroup = (g: Group): FabricImage[] => {
    const out: FabricImage[] = []
    for (const child of (g as unknown as { _objects?: unknown[] })._objects ?? []) {
      if (child instanceof FabricImage) out.push(child)
      else if ((child as Group)?._objects) out.push(...collectFromGroup(child as Group))
    }
    return out
  }
  const images: FabricImage[] = []
  for (const obj of canvas.getObjects()) {
    if (obj instanceof FabricImage) images.push(obj)
    else if ((obj as Group)?._objects) images.push(...collectFromGroup(obj as Group))
  }
  await Promise.all(images.map(async (img) => {
    const src = (img as unknown as { getSrc?: () => string }).getSrc?.()
    if (!src || !src.startsWith('http')) return
    try {
      const fresh = await FabricImage.fromURL(src, { crossOrigin: 'anonymous' })
      img.setElement(fresh.getElement())
    } catch (err) {
      console.warn('[SVG Parse] CORS reload failed for image:', src, err)
    }
  }))
}

/** Invalide le cache des textes (et recalcule le wrap des cadres) après un
 *  changement de police disponible. */
function refreshTextObjects(canvas: Canvas): void {
  const visit = (objects: FabricObject[]) => {
    for (const obj of objects) {
      const group = obj as unknown as { _objects?: FabricObject[] }
      if (group._objects) {
        visit(group._objects)
        obj.set('dirty', true)
        continue
      }
      const asText = obj as FabricObject & { text?: unknown; initDimensions?: () => void }
      if (typeof asText.text !== 'string') continue
      asText.initDimensions?.()
      obj.set('dirty', true)
      obj.setCoords()
    }
  }
  visit(canvas.getObjects())
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

  const parseAndRender = useCallback(async (file: File, options: SvgParseOptions = {}) => {
    if (runningRef.current) return
    runningRef.current = true
    setState({ step: 'reading', objectCount: 0, error: null })

    try {
      const svgText = await file.text()

      setState((s) => ({ ...s, step: 'parsing' }))
      const { objects, width, height, fontsReady } = await parseSvgToFabric(svgText, options)

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

      // Re-load les FabricImage avec src HTTP en CORS anonymous — sans ça les images
      // taintent le canvas, ce qui fait échouer toDataURL (vignette, thumbnails).
      // Aligné sur le pattern usePptxParse / useDamCanvasInsert.
      await reloadHttpImagesWithCors(canvas)

      canvas.requestRenderAll()
      syncToStore(canvas)

      // Les polices du fichier arrivent APRÈS ce premier rendu : sans re-rendu
      // les textes resteraient affichés dans la police de substitution (et un
      // Textbox garderait le retour à la ligne calculé sur ses métriques).
      void fontsReady.then(() => document.fonts.ready).then(() => {
        refreshTextObjects(canvas)
        canvas.requestRenderAll()
        syncToStore(canvas)
      }).catch(() => { /* police indisponible : le rendu de repli reste affiché */ })

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
