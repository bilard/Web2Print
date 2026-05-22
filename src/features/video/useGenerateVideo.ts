import { useMutation } from '@tanstack/react-query'
import { requestRender } from './api'
import { captureCurrentPageSvg } from './utils/captureSvg'
import { extractBriefContextFromFiles, type FileExtractionSkip } from './utils/extractBriefContextFromFiles'
import { detectAspect, templateForAspect, multiSceneTemplateForAspect } from './types'
import { interpretPromptToStyleConfig, DEFAULT_STYLE_CONFIG, type StyleConfig } from './promptToStyleConfig'
import {
  interpretPromptToComposition,
  DEFAULT_COMPOSITION,
  type Composition,
} from './promptToComposition'
import type { AspectFormat, RenderResponse, VideoQuality } from './types'

export type GenerateVideoSource = 'canvas' | 'standalone'

/** Défauts "rendu rapide" : 24 fps (cinéma standard, ~20 % moins de frames
 *  qu'à 30) + preset ffmpeg `draft` (ultrafast). Empiriquement ~2× plus
 *  rapide qu'à 30 fps + standard, pour une perte de qualité minime sur
 *  une lecture sociale (1080p, vidéos courtes 5-10 s). */
const DEFAULT_FAST_FPS = 24
const DEFAULT_FAST_QUALITY: VideoQuality = 'draft'

/** Mode canvas : convertit les dimensions du canvas (en px Fabric, souvent
 *  petits, ex. 142×216 pour 50×76 mm @ 72 dpi) en dimensions vidéo utilisables.
 *  - Scale la plus grande dimension à `maxSide` (défaut 1920)
 *  - Préserve le ratio source
 *  - Force des entiers pairs (ffmpeg yuv420p requiert width/height pairs) */
function scaleCanvasDimsForVideo(
  srcW: number,
  srcH: number,
  maxSide = 1920,
): { width: number; height: number } {
  if (!Number.isFinite(srcW) || !Number.isFinite(srcH) || srcW <= 0 || srcH <= 0) {
    return { width: 1080, height: 1920 }
  }
  const ratio = srcW / srcH
  let w: number
  let h: number
  if (srcW >= srcH) {
    w = maxSide
    h = Math.round(maxSide / ratio)
  } else {
    h = maxSide
    w = Math.round(maxSide * ratio)
  }
  if (w % 2 !== 0) w += 1
  if (h % 2 !== 0) h += 1
  return { width: w, height: h }
}

export interface GenerateVideoInput {
  caption?: string
  brand?: string
  prompt?: string
  aspect?: AspectFormat
  topic?: string
  audience?: string
  goal?: string
  tone?: string
  files?: File[]
  customWidth?: number
  customHeight?: number
  /** Durée totale souhaitée pour la vidéo en secondes (3-60).
   *  Mode standalone : Gemini ajuste les scènes pour matcher.
   *  Mode canvas (design-reveal) : ignoré pour l'instant — le template
   *  HTML hardcode 10s. À migrer dans un futur jalon. */
  targetDurationSec?: number
  /** Si fourni (mode standalone), skip l'appel Gemini et utilise directement
   *  cette composition. Sert à relancer le rendu Cloud Run après enrichissement
   *  Nano Banana sans repasser par l'interprétation du prompt. */
  precomputedComposition?: Composition
  source?: GenerateVideoSource
  /** Signal d'annulation propagé jusqu'à fetch(/render). Permet à `handleStop`
   *  d'abort la requête Cloud Run réelle, pas juste l'état React Query. */
  signal?: AbortSignal
}

/** Hard cap côté client : 4 min. Cloud Run a un timeout serveur de 300 s ;
 *  on coupe 60 s avant pour afficher une erreur claire plutôt que de laisser
 *  le navigateur attendre un 504 silencieux. */
const RENDER_TIMEOUT_MS = 240000

export interface GenerateVideoStep {
  step: 'capturing' | 'extracting' | 'interpreting' | 'composing' | 'rendering' | 'done' | 'error'
  aspect?: AspectFormat
  bytes?: number
  styleConfig?: StyleConfig
  /** Mode multi-scene : composition générée par Gemini depuis le prompt. */
  composition?: Composition
  svg?: string
  filesCount?: number
  fileContext?: string
  skippedFiles?: FileExtractionSkip[]
  source?: GenerateVideoSource
  /** Dimensions exactes de la vidéo cible (mode canvas) — propagées à la preview
   *  pour que l'iframe utilise le ratio source plutôt que le bucket. */
  width?: number
  height?: number
}

