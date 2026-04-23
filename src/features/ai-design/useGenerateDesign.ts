import { useState, useCallback, useRef } from 'react'
import { toast } from 'sonner'
import { generateJson } from '@/features/ai/llmRouter'
import { buildTemplateFillPrompt } from './templateFillPrompt'
import { templateFillSchema, templateFillJsonSchema, type TemplateFillData } from './templateFillSchema'
import { listTemplates, getTemplate, pickTemplateByAspect } from './templates'
import { assembleSvgFromTemplate } from './templates/assembler'
import { generateProductAssets, extractSupplierUrl } from './generateProductAssets'
import { generateNanoBananaRef } from './generateNanoBananaRef'
import { saveRefImageToGallery } from './saveRefImageToGallery'
import { sanitizeSvg } from './sanitizeSvg'
import { validateSvgFonts } from './fontsValidator'
import { scaleObjectForCanvas } from './scaleFabricObjects'
import type { DesignRequest, DesignResult, DesignStyle } from './types'
import { parseSvgToFabric } from '@/features/svg/svgToFabric'
import { globalFabricCanvas, globalFitCanvas } from '@/features/editor/CanvasContainer'
import { syncToStore } from '@/features/editor/useAddObject'
import { useUIStore } from '@/stores/ui.store'
import { useEditorStore } from '@/stores/editor.store'
import { useNanoBanaStore } from '@/stores/nanobana.store'
import { getFormatById } from '@/features/print/PRINT_FORMATS'
import { mmToPx, pxToMm } from '@/features/print/dimensions'
import { AVAILABLE_FONTS } from '@/features/assets/useFonts'

export type Step = 'idle' | 'planning' | 'illustrating' | 'sanitizing' | 'rendering' | 'done' | 'error'

interface State {
  step: Step
  progress: string
  error: string | null
  lastResult: DesignResult | null
  lastFillData: TemplateFillData | null
  /** Data URI PNG d'une ref créative générée par Nano Banana en parallèle du
   *  pipeline principal. Affichée pour comparaison visuelle — n'influence PAS
   *  le template ni le SVG final. */
  nanobananaRef: string | null
}

