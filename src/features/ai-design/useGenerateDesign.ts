import { useState, useCallback, useRef } from 'react'
import { toast } from 'sonner'
import { generateJson } from '@/features/ai/llmRouter'
import { buildArtDirectorPrompt } from './artDirectorPrompt'
import { designPlanSchema, designPlanJsonSchema, type DesignPlan } from './artDirectorSchema'
import { buildSvgFromPlan } from './buildSvgFromPlan'
import { vectorizeImage } from './vectorizeImage'
import { renderVectorPlan } from './renderVectorPlan'
import { generateFullDesignImage } from './generateFullDesignImage'
import { generateProductAssets, extractSupplierUrl } from './generateProductAssets'
import { sanitizeSvg } from './sanitizeSvg'
import { validateSvgFonts } from './fontsValidator'
import { rasterizeSvgForCritic } from './rasterizeSvg'
import { runVisionCritic } from './visionCritic'
import { applyCriticPatch } from './applyCriticPatch'
import { clampPlanToCanvas } from './clampPlanToCanvas'
import { scaleObjectForCanvas } from './scaleFabricObjects'
import type { FidelityCheckResult } from './svgFidelityValidator'
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
import { saveRefImageToGallery } from './saveRefImageToGallery'

export type Step = 'idle' | 'planning' | 'illustrating' | 'sanitizing' | 'rendering' | 'done' | 'error'

interface State {
  step: Step
  progress: string
  error: string | null
  lastResult: DesignResult | null
  lastPlan: DesignPlan | null
  nanobananaImage?: string
  validationAttempt?: number
  lastValidationResult?: FidelityCheckResult
}

const PROMPT_VERSION = 'design.generate.v1'

/**
 * Trace par rôle : liste chaque zone du plan avec son role, la présence de
 * fill/content et les 40 premiers caractères du content. Permet de voir en un
 * coup d'œil si l'Art Director (ou le Critic) a bien planté les zones
 * texte attendues (features, description, CTA text, badges).
 */
function logZoneContents(label: string, plan: DesignPlan): void {
  try {
    const rows = plan.zones.map((z) => ({
      id: z.id,
      role: z.role,
      fill: z.fill ?? '',
      contentSnippet: z.content
        ? z.content.length > 40
          ? z.content.slice(0, 40) + '…'
          : z.content
        : '',
      hasContent: !!z.content && z.content.trim() !== '',
    }))
    console.groupCollapsed(`[Claude Design] Zones (${label}) — ${rows.length}`)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(console as any).table?.(rows) ?? console.log(rows)
    const textCapable = rows.filter((r) => r.hasContent).length
    console.log(`→ ${textCapable} zones portent du texte, ${rows.length - textCapable} sans content`)

    // Signal les "rectangles muets" : zones cta/price/accent avec fill mais sans
    // content, qui apparaîtront comme des blocs de couleur vides (symptôme
    // historique du CTA "ACHETER MAINTENANT" absent + badges sans label).
    const mutedRects = plan.zones.filter(
      (z) =>
        (z.role === 'cta' || z.role === 'price' || z.role === 'accent') &&
        !!z.fill &&
        (!z.content || z.content.trim() === ''),
    )
    if (mutedRects.length > 0) {
      console.warn(
        `[Claude Design] ⚠️ ${mutedRects.length} zone(s) avec fill mais sans content (${label}) — rectangle muet probable :`,
        mutedRects.map((z) => `${z.id} (${z.role})`),
      )
    }

    // Alerte sur les zones dont la fontSize planifiée est sous le seuil de
    // lisibilité — le rendu les produira mais elles seront illisibles. Signal
    // fort que le Critic shrinke trop au lieu d'élargir les bboxes.
    const readabilityFloor: Record<string, number> = {
      title: 10,
      subtitle: 7,
      body: 5,
      cta: 6,
      price: 7,
      accent: 3,
    }
    const tooSmall = plan.zones.filter((z) => {
      if (!z.content || z.content.trim() === '') return false
      const floor = readabilityFloor[z.role] ?? 5
      const size = z.fontSize ?? plan.typography.hierarchy.find((h) => h.role === z.role)?.size ?? 10
      return size < floor
    })
    if (tooSmall.length > 0) {
      console.warn(
        `[Claude Design] ⚠️ ${tooSmall.length} zone(s) avec fontSize < plancher lisible (${label}) :`,
        tooSmall.map((z) => `${z.id} (${z.role}, ${z.fontSize}pt)`),
      )
    }
    console.groupEnd()
  } catch (err) {
    console.warn('[Claude Design] logZoneContents failed:', err)
  }
}

