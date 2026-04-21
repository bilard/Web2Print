import { useState, useCallback, useRef } from 'react'
import { z } from 'zod'
import { toast } from 'sonner'
import { generateJson } from '@/features/ai/llmRouter'
import { DesignResultSchema, DesignResultJsonSchema } from './designSchema'
import { buildDesignPrompt } from './designPrompt'
import { sanitizeSvg } from './sanitizeSvg'
import { validateSvgFonts } from './fontsValidator'
import type { DesignRequest, DesignResult } from './types'
import { parseSvgToFabric } from '@/features/svg/svgToFabric'
import { globalFabricCanvas, globalFitCanvas } from '@/features/editor/CanvasContainer'
import { syncToStore } from '@/features/editor/useAddObject'
import { useUIStore } from '@/stores/ui.store'
import { getFormatById } from '@/features/print/PRINT_FORMATS'
import { mmToPx } from '@/features/print/dimensions'
import { AVAILABLE_FONTS } from '@/features/assets/useFonts'

type Step = 'idle' | 'generating' | 'sanitizing' | 'rendering' | 'done' | 'error'

interface State {
  step: Step
  progress: string
  error: string | null
  lastResult: DesignResult | null
}

const PROMPT_VERSION = 'design.generate.v1'

export function useGenerateDesign() {
  const runningRef = useRef(false)
  const [state, setState] = useState<State>({ step: 'idle', progress: '', error: null, lastResult: null })

  const generate = useCallback(async (req: DesignRequest) => {
    if (runningRef.current) return
    runningRef.current = true
    try {
    setState({ step: 'generating', progress: 'Envoi du brief à Claude…', error: null, lastResult: null })

    // Résolution du format
    let widthMm: number, heightMm: number, formatLabel: string
    if (req.formatId === 'custom') {
      if (!req.customWidthMm || !req.customHeightMm) {
        setState({ step: 'error', progress: '', error: 'Dimensions custom manquantes', lastResult: null })
        return
      }
      widthMm = req.customWidthMm
      heightMm = req.customHeightMm
      formatLabel = `Custom ${widthMm} × ${heightMm} mm`
    } else {
      const f = getFormatById(req.formatId)
      if (!f) {
        setState({ step: 'error', progress: '', error: `Format inconnu : ${req.formatId}`, lastResult: null })
        return
      }
      widthMm = f.widthMm
      heightMm = f.heightMm
      formatLabel = f.label
    }

    const { bleedMm: storeBleed, dpi } = useUIStore.getState()
    const effectiveBleed = req.includeBleed ? Math.max(storeBleed, 3) : 0

    // Garde le store UI synchro pour que l'overlay de repères (useEffect dans CanvasContainer)
    // dessine des traits de coupe correspondant au bleed réellement utilisé dans le SVG.
    if (useUIStore.getState().bleedMm !== effectiveBleed) {
      useUIStore.getState().setBleedMm(effectiveBleed)
    }

    const availableFonts = AVAILABLE_FONTS.map((f) => f.family)

    const prompt = buildDesignPrompt({
      userPrompt: req.prompt,
      widthMm,
      heightMm,
      formatLabel,
      style: req.style,
      includeBleed: req.includeBleed,
      bleedMm: effectiveBleed,
      availableFonts,
      palette: req.palette,
      productImageUrl: req.productImageUrl,
      productName: req.productName,
    })

    let result: DesignResult
    try {
      result = await generateJson<DesignResult>({
        task: 'design.generate',
        prompt,
        schema: DesignResultSchema as unknown as z.ZodSchema<DesignResult>,
        schemaForLLM: DesignResultJsonSchema as unknown as Record<string, unknown>,
        schemaForClaude: DesignResultJsonSchema as unknown as Record<string, unknown>,
        version: PROMPT_VERSION,
      })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      setState({ step: 'error', progress: '', error: `Génération LLM échouée : ${msg}`, lastResult: null })
      return
    }

    setState((s) => ({ ...s, step: 'sanitizing', progress: 'Validation du SVG…' }))

    let cleanSvg: string
    try {
      cleanSvg = sanitizeSvg(result.svg)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      setState({ step: 'error', progress: '', error: `SVG invalide : ${msg}`, lastResult: null })
      return
    }

    // Validation des fonts
    const fontCheck = validateSvgFonts(cleanSvg, availableFonts)
    if (fontCheck.missingFonts.length > 0) {
      toast.warning(
        `Fonts non disponibles : ${fontCheck.missingFonts.join(', ')}. Remplacées par Inter.`,
      )
      for (const missing of fontCheck.missingFonts) {
        const reDouble = new RegExp(`font-family\\s*=\\s*"${missing}[^"]*"`, 'g')
        const reSingle = new RegExp(`font-family\\s*=\\s*'${missing}[^']*'`, 'g')
        cleanSvg = cleanSvg.replace(reDouble, 'font-family="Inter"').replace(reSingle, 'font-family="Inter"')
      }
    }

    // Pré-remplissage de l'image produit pour le slot product-image
    let slotDataUris: Map<string, string> = new Map()
    if (req.productImageUrl) {
      const productSlot = result.slots.find((s) => s.id === 'product-image')
      if (productSlot) {
        try {
          const { httpsCallable } = await import('firebase/functions')
          const { functions } = await import('@/lib/firebase/config')
          const imageProxyFn = httpsCallable<{ url: string }, { data: string; mimeType: string }>(
            functions, 'imageProxy'
          )
          const { data: proxyResult } = await imageProxyFn({ url: req.productImageUrl })
          slotDataUris.set(productSlot.id, `data:${proxyResult.mimeType};base64,${proxyResult.data}`)
        } catch (err) {
          console.warn('[useGenerateDesign] product image proxy failed:', err)
        }
      }
    }

    // Remplacer les placeholders image par les data URIs pré-remplis
    let finalSvg = cleanSvg
    for (const [slotId, dataUri] of slotDataUris) {
      const placeholderHref = `placeholder:${slotId}`
      finalSvg = finalSvg.replace(new RegExp(`href="${placeholderHref}"`, 'g'), `href="${dataUri}"`)
    }

    setState((s) => ({ ...s, step: 'rendering', progress: 'Rendu sur le canvas…' }))

    const canvas = globalFabricCanvas
    if (!canvas) {
      setState({ step: 'error', progress: '', error: 'Canvas non initialisé', lastResult: null })
      return
    }

    // Canvas = format fini (trimmed). Le contenu débordant (bleed) s'étend
    // naturellement en coordonnées négatives, là où l'overlay de repères
    // (buildPrintMarks) dessine déjà le rectangle de fond perdu.
    const canvasWidthPx = Math.round(mmToPx(widthMm, dpi))
    const canvasHeightPx = Math.round(mmToPx(heightMm, dpi))
    useUIStore.getState().setCanvasSize(canvasWidthPx, canvasHeightPx, '#ffffff')

    const toRemove = canvas.getObjects().filter((o) => {
      return !o.data?.isGrid && !o.data?.isPageBg && !o.data?.isPrintMark
    })
    for (const o of toRemove) canvas.remove(o)

    try {
      const { objects } = await parseSvgToFabric(finalSvg)

      // Les unités SVG sont en mm (viewBox en mm par contrat de prompt).
      // Scale uniforme mm → px. Pas de translation — les coordonnées SVG
      // utilisent déjà le format fini comme origine ; le bleed est en coords négatives.
      const scale = canvasWidthPx / widthMm
      for (const obj of objects) {
        obj.left = (obj.left ?? 0) * scale
        obj.top = (obj.top ?? 0) * scale
        obj.scaleX = (obj.scaleX ?? 1) * scale
        obj.scaleY = (obj.scaleY ?? 1) * scale
        obj.setCoords()
        canvas.add(obj)
      }

      canvas.requestRenderAll()
      syncToStore(canvas)
      requestAnimationFrame(() => globalFitCanvas?.())
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      setState({ step: 'error', progress: '', error: `Parse SVG échoué : ${msg}`, lastResult: null })
      return
    }

    setState({ step: 'done', progress: '', error: null, lastResult: result })
    } finally {
      runningRef.current = false
    }
  }, [])

  const reset = useCallback(() => {
    setState({ step: 'idle', progress: '', error: null, lastResult: null })
  }, [])

  return { state, generate, reset }
}
