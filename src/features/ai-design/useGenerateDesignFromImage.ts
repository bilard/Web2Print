/**
 * Hook complet: Prompt → Nano Banana → Image → SVG éditable → Canvas
 *
 * C'est le nouveau pipeline image-based (remplace les templates rigides).
 */

import { useState, useCallback, useRef } from 'react'
import { toast } from 'sonner'
import { generateNanoBananaRef } from './generateNanoBananaRef'
import { createDesignFromImage } from './designFromImage'
import { parseSvgToFabric } from '@/features/svg/svgToFabric'
import { globalFabricCanvas, globalFitCanvas } from '@/features/editor/CanvasContainer'
import { syncToStore } from '@/features/editor/useAddObject'
import { useUIStore } from '@/stores/ui.store'
import { useEditorStore } from '@/stores/editor.store'
import { useNanoBanaStore } from '@/stores/nanobana.store'
import { saveRefImageToGallery } from './saveRefImageToGallery'
import type { DesignStyle } from './types'

type Step = 'idle' | 'generating-image' | 'analyzing' | 'rendering' | 'done' | 'error'

interface State {
  step: Step
  progress: string
  error: string | null
}

interface GenerateParams {
  prompt: string
  style: DesignStyle
  widthMm: number
  heightMm: number
  palette?: string[]
}

export function useGenerateDesignFromImage() {
  const runningRef = useRef(false)
  const [state, setState] = useState<State>({
    step: 'idle',
    progress: '',
    error: null,
  })

  const generate = useCallback(async (params: GenerateParams) => {
    if (runningRef.current) return
    runningRef.current = true

    try {
      setState({ step: 'generating-image', progress: 'Génération image Nano Banana...', error: null })

      // Step 1: Génère image via Nano Banana
      const nanoResult = await generateNanoBananaRef({
        userPrompt: params.prompt,
        widthMm: params.widthMm,
        heightMm: params.heightMm,
        style: params.style,
        dpi: 300,
        palette: params.palette,
      })

      if (!nanoResult.ok || !nanoResult.dataUri) {
        throw new Error(nanoResult.error || 'Nano Banana generation failed')
      }

      console.log('[useGenerateDesignFromImage] Nano Banana image generated')

      // Sauvegarde en galerie
      const projectId = useEditorStore.getState().projectId
      if (projectId) {
        const dateLabel = new Date().toLocaleString('fr-FR', {
          day: '2-digit',
          month: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
        })
        const refName = `Design Ref — ${params.prompt.slice(0, 40)} — ${dateLabel}`
        void saveRefImageToGallery({
          dataUri: nanoResult.dataUri,
          projectId,
          name: refName,
          tags: ['design-ref', params.style],
        }).then((img) => {
          if (img) {
            useNanoBanaStore.getState().addImage(img)
          }
        })
      }

      // Step 2: Analyse image via Claude Vision
      setState({ step: 'analyzing', progress: 'Analyse du design...', error: null })

      const base64Data = nanoResult.dataUri.split(',')[1]
      if (!base64Data) {
        throw new Error('Invalid dataUri format')
      }

      const designResult = await createDesignFromImage(base64Data, params.widthMm, params.heightMm)
      console.log('[useGenerateDesignFromImage] Design analysis complete')

      // Step 3: Charge SVG dans le canvas
      setState({ step: 'rendering', progress: 'Chargement du design...', error: null })

      const canvas = globalFabricCanvas
      if (canvas) {
        canvas.clear()

        try {
          const parseResult = await parseSvgToFabric(designResult.svg)
          if (parseResult) {
            canvas.renderAll()
          }
          if (globalFitCanvas) {
            globalFitCanvas()
          }
        } catch (parseErr) {
          console.error('[useGenerateDesignFromImage] SVG parse error:', parseErr)
        }
      }

      // Met à jour UI
      useUIStore.getState().setCanvasSize(
        Math.round((params.widthMm * 96) / 25.4),
        Math.round((params.heightMm * 96) / 25.4)
      )

      setState({ step: 'done', progress: 'Design créé !', error: null })
      toast.success('Design généré avec succès')

      return designResult
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err)
      console.error('[useGenerateDesignFromImage] Error:', errorMsg)
      setState({ step: 'error', progress: '', error: errorMsg })
      toast.error(errorMsg)
      throw err
    } finally {
      runningRef.current = false
    }
  }, [])

  return { ...state, generate }
}