export interface GenerateVideoResult extends RenderResponse {
  styleConfig?: StyleConfig
  composition?: Composition
  fileContext?: string
  skippedFiles?: FileExtractionSkip[]
}

function appendFileContext(prompt: string | undefined, context: string): string | undefined {
  const head = (prompt ?? '').trim()
  const tail = context.trim()
  if (!tail) return head || undefined
  const block = `[Documents fournis]\n${tail}`
  return head ? `${head}\n\n${block}` : block
}

function resolveStandaloneAspect(input: GenerateVideoInput): AspectFormat {
  if (input.aspect) return input.aspect
  if (input.customWidth && input.customHeight) {
    return detectAspect(input.customWidth, input.customHeight)
  }
  return 'square'
}

export function useGenerateVideo(opts?: {
  onStep?: (step: GenerateVideoStep) => void
}) {
  return useMutation<GenerateVideoResult, Error, GenerateVideoInput>({
    mutationFn: async (input) => {
      const source: GenerateVideoSource = input.source ?? 'canvas'

      // Combine le signal utilisateur (Stop) avec un timeout interne. Si l'un
      // ou l'autre déclenche, fetch() throw immédiatement et la mutation passe
      // en onError. Sans timeout, un Cloud Run figé bloquerait indéfiniment.
      const ctrl = new AbortController()
      const onUserAbort = () => ctrl.abort(input.signal?.reason)
      input.signal?.addEventListener('abort', onUserAbort)
      const timeoutId = setTimeout(
        () => ctrl.abort(new DOMException(
          `Rendu Cloud Run trop long (> ${RENDER_TIMEOUT_MS / 1000}s) — relance ou contacte support`,
          'TimeoutError',
        )),
        RENDER_TIMEOUT_MS,
      )
      const cleanup = () => {
        clearTimeout(timeoutId)
        input.signal?.removeEventListener('abort', onUserAbort)
      }

      try {
      // Extraction (peut tourner avant la capture/composition en standalone)
      let fileContext = ''
      let skippedFiles: FileExtractionSkip[] = []
      const files = input.files ?? []

      if (source === 'canvas') {
        opts?.onStep?.({ step: 'capturing', source })
        const capture = await captureCurrentPageSvg()
        const aspect = input.aspect ?? detectAspect(capture.width, capture.height)

        // Si l'utilisateur n'a PAS choisi de format custom, on respecte les
        // dimensions du canvas source (ratio exact), scalées à 1920 max et
        // arrondies pair pour ffmpeg. Le service hf-render patche le template
        // pour adopter ces dimensions.
        const canvasDims =
          input.customWidth && input.customHeight
            ? { width: input.customWidth, height: input.customHeight }
            : scaleCanvasDimsForVideo(capture.width, capture.height)

        if (files.length > 0) {
          opts?.onStep?.({
            step: 'extracting',
            aspect,
            svg: capture.svg,
            filesCount: files.length,
            source,
          })
          try {
            const res = await extractBriefContextFromFiles(files)
            fileContext = res.context
            skippedFiles = res.skipped
          } catch (err) {
            console.warn('Extraction Gemini multimodal échouée :', err)
            skippedFiles = files.map((f) => ({
              name: f.name,
              reason: err instanceof Error ? err.message : 'Échec extraction',
            }))
          }
        }

        const enrichedPrompt = appendFileContext(input.prompt, fileContext)
        let styleConfig: StyleConfig = DEFAULT_STYLE_CONFIG
        if (enrichedPrompt && enrichedPrompt.trim().length > 0) {
          opts?.onStep?.({
            step: 'interpreting',
            aspect,
            svg: capture.svg,
            fileContext: fileContext || undefined,
            skippedFiles: skippedFiles.length ? skippedFiles : undefined,
            source,
          })
          try {
            styleConfig = await interpretPromptToStyleConfig(enrichedPrompt.trim())
          } catch (err) {
            console.warn('Interprétation Gemini échouée, fallback styleConfig par défaut:', err)
          }
        }

        opts?.onStep?.({
          step: 'rendering',
          aspect,
          bytes: capture.bytes,
          styleConfig,
          svg: capture.svg,
          fileContext: fileContext || undefined,
          skippedFiles: skippedFiles.length ? skippedFiles : undefined,
          source,
          width: canvasDims.width,
          height: canvasDims.height,
        })

        const result = await requestRender({
          template: templateForAspect(aspect),
          variables: {
            svgUrl: capture.url,
            caption: input.caption,
            brand: input.brand,
            prompt: enrichedPrompt,
            styleConfig,
            topic: input.topic,
            audience: input.audience,
            goal: input.goal,
            tone: input.tone,
            fileNames: files.length ? files.map((f) => f.name) : undefined,
            customWidth: canvasDims.width,
            customHeight: canvasDims.height,
          },
          fps: DEFAULT_FAST_FPS,
          quality: DEFAULT_FAST_QUALITY,
        }, ctrl.signal)

        opts?.onStep?.({ step: 'done', aspect, styleConfig, source })
        return {
          ...result,
          styleConfig,
          fileContext: fileContext || undefined,
          skippedFiles: skippedFiles.length ? skippedFiles : undefined,
        }
      }

      // ── Standalone : pas de canvas, on génère une composition multi-scène
      //    pilotée par le prompt via Gemini → template `multi-scene-{aspect}`.
      const aspect = resolveStandaloneAspect(input)

      if (files.length > 0) {
        opts?.onStep?.({
          step: 'extracting',
          aspect,
          filesCount: files.length,
          source,
        })
        try {
          const res = await extractBriefContextFromFiles(files)
          fileContext = res.context
          skippedFiles = res.skipped
        } catch (err) {
          console.warn('Extraction Gemini multimodal échouée :', err)
          skippedFiles = files.map((f) => ({
            name: f.name,
            reason: err instanceof Error ? err.message : 'Échec extraction',
          }))
        }
      }

      const enrichedPrompt = appendFileContext(input.prompt, fileContext)
      let composition: Composition = DEFAULT_COMPOSITION
      if (input.precomputedComposition) {
        // Relance après enrichissement Nano Banana : on garde la composition
        // enrichie telle quelle et on saute l'appel Gemini.
        composition = input.precomputedComposition
      } else if (enrichedPrompt && enrichedPrompt.trim().length > 0) {
        opts?.onStep?.({
          step: 'interpreting',
          aspect,
          fileContext: fileContext || undefined,
          skippedFiles: skippedFiles.length ? skippedFiles : undefined,
          source,
        })
        try {
          composition = await interpretPromptToComposition({
            prompt: enrichedPrompt.trim(),
            aspect,
            targetDurationSec: input.targetDurationSec,
          })
          console.log('[video] composition Gemini:', {
            transition: composition.transition,
            scenes: composition.scenes.map((s) => ({
              type: s.type,
              entryAnim: s.entryAnim,
              customAnimations: s.customAnimations?.length ?? 0,
            })),
          })
        } catch (err) {
          console.warn('Interprétation Gemini composition échouée, fallback DEFAULT:', err)
        }
      }

      opts?.onStep?.({ step: 'composing', aspect, composition, source })

      opts?.onStep?.({
        step: 'rendering',
        aspect,
        composition,
        fileContext: fileContext || undefined,
        skippedFiles: skippedFiles.length ? skippedFiles : undefined,
        source,
      })

      const result = await requestRender({
        template: multiSceneTemplateForAspect(aspect),
        variables: {
          composition: composition as unknown as Record<string, unknown>,
          brand: input.brand,
          prompt: enrichedPrompt,
          topic: input.topic,
          audience: input.audience,
          goal: input.goal,
          tone: input.tone,
          fileNames: files.length ? files.map((f) => f.name) : undefined,
          customWidth: input.customWidth,
          customHeight: input.customHeight,
        },
        fps: DEFAULT_FAST_FPS,
        quality: DEFAULT_FAST_QUALITY,
      }, ctrl.signal)

      opts?.onStep?.({ step: 'done', aspect, composition, source })
      return {
        ...result,
        composition,
        fileContext: fileContext || undefined,
        skippedFiles: skippedFiles.length ? skippedFiles : undefined,
      }
      } finally {
        cleanup()
      }
    },
    onError: () => opts?.onStep?.({ step: 'error' }),
  })
}
