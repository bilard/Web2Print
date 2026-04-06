/**
 * Hook d'orchestration PPTX → canvas
 * Pipeline identique à useIdmlParse :
 * 1. Parse PPTX (ZIP + XML)
 * 2. Upload images vers Firebase Storage
 * 3. Conversion Fabric objects
 * 4. Rendu canvas + resize canvas
 * 5. Save
 */
import { useState, useCallback, useRef } from 'react'
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage'
import { storage } from '@/lib/firebase/config'
import { parsePptx } from './pptxParser'
import { pptxToFabricObjects } from './pptxToFabric'
import { globalFabricCanvas, globalFitCanvas } from '@/features/editor/CanvasContainer'
import { syncToStore } from '@/features/editor/useAddObject'
import { globalSave } from '@/features/editor/useAutoSave'
import { useEditorStore } from '@/stores/editor.store'
import { useUIStore } from '@/stores/ui.store'
import type { FabricObject } from 'fabric'

function waitForCanvas(timeoutMs: number): Promise<typeof globalFabricCanvas> {
  return new Promise((resolve) => {
    if (globalFabricCanvas) return resolve(globalFabricCanvas)
    const start = Date.now()
    const interval = setInterval(() => {
      if (globalFabricCanvas) { clearInterval(interval); resolve(globalFabricCanvas) }
      else if (Date.now() - start > timeoutMs) { clearInterval(interval); resolve(null) }
    }, 100)
  })
}

/**
 * Extrait les images base64 de la slide et les upload vers Storage
 * Retourne une map rId → Storage URL
 */
async function uploadSlideImages(
  projectId: string,
  objects: FabricObject[],
): Promise<void> {
  // Les images sont déjà dans les FabricImage objects comme data URLs
  // On les upload vers Storage pour les rendre permanentes
  const { FabricImage } = await import('fabric')
  let idx = 0
  for (const obj of objects) {
    if (!(obj instanceof FabricImage)) continue
    const src = obj.getSrc?.() ?? ''
    if (!src.startsWith('data:')) continue  // déjà une URL Storage ou externe

    try {
      const res = await fetch(src)
      const blob = await res.blob()
      const ext = blob.type === 'image/jpeg' ? 'jpg' : 'png'
      const storageRef = ref(storage, `projects/${projectId}/pptx/img_${idx++}.${ext}`)
      await uploadBytes(storageRef, blob)
      const url = await getDownloadURL(storageRef)
      // Mettre à jour l'objet Fabric avec l'URL permanente
      await FabricImage.fromURL(url, { crossOrigin: 'anonymous' }).then((newImg) => {
        obj.setElement(newImg.getElement())
      })
    } catch (err) {
      console.warn('[PPTX] Image upload failed:', err)
    }
  }
}

export type PptxParseStep = 'idle' | 'parsing' | 'converting' | 'rendering' | 'done' | 'error'

interface PptxParseState {
  step: PptxParseStep
  objectCount: number
  error: string | null
}

export function usePptxParse() {
  const [state, setState] = useState<PptxParseState>({
    step: 'idle', objectCount: 0, error: null,
  })
  const runningRef = useRef(false)

  const parseAndRender = useCallback(async (file: File) => {
    if (runningRef.current) return
    runningRef.current = true
    setState({ step: 'parsing', objectCount: 0, error: null })

    try {
      // 1. Parser le PPTX
      await new Promise((r) => setTimeout(r, 50))
      const slide = await parsePptx(file)
      console.log(`[PPTX] Slide ${slide.widthEmu}×${slide.heightEmu} EMU, ${slide.elements.length} éléments`)

      setState((s) => ({ ...s, step: 'converting' }))
      await new Promise((r) => setTimeout(r, 20))

      // 2. Attendre le canvas
      let canvas = globalFabricCanvas
      if (!canvas) canvas = await waitForCanvas(5000)
      if (!canvas) {
        setState({ step: 'error', objectCount: 0, error: 'Canvas non disponible' })
        return
      }

      // 3. Calculer les dimensions canvas depuis la slide PPTX
      // 1 EMU = 1/914400 pouce, on mappe à 96dpi pour avoir un canvas lisible
      const slideWpx = Math.round(slide.widthEmu / 9525)
      const slideHpx = Math.round(slide.heightEmu / 9525)
      // Garder le ratio mais limiter la taille à 3840px max
      const maxDim = 3840
      const ratio = Math.min(maxDim / slideWpx, maxDim / slideHpx, 1)
      const canvasW = Math.round(slideWpx * ratio)
      const canvasH = Math.round(slideHpx * ratio)

      // 4. Redimensionner le canvas aux proportions PPTX
      useUIStore.getState().setCanvasSize(canvasW, canvasH, '#ffffff')
      await new Promise((r) => setTimeout(r, 30))

      // 5. Convertir en Fabric objects (dans les coords du canvas redimensionné)
      await document.fonts.ready
      const fabricObjects = await pptxToFabricObjects(slide, canvasW, canvasH)
      console.log(`[PPTX] ${fabricObjects.length} Fabric objects créés`)
      setState((s) => ({ ...s, step: 'rendering', objectCount: fabricObjects.length }))

      // 6. Vider le canvas et ajouter les objets
      const toRemove = canvas.getObjects().filter((o) => !o.data?.isGrid && !o.data?.isPageBg)
      for (const o of toRemove) canvas.remove(o)

      for (const obj of fabricObjects) {
        canvas.add(obj)
        obj.on('modified', () => syncToStore(canvas!))
      }
      canvas.requestRenderAll()
      syncToStore(canvas)

      // Forcer re-mesure des textbox après chargement polices
      await document.fonts.ready
      for (const obj of canvas.getObjects()) {
        if ('initDimensions' in obj && typeof (obj as Record<string, unknown>).initDimensions === 'function') {
          ;(obj as Record<string, unknown> & { initDimensions: () => void }).initDimensions()
          ;(obj as { dirty?: boolean })['dirty'] = true
        }
      }
      canvas.requestRenderAll()

      // Fit canvas à l'écran
      requestAnimationFrame(() => {
        globalFitCanvas?.()
        setTimeout(() => globalFitCanvas?.(), 200)
      })

      setState((s) => ({ ...s, step: 'done' }))
      runningRef.current = false

      // 7. Upload images Storage en arrière-plan puis save
      const pid = useEditorStore.getState().projectId
      if (pid) {
        uploadSlideImages(pid, fabricObjects)
          .then(() => {
            canvas!.requestRenderAll()
            return globalSave?.()
          })
          .then(() => console.log('[PPTX] Sauvegardé après import'))
          .catch((err) => console.warn('[PPTX] Erreur post-import:', err))
      } else {
        setTimeout(() => {
          globalSave?.().catch((err) => console.warn('[PPTX] Save error:', err))
        }, 500)
      }

    } catch (err) {
      console.error('[PPTX] Parse error:', err)
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
