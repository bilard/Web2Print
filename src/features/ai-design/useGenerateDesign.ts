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

function parseViewBox(svgText: string): { x: number; y: number; w: number; h: number } | null {
  const match = svgText.match(/viewBox\s*=\s*"([^"]+)"/i)
  if (!match) return null
  const parts = match[1].trim().split(/[\s,]+/).map(Number)
  if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n))) return null
  return { x: parts[0], y: parts[1], w: parts[2], h: parts[3] }
}

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

    setState((s) => ({ ...s, step: 'rendering', progress: 'Rendu sur le canvas…' }))

    const canvas = globalFabricCanvas
    if (!canvas) {
      setState({ step: 'error', progress: '', error: 'Canvas non initialisé', lastResult: null })
      return
    }

    // Lecture du viewBox réel (peut inclure le fond perdu via une origine négative)
    const vb = parseViewBox(cleanSvg) ?? { x: 0, y: 0, w: widthMm, h: heightMm }

    // Le canvas couvre toute la zone d'impression (bleed compris si présent)
    const canvasWidthPx = Math.round(mmToPx(vb.w, dpi))
    const canvasHeightPx = Math.round(mmToPx(vb.h, dpi))
    useUIStore.getState().setCanvasSize(canvasWidthPx, canvasHeightPx, '#ffffff')

    // Retire TOUT sauf grid / pageBg / print-marks (ces derniers seront regénérés par l'effet du CanvasContainer)
    const toRemove = canvas.getObjects().filter((o) => {
      return !o.data?.isGrid && !o.data?.isPageBg && !o.data?.isPrintMark
    })
    for (const o of toRemove) canvas.remove(o)

    try {
      const { objects } = await parseSvgToFabric(cleanSvg)

      // Scale des unités viewBox (mm) vers px, et translate pour que l'origine du viewBox tombe en (0,0).
      const scaleX = canvasWidthPx / vb.w
      const scaleY = canvasHeightPx / vb.h
      for (const obj of objects) {
        obj.left = ((obj.left ?? 0) - vb.x) * scaleX
        obj.top = ((obj.top ?? 0) - vb.y) * scaleY
        obj.scaleX = (obj.scaleX ?? 1) * scaleX
        obj.scaleY = (obj.scaleY ?? 1) * scaleY
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