export function useGenerateDesign() {
  const runningRef = useRef(false)
  const [state, setState] = useState<State>({
    step: 'idle',
    progress: '',
    error: null,
    lastResult: null,
    lastFillData: null,
    nanobananaRef: null,
  })

  const generate = useCallback(async (req: DesignRequest) => {
    if (runningRef.current) return
    runningRef.current = true
    try {
      setState((s) => ({ ...s, error: null, lastResult: null, lastFillData: null, nanobananaRef: null }))

      // ─── Dimensions canvas ─────────────────────────────────────────────────
      const { canvasWidth, canvasHeight, bleedMm: storeBleed, dpi: storeDpi } = useUIStore.getState()

      let formatLabel = `Custom ${canvasWidth} × ${canvasHeight} px`
      let formatNativeDpi: number | undefined
      if (req.formatId !== 'custom') {
        const f = getFormatById(req.formatId)
        if (f) {
          const fDpi = f.nativeDpi ?? storeDpi
          const wPxExpected = Math.round(mmToPx(f.widthMm, fDpi))
          const hPxExpected = Math.round(mmToPx(f.heightMm, fDpi))
          if (Math.abs(wPxExpected - canvasWidth) <= 2 && Math.abs(hPxExpected - canvasHeight) <= 2) {
            formatLabel = f.label
            formatNativeDpi = f.nativeDpi
          }
        }
      }

      const dpi = formatNativeDpi ?? storeDpi
      const widthMm = pxToMm(canvasWidth, dpi)
      const heightMm = pxToMm(canvasHeight, dpi)
      const effectiveBleed = req.includeBleed ? Math.max(storeBleed, 3) : 0

      if (useUIStore.getState().bleedMm !== effectiveBleed) {
        useUIStore.getState().setBleedMm(effectiveBleed)
      }

      console.log('[Claude Design] Canvas:', `${widthMm.toFixed(0)}×${heightMm.toFixed(0)}mm (bleed ${effectiveBleed}mm)`, 'format:', formatLabel)

      // ─── Phase 1 : scraping + Nano Banana ref en parallèle ─────────────────
      // La ref Nano Banana sert uniquement d'aperçu visuel dans l'UI. Elle
      // tourne en parallèle du scraping pour ne pas rallonger le pipeline.
      // Si elle échoue, le design est produit quand même.
      setState((s) => ({ ...s, step: 'illustrating', progress: 'Récupération des assets produit…' }))

      const supplierUrl = extractSupplierUrl(req.prompt, req.productImageUrl)
      const productName = req.productName || req.prompt.split('\n')[0].substring(0, 100)

      const [productAssetsResult, nanobananaResult] = await Promise.all([
        supplierUrl && productName
          ? generateProductAssets(supplierUrl, productName)
          : Promise.resolve({ ok: true, assets: [] as Array<{ type: string; title?: string; dataUri: string }> }),
        generateNanoBananaRef({
          userPrompt: req.prompt,
          widthMm,
          heightMm,
          style: req.style as DesignStyle,
          dpi,
          palette: req.palette,
        }).catch((err) => ({ ok: false as const, error: err instanceof Error ? err.message : String(err) })),
      ])

      const scrapedAssets = productAssetsResult.ok ? (productAssetsResult.assets ?? []) : []
      console.log(`[Claude Design] ✓ ${scrapedAssets.length} assets scrapés`)
      scrapedAssets.forEach((a, i) => console.log(`  → [${i}] ${a.type}: ${a.title ?? ''}`))

      if (nanobananaResult.ok && nanobananaResult.dataUri) {
        const refUri = nanobananaResult.dataUri
        console.log('[Claude Design] ✓ Nano Banana ref générée — affichée dans la modale + sauvée en galerie')
        setState((s) => ({ ...s, nanobananaRef: refUri }))

        // Sauvegarde persistante dans la galerie du projet. Fire-and-forget :
        // l'utilisateur retrouve la ref dans son DAM Nano Banana même après
        // fermeture de la modale DesignProgress.
        const projectId = useEditorStore.getState().projectId
        if (projectId) {
          const shortName = productName.slice(0, 60).trim()
          const dateLabel = new Date().toLocaleString('fr-FR', {
            day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
          })
          const refName = `Ref Nano Banana — ${shortName || 'Design'} — ${dateLabel}`
          void saveRefImageToGallery({
            dataUri: refUri,
            projectId,
            name: refName,
            tags: ['design-ref', req.style],
          }).then((img) => {
            if (img) {
              useNanoBanaStore.getState().addImage(img)
              toast.success('Ref Nano Banana sauvée dans la galerie')
            }
          })
        } else {
          console.warn('[Claude Design] Pas de projectId — ref NB non sauvée en galerie')
        }
      } else {
        const errMsg = 'error' in nanobananaResult ? nanobananaResult.error : 'inconnu'
        console.warn('[Claude Design] ✗ Nano Banana ref échouée :', errMsg)
        toast.warning(`Ref Nano Banana non générée : ${errMsg?.slice(0, 80) ?? 'inconnu'}`)
      }

      // ─── Phase 2 : LLM template fill ──────────────────────────────────────
      setState((s) => ({ ...s, step: 'planning', progress: 'Sélection du template et rédaction…' }))

      const templates = listTemplates()
      const prompt = buildTemplateFillPrompt({
        userPrompt: req.prompt,
        productName: req.productName,
        templates,
        scrapedAssets: scrapedAssets.map((a) => ({ type: a.type, title: a.title })),
        widthMm,
        heightMm,
      })

      let fillData: TemplateFillData
      try {
        fillData = await generateJson<TemplateFillData>({
          task: 'design.templateFill',
          prompt,
          schema: templateFillSchema,
          schemaForLLM: templateFillJsonSchema,
          schemaForClaude: templateFillJsonSchema,
          version: 'design.templateFill.v1',
        })
        console.log('[Claude Design] ✓ Template fill:', fillData.templateId, '|', fillData.copy.features.length, 'features')
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        setState((s) => ({ ...s, step: 'error', progress: '', error: `LLM échoué : ${msg}`, lastResult: null, lastFillData: null }))
        return
      }

      // ─── Phase 3 : assemblage SVG ──────────────────────────────────────────
      setState((s) => ({ ...s, progress: 'Assemblage du SVG…', lastFillData: fillData }))

      let template = getTemplate(fillData.templateId)
      if (!template) {
        console.warn(`[Claude Design] Template inconnu "${fillData.templateId}", fallback sur aspect-based`)
        template = pickTemplateByAspect(widthMm, heightMm)
      }

      const assembledSvg = assembleSvgFromTemplate({
        template,
        fillData,
        widthMm,
        heightMm,
        bleedMm: effectiveBleed,
      })

      // ─── Phase 4 : sanitize ────────────────────────────────────────────────
      setState((s) => ({ ...s, step: 'sanitizing', progress: 'Validation du SVG…' }))

      let cleanSvg: string
      try {
        cleanSvg = sanitizeSvg(assembledSvg)
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        setState((s) => ({ ...s, step: 'error', progress: '', error: `SVG invalide : ${msg}`, lastResult: null, lastFillData: fillData }))
        return
      }

      // Fonts validation + fallback
      const availableFonts = AVAILABLE_FONTS.map((f) => f.family)
      const fontCheck = validateSvgFonts(cleanSvg, availableFonts)
      if (fontCheck.missingFonts.length > 0) {
        toast.warning(`Fonts non disponibles : ${fontCheck.missingFonts.join(', ')}. Remplacées par Inter.`)
        for (const missing of fontCheck.missingFonts) {
          const reDouble = new RegExp(`font-family\\s*=\\s*"${missing}[^"]*"`, 'g')
          const reSingle = new RegExp(`font-family\\s*=\\s*'${missing}[^']*'`, 'g')
          cleanSvg = cleanSvg.replace(reDouble, 'font-family="Inter"').replace(reSingle, 'font-family="Inter"')
        }
      }

      // ─── Phase 5 : injection des assets scrapés ───────────────────────────
      let finalSvg = cleanSvg
      const replacePlaceholder = (slotId: string, assetIdx: number | undefined) => {
        if (assetIdx === undefined || assetIdx < 0 || assetIdx >= scrapedAssets.length) return
        const dataUri = scrapedAssets[assetIdx].dataUri
        finalSvg = finalSvg.replace(
          new RegExp(`href="placeholder:${slotId}"`, 'g'),
          `href="${dataUri}"`,
        )
        console.log(`[Claude Design] Slot "${slotId}" ← asset #${assetIdx}`)
      }
      replacePlaceholder('logo', fillData.assetMappings.logo)
      replacePlaceholder('badge', fillData.assetMappings.badge)
      replacePlaceholder('heroProduct', fillData.assetMappings.heroProduct)

      const result: DesignResult = {
        svg: finalSvg,
        widthMm,
        heightMm,
        bleedMm: effectiveBleed,
        palette: [
          fillData.palette.primary,
          fillData.palette.secondary,
          fillData.palette.neutral,
          fillData.palette.text,
        ],
        fontsUsed: Array.from(new Set([template.fonts.hero, template.fonts.body])),
        rationale: `Template ${template.label} — ${fillData.copy.features.length} features`,
        slots: [],
      }
      void formatLabel

      // ─── Phase 6 : rendering sur canvas ───────────────────────────────────
      setState((s) => ({ ...s, step: 'rendering', progress: 'Rendu sur le canvas…' }))

      const canvas = globalFabricCanvas
      if (!canvas) {
        setState((s) => ({ ...s, step: 'error', progress: '', error: 'Canvas non initialisé', lastResult: null, lastFillData: fillData }))
        return
      }

      const toRemove = canvas.getObjects().filter((o) => !o.data?.isGrid && !o.data?.isPageBg && !o.data?.isPrintMark)
      for (const o of toRemove) canvas.remove(o)

      try {
        const { objects } = await parseSvgToFabric(finalSvg)
        const scale = canvasWidth / widthMm
        for (const obj of objects) {
          scaleObjectForCanvas(obj, scale)
          canvas.add(obj)
        }
        canvas.requestRenderAll()
        syncToStore(canvas)
        requestAnimationFrame(() => globalFitCanvas?.())
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        setState((s) => ({ ...s, step: 'error', progress: '', error: `Parse SVG échoué : ${msg}`, lastResult: null, lastFillData: fillData }))
        return
      }

      console.log('[Claude Design] ✓ Pipeline terminé')
      setState((s) => ({ ...s, step: 'done', progress: '', error: null, lastResult: result, lastFillData: fillData }))
    } catch (fatalErr) {
      console.error('[Claude Design] ✗ Fatal:', fatalErr)
      setState((s) => ({ ...s, step: 'error', progress: '', error: `Erreur fatale : ${fatalErr instanceof Error ? fatalErr.message : String(fatalErr)}`, lastResult: null, lastFillData: null }))
    } finally {
      runningRef.current = false
    }
  }, [])

  const reset = useCallback(() => {
    setState({ step: 'idle', progress: '', error: null, lastResult: null, lastFillData: null, nanobananaRef: null })
  }, [])

  return { state, generate, reset }
}
