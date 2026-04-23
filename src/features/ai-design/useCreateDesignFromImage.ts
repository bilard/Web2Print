/**
 * Hook pour convertir une image de design (Nano Banana) en SVG éditable.
 *
 * Utilisation:
 * const { convert, loading, error, result } = useCreateDesignFromImage()
 * await convert(imageBase64, 210, 297)
 */

import { useState, useCallback } from 'react'
import { createDesignFromImage, type DesignFromImageResult } from './designFromImage'
import { parseSvgToFabric } from '@/features/svg/svgToFabric'
import { globalFabricCanvas, globalFitCanvas } from '@/features/editor/CanvasContainer'
import { syncToStore } from '@/features/editor/useAddObject'
import { useUIStore } from '@/stores/ui.store'

interface UseCreateDesignFromImageState {
  loading: boolean
  error: string | null
  result: DesignFromImageResult | null
  progress: string
}

export function useCreateDesignFromImage() {
  const [state, setState] = useState<UseCreateDesignFromImageState>({
    loading: false,
    error: null,
    result: null,
    progress: '',
  })

  const convert = useCallback(
    async (imageBase64: string, widthMm: number, heightMm: number) => {
      setState({ loading: true, error: null, result: null, progress: 'Analyse de l\'image...' })

      try {
        // Step 1: Analyse + génère SVG
        setState((s) => ({ ...s, progress: 'Génération du SVG éditable...' }))
        const designResult = await createDesignFromImage(imageBase64, widthMm, heightMm)

        // Step 2: Charge le SVG dans l'éditeur Fabric
        setState((s) => ({ ...s, progress: 'Chargement du design...' }))

        const canvas = globalFabricCanvas
        if (canvas) {
          // Effacer le canvas existant
          canvas.clear()

          // Parser et charger le SVG
          try {
            const parseResult = await parseSvgToFabric(designResult.svg)
            if (parseResult) {
              canvas.clear()
              canvas.renderAll()
              if (globalFitCanvas) {
                globalFitCanvas()
              }
            }
          } catch (parseErr) {
            console.error('[useCreateDesignFromImage] Failed to parse SVG:', parseErr)
          }
        }

        // Step 3: Met à jour l'UI
        useUIStore.getState().setCanvasSize(
          Math.round((widthMm * 96) / 25.4), // px @ 96 DPI
          Math.round((heightMm * 96) / 25.4)
        )

        setState({ loading: false, error: null, result: designResult, progress: 'Design chargé !' })
        return designResult
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err)
        setState({ loading: false, error: errorMsg, result: null, progress: '' })
        throw err
      }
    },
    []
  )

  return {
    ...state,
    convert,
  }
}
