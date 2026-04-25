import { useState, useCallback, useRef } from 'react'
import { toast } from 'sonner'
import { generateNanoBananaRef } from './generateNanoBananaRef'
import { saveRefImageToGallery } from './saveRefImageToGallery'
import { analyzeDesignForEdit } from './analyzeDesignForEdit'
import { scrapeProductForDesign, detectUrlInPrompt, type ScrapedProductData } from './scrapeProductForDesign'
import { composeDesignFromScrapedData } from './composeDesignFromScrapedData'
import type { TextElement } from './analyzeDesignForEdit'
import {
  renderBackground,
  renderDecorativeShapes,
  addEditableTextOverlays,
  addEditableImageSlots,
} from './createHybridDesignCanvas'
import { ensureGoogleFontsLoaded } from '@/features/assets/useFonts'
import type { DesignRequest, DesignResult, DesignStyle } from './types'
import { globalFabricCanvas, globalFitCanvas } from '@/features/editor/CanvasContainer'
import { syncToStore } from '@/features/editor/useAddObject'
import { useUIStore } from '@/stores/ui.store'
import { useEditorStore } from '@/stores/editor.store'
import { useNanoBanaStore } from '@/stores/nanobana.store'
import { getFormatById } from '@/features/print/PRINT_FORMATS'
import { mmToPx, pxToMm } from '@/features/print/dimensions'

export type Step = 'idle' | 'illustrating' | 'analyzing' | 'rendering' | 'done' | 'error'
export type FailableStep = Exclude<Step, 'idle' | 'done' | 'error'>

interface State {
  step: Step
  progress: string
  error: string | null
  /** Étape qui a échoué. Permet à l'UI d'afficher l'échec au bon endroit sans
   *  deviner à partir du message d'erreur. */
  failedStep: FailableStep | null
  lastResult: DesignResult | null
  /** Data URI PNG de l'image Nano Banana, affichée en référence dans la modale. */
  nanobananaRef: string | null
}

const INITIAL_STATE: State = {
  step: 'idle',
  progress: '',
  error: null,
  failedStep: null,
  lastResult: null,
  nanobananaRef: null,
}

/**
 * Remplace les textes hallucinés par Nano Banana (relus par Claude Vision)
 * par les vraies valeurs scrapées depuis la source. Indispensable pour les
 * prix, prix barrés, rating et nombre d'avis qui doivent être exacts.
 */
function overrideTextsWithScrapedData(
  texts: TextElement[],
  scraped: ScrapedProductData
): TextElement[] {
  const PRICE_RE = /\d[\d\s ]*[,.]?\d*\s*€/
  const RATING_RE = /^\s*\d[.,]\d+\s*(\/\s*5)?\s*$/
  const REVIEWS_RE = /(\d+)\s*avis/i

  return texts.map((t) => {
    const txt = t.text || ''

    // Prix barré (oldPrice) → strikethrough
    if (t.strikethrough && PRICE_RE.test(txt) && scraped.oldPrice) {
      return { ...t, text: scraped.oldPrice }
    }

    // Prix actuel → contient € sans strikethrough
    if (!t.strikethrough && PRICE_RE.test(txt) && scraped.price) {
      return { ...t, text: scraped.price }
    }

    // Rating "4.3" / "4.3/5"
    if (RATING_RE.test(txt) && scraped.rating) {
      const hasOutOf5 = /\/\s*5/.test(txt)
      return { ...t, text: hasOutOf5 ? `${scraped.rating}/5` : scraped.rating }
    }

    // Review count "128 avis", "128 AVIS CLIENTS"
    if (REVIEWS_RE.test(txt) && scraped.reviewCount) {
      return { ...t, text: txt.replace(/\d+/, scraped.reviewCount) }
    }

    return t
  })
}