export function useGenerateDesign() {
  const runningRef = useRef(false)
  const [state, setState] = useState<State>({
    step: 'idle',
    progress: '',
    error: null,
    lastResult: null,
    lastPlan: null,
    nanobananaImage: undefined,
    validationAttempt: 0,
    lastValidationResult: undefined,
  })

  const generate = useCallback(async (req: DesignRequest) => {
    if (runningRef.current) return
    runningRef.current = true
    try {
      setState((s) => ({ ...s, error: null, lastResult: null, lastPlan: null }))

      // Le CANVAS est la source de vérité pour les dimensions (évite race conditions
      // entre le brief persisté et les dimensions réelles du document ouvert).
      // Le brief ne sert qu'à déterminer le formatLabel (affichage UI).
      const { canvasWidth, canvasHeight, bleedMm: storeBleed, dpi: storeDpi } = useUIStore.getState()

      // Choix du DPI : si le brief pointe sur un format connu ET que ses dimensions
      // matchent le canvas (± 2 px), on utilise son nativeDpi (96 pour écran/social,
      // 300 pour print). Sinon on retombe sur le DPI du store.
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
      console.log('[Claude Design] Source de vérité = canvas:', {
        canvasPx: `${canvasWidth}×${canvasHeight}`,
        dimsMm: `${widthMm.toFixed(1)}×${heightMm.toFixed(1)}`,
        dpi,
        formatLabel,
      })
      const effectiveBleed = req.includeBleed ? Math.max(storeBleed, 3) : 0

      // Garde le store UI synchro pour que l'overlay de repères (useEffect dans CanvasContainer)
      // dessine des traits de coupe correspondant au bleed réellement utilisé dans le SVG.
      if (useUIStore.getState().bleedMm !== effectiveBleed) {
        useUIStore.getState().setBleedMm(effectiveBleed)
      }

      const availableFonts = AVAILABLE_FONTS.map((f) => f.family)

      // ─────────────────────────────────────────────────────────────────────────────
      // PHASE 1 : Nano Banana (image de référence) + Scraper (assets fournisseur)
      // ─────────────────────────────────────────────────────────────────────────────
      setState((s) => ({ ...s, step: 'illustrating', progress: 'Génération créative (Nano Banana + Assets)…' }))
      console.log('[Claude Design] Step 1/3: Nano Banana image generation + Product assets scraping')

      const supplierUrl = extractSupplierUrl(req.prompt, req.productImageUrl)
      const productName = req.productName || req.prompt.split('\n')[0].substring(0, 100)

      let nanobananaImageUri: string | undefined

      const [designImageResult, productAssetsResult] = await Promise.all([
        generateFullDesignImage({
          userPrompt: req.prompt,
          widthMm,
          heightMm,
          style: req.style as DesignStyle,
          dpi,
          palette: req.palette,
        }),
        supplierUrl && productName ? generateProductAssets(supplierUrl, productName) : Promise.resolve({ ok: true, assets: [] }),
      ])

      if (designImageResult.ok && designImageResult.dataUri) {
        console.log('[Claude Design] ✓ Nano Banana image generated')
        nanobananaImageUri = designImageResult.dataUri

        // Fire-and-forget : sauvegarde dans la galerie pour comparaison visuelle
        // par l'utilisateur et pour que le Vision Critic puisse y puiser si besoin.
        const projectId = useEditorStore.getState().projectId
        if (projectId) {
          const refName = `Ref Nano Banana — ${productName.slice(0, 60)} — ${new Date().toLocaleString('fr-FR', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' })}`
          void saveRefImageToGallery({
            dataUri: nanobananaImageUri,
            projectId,
            name: refName,
            tags: ['design-ref', req.style],
          }).then((img) => {
            if (img) useNanoBanaStore.getState().addImage(img)
          })
        }
      } else {
        console.warn('[Claude Design] ✗ Nano Banana failed:', designImageResult.error)
      }

      if (productAssetsResult.ok && productAssetsResult.assets?.length) {
        console.log('[Claude Design] ✓ Product assets extracted:', productAssetsResult.assets.length)
        productAssetsResult.assets.forEach((a) => {
          console.log(`  → ${a.type}: ${a.title || '(no title)'}`)
        })
      } else if (!productAssetsResult.ok) {
        console.warn('[Claude Design] Product assets failed:', (productAssetsResult as any).error)
      }

      // ─────────────────────────────────────────────────────────────────────────────
      // PHASE 2 : Art Director multimodal — analyse l'image + liste les assets scrapés,
      //          produit un plan RICHE qui retranscrit la composition Gemini.
      // ─────────────────────────────────────────────────────────────────────────────
      setState((s) => ({ ...s, step: 'planning', progress: 'Analyse et plan éditorial (Opus 4.7)…' }))
      console.log('[Claude Design] Step 2/3: Art Director — multimodal planning')

      const scrapedAssetsMeta = (productAssetsResult.assets ?? []).map((a) => ({
        type: a.type,
        title: a.title,
      }))

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
        hasReferenceImage: !!nanobananaImageUri,
        scrapedAssets: scrapedAssetsMeta.length > 0 ? scrapedAssetsMeta : undefined,
      })

      let plan: DesignPlan
      try {
        plan = await generateJson<DesignPlan>({
          task: 'design.plan',
          prompt: artDirectorPrompt,
          schema: designPlanSchema,
          schemaForLLM: designPlanJsonSchema,
          schemaForClaude: designPlanJsonSchema,
          version: 'design.plan.v2',
          imageDataUris: nanobananaImageUri ? [nanobananaImageUri] : undefined,
        })

        console.log('[Claude Design] ✓ Art Director completed')
        console.log('  → Concept:', plan.concept)
        console.log('  → Zones:', plan.zones.length, '| Slots:', plan.slots.length)

        // Clamp déterministe : prévient les titres qui bleed hors canvas, les CTA
        // placés en y > heightMm, etc. Le LLM ne respecte pas systématiquement
        // les bornes même avec des prompts explicites, on enforce en code.
        plan = clampPlanToCanvas(plan, { widthMm, heightMm, bleedMm: effectiveBleed })

        console.groupCollapsed('[Claude Design] Plan JSON (Art Director initial, post-clamp)')
        console.log(JSON.stringify(plan, null, 2))
        console.groupEnd()
        logZoneContents('Art Director initial', plan)
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        console.error('[Claude Design] ✗ Art Director failed:', msg)
        setState((s) => ({ ...s, step: 'error', progress: '', error: `Art Director échoué : ${msg}`, lastResult: null, lastPlan: null }))
        return
      }

      setState((s) => ({ ...s, lastPlan: plan }))

      // Assemblage 100 % vectoriel : tout vient du plan Art Director (zones
      // structurelles + slots image + textes). L'image Nano Banana ne sert QUE
      // d'inspiration multimodale pour Opus — elle n'est JAMAIS injectée dans
      // le SVG ni le canvas.
      console.log('[Claude Design] Step 2b/4: Pure vector SVG assembly')
      setState((s) => ({ ...s, progress: 'Assemblage vectoriel…' }))

      let assembledSvg = buildSvgFromPlan({
        plan,
        widthMm,
        heightMm,
        includeBleed: req.includeBleed,
        bleedMm: effectiveBleed,
      })
      console.log('[Claude Design] ✓ SVG assembled (pure vector), length:', assembledSvg.length)

      // ─────────────────────────────────────────────────────────────────────────────
      // PHASE 2c : Vision Critic (boucle max 2 itérations)
      // Compare le rendu SVG à la référence Nano Banana, émet un patch structuré,
      // on l'applique et on ré-assemble. Convergence garantie par ops discrètes
      // (pas de rewrite complet) + plafond d'itérations.
      // ─────────────────────────────────────────────────────────────────────────────
      if (nanobananaImageUri) {
        const MAX_CRITIC_ITERATIONS = 2
        for (let iter = 0; iter < MAX_CRITIC_ITERATIONS; iter++) {
          setState((s) => ({ ...s, progress: `Vision Critic (passe ${iter + 1}/${MAX_CRITIC_ITERATIONS})…` }))
          console.log(`[Claude Design] Vision Critic pass ${iter + 1}/${MAX_CRITIC_ITERATIONS}`)

          let renderedDataUri: string
          try {
            renderedDataUri = await rasterizeSvgForCritic(assembledSvg, widthMm, heightMm)
          } catch (err) {
            console.warn('[Claude Design] Rasterize failed, skipping critic:', err)
            break
          }

          let patch
          try {
            patch = await runVisionCritic({
              plan,
              widthMm,
              heightMm,
              referenceImage: nanobananaImageUri,
              renderedImage: renderedDataUri,
            })
          } catch (err) {
            console.warn('[Claude Design] Critic failed, keeping current render:', err)
            break
          }

          console.log(`[Claude Design] Critic verdict: ${patch.verdict} (score=${patch.fidelityScore}), ops=${patch.ops.length}`)
          console.log(`  → Summary: ${patch.summary}`)
          console.groupCollapsed(`[Claude Design] Critic ops détaillés (pass ${iter + 1})`)
          patch.ops.forEach((op, i) => {
            const content = 'content' in op && op.content ? ` content="${op.content.slice(0, 60)}${op.content.length > 60 ? '…' : ''}"` : ''
            const role = 'role' in op && op.role ? ` role=${op.role}` : ''
            console.log(`#${i} ${op.op} id=${op.id}${role}${content} — ${op.reason}`)
          })
          console.groupEnd()

          if (patch.verdict === 'pass') {
            console.log('[Claude Design] ✓ Critic pass — fidelity ≥ 85, stopping loop')
            break
          }
          if (patch.verdict === 'fail' && patch.ops.length === 0) {
            console.warn(`[Claude Design] ✗ Critic fail (score=${patch.fidelityScore}) sans ops — design non réparable, on garde le rendu courant`)
            break
          }
          if (patch.ops.length === 0) {
            console.log('[Claude Design] ⊘ Critic returned no ops — stopping loop')
            break
          }

          plan = applyCriticPatch(plan, patch)
          // Re-clamp après chaque patch — le Critic peut réintroduire des
          // débordements que l'AD avait initialement évités.
          plan = clampPlanToCanvas(plan, { widthMm, heightMm, bleedMm: effectiveBleed })
          setState((s) => ({ ...s, lastPlan: plan }))

          assembledSvg = buildSvgFromPlan({
            plan,
            widthMm,
            heightMm,
            includeBleed: req.includeBleed,
            bleedMm: effectiveBleed,
          })
          console.log(`[Claude Design] ✓ Re-assembled after patch (${plan.zones.length} zones, ${plan.slots.length} slots)`)
          logZoneContents(`après Critic pass ${iter + 1}`, plan)
        }
      }

      console.groupCollapsed('[Claude Design] Plan JSON final (avant sanitize)')
      console.log(JSON.stringify(plan, null, 2))
      console.groupEnd()

      const fontsUsed = Array.from(new Set([plan.typography.heroFont, plan.typography.bodyFont]))
      const result: DesignResult = {
        svg: assembledSvg,
        widthMm,
        heightMm,
        bleedMm: effectiveBleed,
        palette: plan.palette,
        fontsUsed,
        rationale: `${plan.concept} — SVG 100% éditable (${plan.zones.length} zones, ${plan.slots.length} slots)`,
        slots: plan.slots.map((s) => ({ id: s.id, role: s.role, promptSuggestion: s.description })),
      }
      void formatLabel
      void designImageResult
      void vectorizeImage
      void renderVectorPlan

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

      // Injection des assets scrapés : l'Art Director a assigné explicitement
      // chaque asset à un slot via assetIndex. On respecte cette assignation en
      // priorité. Fallback (si pas d'assetIndex) : matching par type / rôle.
      const slotDataUris: Map<string, string> = new Map()
      const scrapedAssets = productAssetsResult.assets ?? []

      if (scrapedAssets.length > 0) {
        const usedIndices = new Set<number>()

        // Passe 1 : respecter les assetIndex explicites du plan
        for (const slot of plan.slots) {
          const idx = slot.assetIndex
          if (idx === undefined || idx < 0 || idx >= scrapedAssets.length) continue
          if (usedIndices.has(idx)) {
            console.warn(`[Claude Design] assetIndex ${idx} déjà utilisé, ignoré pour slot ${slot.id}`)
            continue
          }
          slotDataUris.set(slot.id, scrapedAssets[idx].dataUri)
          usedIndices.add(idx)
          console.log(`[Claude Design] Slot "${slot.id}" ← asset #${idx} (${scrapedAssets[idx].type}: ${scrapedAssets[idx].title ?? ''})`)
        }

        // Passe 2 : fallback type-based pour les slots sans assetIndex (ou avec
        // un index invalide). N'utilise que les assets non encore consommés.
        const availableByType: Record<string, number[]> = {}
        scrapedAssets.forEach((a, i) => {
          if (usedIndices.has(i)) return
          if (!availableByType[a.type]) availableByType[a.type] = []
          availableByType[a.type].push(i)
        })
        const takeFromType = (type: string): number | null => {
          const q = availableByType[type]
          if (q && q.length > 0) return q.shift()!
          return null
        }

        for (const slot of plan.slots) {
          if (slotDataUris.has(slot.id)) continue
          const role = slot.role.toLowerCase()
          const id = slot.id.toLowerCase()
          let idx: number | null = null
          if (role.includes('logo') || id.includes('logo')) {
            idx = takeFromType('logo') ?? takeFromType('picto')
          } else if (role.includes('picto') || id.includes('picto') || role === 'accent') {
            idx = takeFromType('picto') ?? takeFromType('logo')
          } else {
            idx = takeFromType('image') ?? takeFromType('picto') ?? takeFromType('logo')
          }
          if (idx !== null) {
            slotDataUris.set(slot.id, scrapedAssets[idx].dataUri)
            usedIndices.add(idx)
            console.log(`[Claude Design] Slot "${slot.id}" ← asset #${idx} (fallback type match)`)
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

      // Canvas déjà à la bonne taille (on l'a utilisé pour dériver widthMm/heightMm).
      // On ne redimensionne PAS — le canvas est la source de vérité.
      const canvasWidthPx = canvasWidth

      const toRemove = canvas.getObjects().filter((o) => {
        return !o.data?.isGrid && !o.data?.isPageBg && !o.data?.isPrintMark
      })
      for (const o of toRemove) canvas.remove(o)

      try {
        const { objects } = await parseSvgToFabric(finalSvg)

        // Les unités SVG sont en mm (viewBox en mm par contrat de prompt).
        // Scale uniforme mm → px. Pas de translation — les coordonnées SVG
        // utilisent déjà le format fini comme origine ; le bleed est en coords négatives.
        // Pour les textes, le scaling se fait sur les propriétés intrinsèques
        // (fontSize, width, styles char-level) au lieu de scaleX/Y — sinon les
        // handles latéraux de Textbox changent width puis initDimensions reflow
        // avec la fontSize mm (minuscule) → perte de formatage à l'édition.
        const scale = canvasWidthPx / widthMm
        for (const obj of objects) {
          scaleObjectForCanvas(obj, scale)
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
      setState((s) => ({
        ...s,
        step: 'done',
        progress: '',
        error: null,
        lastResult: result,
        lastPlan: plan,
        nanobananaImage: nanobananaImageUri,
        lastValidationResult: s.lastValidationResult,
      }))
    } catch (fatalErr) {
      console.error('[Claude Design] ✗ Fatal error:', fatalErr)
      setState((s) => ({ ...s, step: 'error', progress: '', error: `Erreur fatale : ${fatalErr instanceof Error ? fatalErr.message : String(fatalErr)}`, lastResult: null, lastPlan: null }))
    } finally {
      runningRef.current = false
    }
  }, [])

  const reset = useCallback(() => {
    setState({
      step: 'idle',
      progress: '',
      error: null,
      lastResult: null,
      lastPlan: null,
      nanobananaImage: undefined,
      validationAttempt: 0,
      lastValidationResult: undefined,
    })
  }, [])

  return { state, generate, reset }
}
