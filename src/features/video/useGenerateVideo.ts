import { useMutation } from '@tanstack/react-query'
import { captureCurrentPageSvg } from './utils/captureSvg'
import { extractBriefContextFromFiles, type FileExtractionSkip } from './utils/extractBriefContextFromFiles'
import { detectAspect } from './types'
import { interpretPromptToStyleConfig, DEFAULT_STYLE_CONFIG, type StyleConfig } from './promptToStyleConfig'
import {
  interpretPromptToComposition,
  DEFAULT_COMPOSITION,
  type Composition,
} from './promptToComposition'
import type { AspectFormat } from './types'

export type GenerateVideoSource = 'canvas' | 'standalone'

/** Mode canvas : convertit les dimensions Fabric (souvent petites, ex. 142×216
 *  pour 50×76 mm @ 72 dpi) en dimensions d'animation utilisables.
 *  - Scale la plus grande dimension à `maxSide` (défaut 1920)
 *  - Préserve le ratio source
 *  - Force des entiers pairs (cohérent avec les attentes des templates qui
 *    embarquent une grille pair pour le canvas interne) */
function scaleCanvasDimsForAnimation(
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
  /** Durée totale souhaitée pour l'animation en secondes (3-60).
   *  Mode standalone : Gemini ajuste les scènes pour matcher.
   *  Mode canvas (design-reveal) : ignoré pour l'instant — le template
   *  HTML hardcode 10 s. */
  targetDurationSec?: number
  /** Si fourni (mode standalone), skip l'appel Gemini et utilise directement
   *  cette composition (sert au flow "Enrichir avec images IA" qui modifie
   *  la composition sans repasser par l'interprétation du prompt). */
  precomputedComposition?: Composition
  source?: GenerateVideoSource
  /** Signal d'annulation. Note : Gemini ne supporte pas encore le cancel
   *  natif — un Stop côté UI vide juste l'état React Query, la réponse
   *  Gemini en cours est ignorée. */
  signal?: AbortSignal
}

export interface GenerateVideoStep {
  step: 'capturing' | 'extracting' | 'interpreting' | 'composing' | 'done' | 'error'
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
  /** Dimensions exactes de l'animation cible (mode canvas) — propagées à la
   *  preview pour que l'iframe utilise le ratio source plutôt que le bucket. */
  width?: number
  height?: number
}

export interface GenerateVideoResult {
  /** Identifiant local de l'animation, généré côté client. Sert au nom de ZIP
   *  et de clé de sauvegarde DAM. */
  id: string
  aspect: AspectFormat
  /** Mode standalone : composition multi-scènes Gemini consommée par le template
   *  `multi-scene-{aspect}/index.html`. */
  composition?: Composition
  /** Mode canvas : SVG capturé de la page courante, embarqué dans le template
   *  `design-reveal-{aspect}/index.html` via variables.svg. */
  svg?: string
  /** Mode canvas : config de style dérivée du brief par Gemini. */
  styleConfig?: StyleConfig
  width?: number
  height?: number
  /** Durée totale de l'animation choisie par l'utilisateur (5/10/15/30/custom s).
   *  Propagée à exportHtmlZip pour patcher data-duration + durationScale. */
  durationSec?: number
  /** Brief final concaténé (avec contexte des fichiers, si fourni). */
  prompt?: string
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

function generateAnimationId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

export function useGenerateVideo(opts?: {
  onStep?: (step: GenerateVideoStep) => void
}) {
  return useMutation<GenerateVideoResult, Error, GenerateVideoInput>({
    mutationFn: async (input) => {
      const source: GenerateVideoSource = input.source ?? 'canvas'

      let fileContext = ''
      let skippedFiles: FileExtractionSkip[] = []
      const files = input.files ?? []

      if (source === 'canvas') {
        opts?.onStep?.({ step: 'capturing', source })
        const capture = await captureCurrentPageSvg()
        const aspect = input.aspect ?? detectAspect(capture.width, capture.height)

        const canvasDims =
          input.customWidth && input.customHeight
            ? { width: input.customWidth, height: input.customHeight }
            : scaleCanvasDimsForAnimation(capture.width, capture.height)

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
          step: 'done',
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

        return {
          id: generateAnimationId(),
          aspect,
          svg: capture.svg,
          styleConfig,
          width: canvasDims.width,
          height: canvasDims.height,
          durationSec: input.targetDurationSec,
          prompt: enrichedPrompt,
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
        step: 'done',
        aspect,
        composition,
        fileContext: fileContext || undefined,
        skippedFiles: skippedFiles.length ? skippedFiles : undefined,
        source,
      })

      return {
        id: generateAnimationId(),
        aspect,
        composition,
        durationSec: input.targetDurationSec,
        prompt: enrichedPrompt,
        fileContext: fileContext || undefined,
        skippedFiles: skippedFiles.length ? skippedFiles : undefined,
      }
    },
    onError: () => opts?.onStep?.({ step: 'error' }),
  })
}
