import { useState, useCallback, useRef } from 'react'
import { z } from 'zod'
import { toast } from 'sonner'
import { generateJson } from '@/features/ai/llmRouter'
import { DesignResultSchema, DesignResultJsonSchema } from './designSchema'
import { buildArtDirectorPrompt } from './artDirectorPrompt'
import { designPlanSchema, designPlanJsonSchema, type DesignPlan } from './artDirectorSchema'
import { buildSvgEngineerPrompt } from './svgEngineerPrompt'
import { generateFullDesignImage } from './generateFullDesignImage'
import { generateProductAssets, extractSupplierUrl } from './generateProductAssets'
import { sanitizeSvg } from './sanitizeSvg'
import { validateSvgFonts } from './fontsValidator'
import type { DesignRequest, DesignResult, DesignStyle } from './types'
import { parseSvgToFabric } from '@/features/svg/svgToFabric'
import { globalFabricCanvas, globalFitCanvas } from '@/features/editor/CanvasContainer'
import { syncToStore } from '@/features/editor/useAddObject'
import { useUIStore } from '@/stores/ui.store'
import { getFormatById } from '@/features/print/PRINT_FORMATS'
import { mmToPx } from '@/features/print/dimensions'
import { AVAILABLE_FONTS } from '@/features/assets/useFonts'

export type Step = 'idle' | 'planning' | 'illustrating' | 'sanitizing' | 'rendering' | 'done' | 'error'

interface State {
  step: Step
  progress: string
  error: string | null
  lastResult: DesignResult | null
  lastPlan: DesignPlan | null
  nanobananaImage?: string
}

const PROMPT_VERSION = 'design.generate.v1'

