import { useState, useCallback, useRef } from 'react'
import { toast } from 'sonner'
import { generateNanoBananaRef } from './generateNanoBananaRef'
import { saveRefImageToGallery } from './saveRefImageToGallery'
import { analyzeDesignForEdit } from './analyzeDesignForEdit'
import { scrapeProductForDesign, detectUrlInPrompt, isLikelyProductImage, type ScrapedProductData } from './scrapeProductForDesign'
import { composeDesignFromScrapedData } from './composeDesignFromScrapedData'
import type { TextElement } from './analyzeDesignForEdit'
import {
  renderBackground,
  renderDecorativeShapes,
  addEditableTextOverlays,
  addEditableImageSlots,
} from './renderNanoBananaCanvas'
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
 * Remplace les textes hallucinés par Nano Banana par les vraies valeurs
 * scrapées. Si la donnée scrapée est ABSENTE (ex: produit sans avis),
 * SUPPRIME les éléments hallucinés correspondants au lieu de les laisser
 * mentir. Garantit zéro fausse info sur le design final.
 */
function overrideTextsWithScrapedData(
  texts: TextElement[],
  scraped: ScrapedProductData
): TextElement[] {
  // Reconnaît "699€00" (Brico Dépôt) ET "699,00 €" / "1 234,56 €"
  const PRICE_RE = /\d{1,4}\s*€\s*\d{2}|\d[\d\s ]*[,.]\d{2}\s*€/
  const RATING_RE = /^\s*\d[.,]\d+\s*(\/\s*5)?\s*$/
  const REVIEWS_RE = /(\d+)\s*avis/i
  const STARS_RE = /[★☆⭐]/
  const RATING_KEYWORDS = /\b(avis client|note moyenne|étoile|rating|évaluation)\b/i

  const out: TextElement[] = []

  for (const t of texts) {
    const txt = t.text || ''

    // Prix barré (oldPrice) — supprime si pas de promo réelle
    if (t.strikethrough && PRICE_RE.test(txt)) {
      if (scraped.oldPrice) out.push({ ...t, text: scraped.oldPrice })
      else console.log('[Override] Drop hallucinated oldPrice:', txt)
      continue
    }

    // Prix actuel — remplace si scraped, sinon supprime
    if (!t.strikethrough && PRICE_RE.test(txt) && !RATING_RE.test(txt)) {
      if (scraped.price) out.push({ ...t, text: scraped.price })
      else console.log('[Override] Drop hallucinated price:', txt)
      continue
    }

    // Étoiles ★★★★★ — supprime si pas de rating réel
    if (STARS_RE.test(txt)) {
      if (scraped.rating) out.push(t)
      else console.log('[Override] Drop hallucinated stars:', txt)
      continue
    }

    // Rating numérique "4.3" / "4.3/5"
    if (RATING_RE.test(txt)) {
      if (scraped.rating) {
        const hasOutOf5 = /\/\s*5/.test(txt)
        out.push({ ...t, text: hasOutOf5 ? `${scraped.rating}/5` : scraped.rating })
      } else {
        console.log('[Override] Drop hallucinated rating:', txt)
      }
      continue
    }

    // Nombre d'avis ou phrase qui mentionne les avis (AVIS CLIENTS, etc.)
    if (REVIEWS_RE.test(txt) || RATING_KEYWORDS.test(txt)) {
      if (scraped.reviewCount && scraped.rating) {
        out.push({ ...t, text: txt.replace(/\d+/, scraped.reviewCount) })
      } else {
        console.log('[Override] Drop hallucinated review/avis text:', txt)
      }
      continue
    }

    out.push(t)
  }

  return out
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
            // Validation : si l'URL fournie (manuelle OU scrapée) ressemble à un
            // logo/banner/didomi/etc., on la rejette plutôt que de l'afficher
            // comme photo produit. C'est la cause #1 de "logo géant à la place
            // de la photo" — Brico Dépôt sert un logo cookies didomi qui peut
            // fuiter via certains chemins d'extraction.
            const manualBeforeOverride = productImageUrl
            if (productImageUrl && !isLikelyProductImage(productImageUrl)) {
              console.warn('[Claude Design] Manual productImageUrl rejected (looks like logo/banner):', productImageUrl)
              productImageUrl = undefined
            }
            if (!productImageUrl && scrapedProductData.imageUrl && isLikelyProductImage(scrapedProductData.imageUrl)) {
              productImageUrl = scrapedProductData.imageUrl
            } else if (!productImageUrl && scrapedProductData.imageUrl) {
              console.warn('[Claude Design] Scraped imageUrl rejected (looks like logo/banner):', scrapedProductData.imageUrl)
            }
            console.log('[Claude Design] productImageUrl resolution:', {
              manual_input: manualBeforeOverride ?? '(none)',
              scraped: scrapedProductData.imageUrl ?? '(none)',
              final: productImageUrl ?? '(none)',
            })
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

      // ─── Architecture : Nano Banana 2 (créativité) + Jina (data véridique) ──
      // L'image générative apporte la créativité du layout, la typographie, les
      // couleurs et la composition. Les données scrapées (prix, features, rating,
      // logo, photo produit) sont injectées dans le prompt ET overridées en
      // post-render pour garantir l'exactitude. Compose-direct n'est conservé
      // que comme fallback si Nano Banana échoue (toutes versions).
      let analysis
      let dataUri: string | null = null

      // ─── Phase 1 : génération Nano Banana (Pro en priorité) ─────────────────
      const nanobananaResult = await generateNanoBananaRef({
        userPrompt: enrichedPrompt,
        widthMm,
        heightMm,
        style: req.style as DesignStyle,
        dpi,
        palette: req.palette,
      }).catch((err) => ({ ok: false as const, error: err instanceof Error ? err.message : String(err) }))

      if (nanobananaResult.ok && nanobananaResult.dataUri) {
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

        // Override des valeurs hallucinées par les vraies données scrapées (si dispo).
        // Couvre prix, oldPrice, rating, reviewCount ET features (bullets).
        if (scrapedProductData) {
          const before = analysis.texts.map(t => t.text)
          analysis.texts = overrideTextsWithScrapedData(analysis.texts, scrapedProductData)
          const overridden = analysis.texts.filter((t, i) => t.text !== before[i])
          if (overridden.length > 0) {
            console.log('[Claude Design] Overrode hallucinated texts:', overridden.map(t => `"${t.text}" (${t.id})`))
          }
        }
      } else if (scrapedProductData && scrapedProductData.title) {
        // Fallback si Nano Banana est indisponible : compose-direct depuis Jina.
        // Garantit qu'on livre toujours quelque chose, même sans IA visuelle.
        const errMsg = nanobananaResult.ok ? 'inconnue' : nanobananaResult.error
        console.warn(`[Claude Design] Nano Banana indisponible (${errMsg}) — fallback compose-direct`)
        toast.warning('Image IA indisponible — design composé depuis les données produit')
        setState((s) => ({ ...s, step: 'rendering', progress: 'Composition directe (fallback Nano Banana)…' }))
        analysis = composeDesignFromScrapedData(scrapedProductData)
      } else {
        const errMsg = nanobananaResult.ok ? 'inconnue' : nanobananaResult.error
        failAt('illustrating', `Échec génération Nano Banana : ${errMsg}`, `Nano Banana a échoué : ${errMsg ?? 'inconnue'}`)
        return
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