function resolveFormatDpi(req: DesignRequest, canvasWidth: number, canvasHeight: number, storeDpi: number): number {
  if (req.formatId === 'custom') return storeDpi
  const f = getFormatById(req.formatId)
  if (!f) return storeDpi
  const fDpi = f.nativeDpi ?? storeDpi
  const wPxExpected = Math.round(mmToPx(f.widthMm, fDpi))
  const hPxExpected = Math.round(mmToPx(f.heightMm, fDpi))
  const matches = Math.abs(wPxExpected - canvasWidth) <= 2 && Math.abs(hPxExpected - canvasHeight) <= 2
  return matches ? fDpi : storeDpi
}

export function useGenerateDesign() {
  const runningRef = useRef(false)
  const [state, setState] = useState<State>(INITIAL_STATE)

  const failAt = useCallback((failedStep: FailableStep, message: string, toastMsg?: string) => {
    setState((s) => ({ ...s, step: 'error', progress: '', error: message, failedStep, lastResult: null }))
    if (toastMsg) toast.error(toastMsg.slice(0, 120))
  }, [])

  const generate = useCallback(async (req: DesignRequest) => {
    if (runningRef.current) return
    runningRef.current = true
    try {
      setState({ ...INITIAL_STATE, step: 'illustrating', progress: 'Génération de l\'image Nano Banana…' })

      // ─── Dimensions canvas ─────────────────────────────────────────────────
      let { canvasWidth, canvasHeight, bleedMm: storeBleed, dpi: storeDpi } = useUIStore.getState()

      // GUARD: Si les dimensions sont 0 ou invalides, utiliser un default
      if (!canvasWidth || !canvasHeight || canvasWidth <= 0 || canvasHeight <= 0) {
        console.warn('[useGenerateDesign] Canvas dimensions invalid (0 or null), using default banner format')
        canvasWidth = 1584  // Standard banner width (16:9 ratio)
        canvasHeight = 900  // Standard banner height
      }

      const dpi = resolveFormatDpi(req, canvasWidth, canvasHeight, storeDpi)
      const widthMm = pxToMm(canvasWidth, dpi)
      const heightMm = pxToMm(canvasHeight, dpi)
      const effectiveBleed = req.includeBleed ? Math.max(storeBleed, 3) : 0

      if (useUIStore.getState().bleedMm !== effectiveBleed) {
        useUIStore.getState().setBleedMm(effectiveBleed)
      }

      // ─── Normalisation des URLs : auto-détection page produit vs image ──────
      // Si l'utilisateur colle une URL de page produit dans "IMAGE PRODUIT",
      // on la déplace vers siteUrl pour permettre le scraping.
      const looksLikeImageUrl = (u: string) => /\.(jpe?g|png|webp|gif|avif)(\?|$)/i.test(u)
      const looksLikeProductPage = (u: string) => /^https?:\/\//i.test(u) && !looksLikeImageUrl(u)

      let productImageUrl = req.productImageUrl
      let siteUrl = req.siteUrl

      if (productImageUrl && !siteUrl && looksLikeProductPage(productImageUrl)) {
        console.log('[Claude Design] Auto-detected product page URL in productImageUrl field, moving to siteUrl')
        siteUrl = productImageUrl
        productImageUrl = undefined
      }

      // Auto-detect : URL collée dans le PROMPT lui-même
      if (!siteUrl) {
        const urlInPrompt = detectUrlInPrompt(req.prompt)
        if (urlInPrompt && looksLikeProductPage(urlInPrompt)) {
          console.log('[Claude Design] Auto-detected URL in prompt, will scrape:', urlInPrompt)
          siteUrl = urlInPrompt
        }
      }

      // ─── Scraping produit : TOUJOURS si on a une siteUrl ─────────────────────
      let scrapedProductData = null
      let enrichedPrompt = req.prompt

      if (siteUrl) {
        setState((s) => ({ ...s, progress: 'Scraping données produit depuis la source…' }))
        console.log('[Claude Design] Scraping siteUrl:', siteUrl)
        try {
          scrapedProductData = await scrapeProductForDesign(siteUrl)
          if (scrapedProductData) {
            // L'image scrapée override l'image manuelle (sauf si l'utilisateur en a fourni une explicitement et qu'elle ressemble bien à une image)
            if (!productImageUrl) {
              productImageUrl = scrapedProductData.imageUrl || undefined
            }
            const specs = [
              scrapedProductData.price ? `Prix: ${scrapedProductData.price}` : null,
              scrapedProductData.brand ? `Marque: ${scrapedProductData.brand}` : null,
              scrapedProductData.features?.length ? `Caractéristiques: ${scrapedProductData.features.join(', ')}` : null,
              scrapedProductData.rating ? `Avis: ${scrapedProductData.rating}/5 (${scrapedProductData.reviewCount} avis)` : null,
            ].filter(Boolean).join(' | ')

            enrichedPrompt = `${req.prompt}\n\nDONNÉES PRODUIT RÉELLES À INTÉGRER:\n${scrapedProductData.title}\n${specs}`
            console.log('[Claude Design] Scraping OK:', {
              title: scrapedProductData.title?.slice(0, 60),
              price: scrapedProductData.price,
              oldPrice: scrapedProductData.oldPrice,
              imageUrl: scrapedProductData.imageUrl?.slice(0, 80),
              rating: scrapedProductData.rating,
              reviewCount: scrapedProductData.reviewCount,
              features: scrapedProductData.features?.length,
            })
          } else {
            console.warn('[Claude Design] Scraping returned null — Jina or Claude extraction failed')
            toast.warning('Scraping a retourné aucune donnée — bascule sur Nano Banana')
          }
        } catch (err) {
          console.warn('[Claude Design] Scraping failed, continuing with original prompt:', err)
          toast.warning('Scraping échoué — utilisation du prompt sans données produit')
        }
      }

      // ─── Branche : compose direct si on a des données scrapées valides ──
      // Sinon : pipeline Nano Banana + Claude Vision (créatif mais hallucinant)
      let analysis
      let dataUri: string | null = null

      if (scrapedProductData && scrapedProductData.title && scrapedProductData.imageUrl) {
        setState((s) => ({ ...s, step: 'rendering', progress: 'Composition directe depuis les données produit…' }))
        analysis = composeDesignFromScrapedData(scrapedProductData)
        console.log('[Claude Design] Compose direct: bypass Nano Banana, using scraped data')
      } else {
        // ─── Phase 1 : génération Nano Banana ─────────────────────────────────
        const nanobananaResult = await generateNanoBananaRef({
          userPrompt: enrichedPrompt,
          widthMm,
          heightMm,
          style: req.style as DesignStyle,
          dpi,
          palette: req.palette,
        }).catch((err) => ({ ok: false as const, error: err instanceof Error ? err.message : String(err) }))

        if (!nanobananaResult.ok || !nanobananaResult.dataUri) {
          const errMsg = nanobananaResult.ok ? 'inconnue' : nanobananaResult.error
          failAt('illustrating', `Échec génération Nano Banana : ${errMsg}`, `Nano Banana a échoué : ${errMsg ?? 'inconnue'}`)
          return
        }

        dataUri = nanobananaResult.dataUri
        setState((s) => ({ ...s, nanobananaRef: dataUri }))

        // Sauvegarde persistante en galerie (fire-and-forget)
        const projectId = useEditorStore.getState().projectId
        if (projectId) {
          const productName = req.productName || req.prompt.split('\n')[0].substring(0, 100)
          const shortName = productName.slice(0, 60).trim()
          const dateLabel = new Date().toLocaleString('fr-FR', {
            day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
          })
          const refName = `Ref Nano Banana — ${shortName || 'Design'} — ${dateLabel}`
          void saveRefImageToGallery({
            dataUri,
            projectId,
            name: refName,
            tags: ['design-ref', req.style],
          }).then((img) => {
            if (img) {
              useNanoBanaStore.getState().addImage(img)
              toast.success('Ref Nano Banana sauvée dans la galerie')
            }
          })
        }

        // ─── Phase 2 : analyse Claude Vision (structure éditable) ──────────
        setState((s) => ({ ...s, step: 'analyzing', progress: 'Analyse des zones éditables (Claude Vision)…' }))

        const base64Data = dataUri.split(',')[1]
        if (!base64Data) {
          failAt('analyzing', 'Format dataUri Nano Banana invalide')
          return
        }

        try {
          analysis = await analyzeDesignForEdit(base64Data)
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err)
          failAt('analyzing', `Analyse Claude Vision échouée : ${msg}`, `Claude Vision a échoué : ${msg}`)
          return
        }

        // Override valeurs hallucinées par les vraies données scrapées (si dispo)
        if (scrapedProductData) {
          const before = analysis.texts.map(t => t.text)
          analysis.texts = overrideTextsWithScrapedData(analysis.texts, scrapedProductData)
          const overridden = analysis.texts.filter((t, i) => t.text !== before[i])
          if (overridden.length > 0) {
            console.log('[Claude Design] Overrode hallucinated texts:', overridden.map(t => `"${t.text}" (${t.id})`))
          }
        }
      }


      // ─── Phase 3 : reconstruction 100% vectorielle sur canvas ──────────────
      setState((s) => ({ ...s, step: 'rendering', progress: 'Reconstruction vectorielle du design…' }))

      const canvas = globalFabricCanvas
      if (!canvas) {
        failAt('rendering', 'Canvas non initialisé')
        return
      }

      const toRemove = canvas.getObjects().filter((o) => !o.data?.isGrid && !o.data?.isPageBg && !o.data?.isPrintMark)
      if (toRemove.length) canvas.remove(...toRemove)

      try {
        // Les fonts doivent être chargées AVANT la création des Textbox (sinon
        // Fabric mesure avec le fallback système). On démarre le chargement en
        // parallèle du rendu fond + formes, puis on attend juste avant les textes.
        const fontsReady = ensureGoogleFontsLoaded(analysis.texts.map((t) => t.fontFamily))

        renderBackground(canvas, analysis.background, canvasWidth, canvasHeight)
        renderDecorativeShapes(canvas, analysis.decorativeShapes, canvasWidth, canvasHeight)

        await fontsReady
        addEditableTextOverlays(canvas, analysis.texts, canvasWidth, canvasHeight)
        await addEditableImageSlots(canvas, analysis.imageSlots, canvasWidth, canvasHeight, dataUri, productImageUrl, scrapedProductData?.brandDomain)
        canvas.requestRenderAll()
        syncToStore(canvas)
        requestAnimationFrame(() => globalFitCanvas?.())
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        failAt('rendering', `Construction canvas échouée : ${msg}`)
        return
      }

      const result: DesignResult = {
        widthMm,
        heightMm,
        bleedMm: effectiveBleed,
        rationale: `${analysis.decorativeShapes.length} formes + ${analysis.texts.length} textes + ${analysis.imageSlots.length} zones image — 100% vectoriel, tout éditable`,
      }

      setState((s) => ({ ...s, step: 'done', progress: '', error: null, lastResult: result }))
    } catch (fatalErr) {
      console.error('[Claude Design] Fatal:', fatalErr)
      const msg = fatalErr instanceof Error ? fatalErr.message : String(fatalErr)
      setState((s) => ({
        ...s,
        step: 'error',
        progress: '',
        error: `Erreur fatale : ${msg}`,
        failedStep: s.failedStep ?? (s.step === 'idle' ? 'illustrating' : s.step as FailableStep),
        lastResult: null,
      }))
    } finally {
      runningRef.current = false
    }
  }, [failAt])

  const reset = useCallback(() => setState(INITIAL_STATE), [])

  return { state, generate, reset }
}