export function useGenerateDesign() {
  const runningRef = useRef(false)
  const [state, setState] = useState<State>({ step: 'idle', progress: '', error: null, lastResult: null, lastPlan: null, nanobananaImage: undefined })

  const generate = useCallback(async (req: DesignRequest) => {
    if (runningRef.current) return
    runningRef.current = true
    try {
      // ─────────────────────────────────────────────────────────────────────────────
      // PHASE 1 : Planning (Art Director)
      // ─────────────────────────────────────────────────────────────────────────────
      setState((s) => ({ ...s, step: 'planning', progress: 'Planification du design (Art Director)…', error: null, lastResult: null, lastPlan: null }))

      // Résolution du format
      let widthMm: number, heightMm: number, formatLabel: string, formatNativeDpi: number | undefined
      if (req.formatId === 'custom') {
        if (!req.customWidthMm || !req.customHeightMm) {
          setState((s) => ({ ...s, step: 'error', progress: '', error: 'Dimensions custom manquantes', lastResult: null, lastPlan: null }))
          return
        }
        widthMm = req.customWidthMm
        heightMm = req.customHeightMm
        formatLabel = `Custom ${widthMm} × ${heightMm} mm`
        formatNativeDpi = undefined
      } else {
        const f = getFormatById(req.formatId)
        if (!f) {
          setState((s) => ({ ...s, step: 'error', progress: '', error: `Format inconnu : ${req.formatId}`, lastResult: null, lastPlan: null }))
          return
        }
        widthMm = f.widthMm
        heightMm = f.heightMm
        formatLabel = f.label
        formatNativeDpi = f.nativeDpi
      }

      const { bleedMm: storeBleed, dpi: storeDpi } = useUIStore.getState()
      const dpi = formatNativeDpi ?? storeDpi
      const effectiveBleed = req.includeBleed ? Math.max(storeBleed, 3) : 0

      // Garde le store UI synchro pour que l'overlay de repères (useEffect dans CanvasContainer)
      // dessine des traits de coupe correspondant au bleed réellement utilisé dans le SVG.
      if (useUIStore.getState().bleedMm !== effectiveBleed) {
        useUIStore.getState().setBleedMm(effectiveBleed)
      }

      const availableFonts = AVAILABLE_FONTS.map((f) => f.family)

      // Art Director: génère le DesignPlan structuré
      const artDirectorPrompt = buildArtDirectorPrompt({
        userPrompt: req.prompt,
        widthMm,
        heightMm,
        formatLabel,
        style: req.style as DesignStyle,
        includeBleed: req.includeBleed,
        bleedMm: effectiveBleed,
        availableFonts,
        palette: req.palette,
        productImageUrl: req.productImageUrl,
        productName: req.productName,
      })

      let plan: DesignPlan
      try {
        console.log('[Claude Design] Art Director — Step 1/4: Planning')
        console.log('  → Prompt length:', artDirectorPrompt.length)
        console.log('  → Format:', `${widthMm}×${heightMm}mm, style: ${req.style}`)

        plan = await generateJson<DesignPlan>({
          task: 'design.plan',
          prompt: artDirectorPrompt,
          schema: designPlanSchema,
          schemaForLLM: designPlanJsonSchema,
          schemaForClaude: designPlanJsonSchema,
          version: 'design.plan.v1',
        })

        console.log('[Claude Design] ✓ Art Director completed')
        console.log('  → Concept:', plan.concept)
        console.log('  → Device:', plan.mainDevice)
        console.log('  → Zones:', plan.zones.length)
        console.log('  → Palette:', plan.palette)
        console.log('  → Slots:', plan.slots.length)
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        console.error('[Claude Design] ✗ Art Director failed:', msg)
        setState((s) => ({ ...s, step: 'error', progress: '', error: `Art Director échoué : ${msg}`, lastResult: null, lastPlan: null }))
        return
      }

      setState((s) => ({ ...s, lastPlan: plan }))

      // ─────────────────────────────────────────────────────────────────────────────
      // PHASE 2 : Illustration (Nano Banana + Product Assets + SVG Engineer)
      // ─────────────────────────────────────────────────────────────────────────────
      setState((s) => ({ ...s, step: 'illustrating', progress: 'Génération créative (Nano Banana + Assets)…', lastPlan: plan }))

      // Parallèle: Nano Banana image generation + Product assets scraping
      console.log('[Claude Design] Step 2a/4: Nano Banana image generation + Product assets scraping')

      const supplierUrl = extractSupplierUrl(req.prompt, req.productImageUrl)
      const productName = req.productName || req.prompt.split('\n')[0].substring(0, 100)

      // Variable locale pour capturer l'image Nano Banana (ne pas compter sur setState asynchrone)
      let nanobananaImageUri: string | undefined

      const [designImageResult, productAssetsResult] = await Promise.all([
        generateFullDesignImage({
          userPrompt: req.prompt,
          plan,
          widthMm,
          heightMm,
          style: req.style as DesignStyle,
          dpi,
        }),
        supplierUrl && productName ? generateProductAssets(supplierUrl, productName) : Promise.resolve({ ok: true, assets: [] }),
      ])

      if (designImageResult.ok && designImageResult.dataUri) {
        console.log('[Claude Design] ✓ Nano Banana image generated')
        console.log('  → Data URI length:', designImageResult.dataUri.length)
        nanobananaImageUri = designImageResult.dataUri
      } else {
        console.warn('[Claude Design] ✗ Nano Banana failed:', designImageResult.error)
        // Continue sans image de référence
      }

      if (productAssetsResult.ok && productAssetsResult.assets?.length) {
        console.log('[Claude Design] ✓ Product assets extracted:', productAssetsResult.assets.length)
        productAssetsResult.assets.forEach((a) => {
          console.log(`  → ${a.type}: ${a.title || '(no title)'}`)
        })
      } else if (!productAssetsResult.ok) {
        console.warn('[Claude Design] Product assets failed:', (productAssetsResult as any).error)
      }

      // SVG Engineer avec multimodal (image + plan)
      console.log('[Claude Design] Step 2b/4: SVG Engineer structure generation')
      setState((s) => ({ ...s, progress: 'Structure SVG (Claude)…' }))

      const svgEngineerPrompt = buildSvgEngineerPrompt({
        plan,
        widthMm,
        heightMm,
        formatLabel,
        includeBleed: req.includeBleed,
        bleedMm: effectiveBleed,
        availableFonts,
        productAssets: productAssetsResult.assets,
      })

      interface SVGEngineResult {
        svg: string
        rationale?: string
        slots?: Array<{ id: string; role: string; promptSuggestion?: string }>
      }

      let engineResult: SVGEngineResult
      try {
        console.log('[Claude Design] SVG Engineer prompt length:', svgEngineerPrompt.length)
        console.log('  → Image reference:', designImageResult.ok ? 'YES' : 'NO')
        console.log('  → Multimodal mode:', designImageResult.ok && designImageResult.dataUri ? 'YES' : 'NO')

        engineResult = await generateJson<SVGEngineResult>({
          task: 'design.emit',
          prompt: svgEngineerPrompt,
          schema: z.object({
            svg: z.string(),
            rationale: z.string().optional(),
            slots: z.array(z.object({
              id: z.string(),
              role: z.string(),
              promptSuggestion: z.string().optional(),
            })).optional(),
          }) as unknown as z.ZodSchema<SVGEngineResult>,
          schemaForLLM: {
            type: 'object',
            properties: {
              svg: { type: 'string', description: 'SVG vectoriel complet en string' },
              rationale: { type: 'string', description: 'Explication des choix (1-2 phrases)' },
              slots: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    id: { type: 'string' },
                    role: { type: 'string' },
                    promptSuggestion: { type: 'string' },
                  },
                },
              },
            },
            required: ['svg'],
          } as Record<string, unknown>,
          version: 'design.emit.v1',
          imageDataUris: [
            ...(designImageResult.ok && designImageResult.dataUri ? [designImageResult.dataUri] : []),
            ...(productAssetsResult.assets?.map((a) => a.dataUri) ?? []),
          ].filter(Boolean).length > 0
            ? [
                ...(designImageResult.ok && designImageResult.dataUri ? [designImageResult.dataUri] : []),
                ...(productAssetsResult.assets?.map((a) => a.dataUri) ?? []),
              ]
            : undefined,
        })

        console.log('[Claude Design] ✓ SVG Engineer completed')
        console.log('  → SVG length:', engineResult.svg.length)
        console.log('  → Rationale:', engineResult.rationale?.substring(0, 80))
        console.log('  → SVG first 500 chars:', engineResult.svg.substring(0, 500))
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        console.error('[Claude Design] ✗ SVG Engineer failed:', msg)
        setState((s) => ({ ...s, step: 'error', progress: '', error: `SVG Engineer échoué : ${msg}`, lastResult: null, lastPlan: plan }))
        return
      }

      console.log('[Claude Design] Image injection strategy: Nano Banana as Layer 1 background')

      // Mappe le résultat SVG Engineer → DesignResult
      const fontsUsed = Array.from(new Set([plan.typography.heroFont, plan.typography.bodyFont]))
      const result: DesignResult = {
        svg: engineResult.svg,
        widthMm,
        heightMm,
        bleedMm: effectiveBleed,
        palette: plan.palette,
        fontsUsed,
        rationale: engineResult.rationale || '',
        slots: plan.slots.map((slot) => ({
          id: slot.id,
          role: slot.role,
          promptSuggestion: slot.description,
        })),
      }

      // ─────────────────────────────────────────────────────────────────────────────
      // PHASE 3 : Sanitizing
      // ─────────────────────────────────────────────────────────────────────────────
      console.log('[Claude Design] Step 3/4: Sanitizing')
      setState((s) => ({ ...s, step: 'sanitizing', progress: 'Validation du SVG…', lastPlan: plan, nanobananaImage: nanobananaImageUri }))

      let cleanSvg: string
      try {
        cleanSvg = sanitizeSvg(result.svg)
        console.log('[Claude Design] ✓ SVG sanitized')
        console.log('  → Original length:', result.svg.length)
        console.log('  → Cleaned length:', cleanSvg.length)
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        console.error('[Claude Design] ✗ SVG sanitization failed:', msg)
        setState((s) => ({ ...s, step: 'error', progress: '', error: `SVG invalide : ${msg}`, lastResult: null, lastPlan: plan }))
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

      // Injecter l'image Nano Banana comme background (placeholder:nanobanana)
      let slotDataUris: Map<string, string> = new Map()
      if (nanobananaImageUri) {
        slotDataUris.set('nanobanana', nanobananaImageUri)
        console.log('[Claude Design] Injecting Nano Banana image as background asset')
      }

      // Pré-remplissage de l'image produit pour le slot avec role "product" (optionnel)
      if (req.productImageUrl) {
        const productSlot = result.slots.find((s) => s.role === 'product')
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

      // Remplacer tous les placeholders image par les data URIs pré-remplis
      let finalSvg = cleanSvg
      for (const [slotId, dataUri] of slotDataUris) {
        const placeholderHref = `placeholder:${slotId}`
        finalSvg = finalSvg.replace(new RegExp(`href="${placeholderHref}"`, 'g'), `href="${dataUri}"`)
      }

      // ─────────────────────────────────────────────────────────────────────────────
      // PHASE 4 : Rendering
      // ─────────────────────────────────────────────────────────────────────────────
      console.log('[Claude Design] Step 4/4: Rendering on canvas')
      setState((s) => ({ ...s, step: 'rendering', progress: 'Rendu sur le canvas…', lastPlan: plan }))

      const canvas = globalFabricCanvas
      if (!canvas) {
        console.error('[Claude Design] ✗ Canvas not initialized')
        setState((s) => ({ ...s, step: 'error', progress: '', error: 'Canvas non initialisé', lastResult: null, lastPlan: plan }))
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
        setState((s) => ({ ...s, step: 'error', progress: '', error: `Parse SVG échoué : ${msg}`, lastResult: null, lastPlan: plan }))
        return
      }

      console.log('[Claude Design] ✓ Pipeline completed successfully!')
      console.log('  → Total time:', new Date().getTime(), 'ms')
      console.log('[Claude Design] Setting state to done with nanobananaImageUri:', !!nanobananaImageUri)
      setState((s) => ({ ...s, step: 'done', progress: '', error: null, lastResult: result, lastPlan: plan, nanobananaImage: nanobananaImageUri }))
    } catch (fatalErr) {
      console.error('[Claude Design] ✗ Fatal error:', fatalErr)
      setState((s) => ({ ...s, step: 'error', progress: '', error: `Erreur fatale : ${fatalErr instanceof Error ? fatalErr.message : String(fatalErr)}`, lastResult: null, lastPlan: null }))
    } finally {
      runningRef.current = false
    }
  }, [])

  const reset = useCallback(() => {
    setState({ step: 'idle', progress: '', error: null, lastResult: null, lastPlan: null, nanobananaImage: undefined })
  }, [])

  return { state, generate, reset }
}
