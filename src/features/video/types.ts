export type VideoTemplate =
  | 'design-reveal-portrait'
  | 'design-reveal-square'
  | 'design-reveal-landscape'
  | 'multi-scene-portrait'
  | 'multi-scene-square'
  | 'multi-scene-landscape'

export type AspectFormat = 'portrait' | 'square' | 'landscape'

export function detectAspect(width: number, height: number): AspectFormat {
  const ratio = width / height
  if (ratio > 1.2) return 'landscape'
  if (ratio < 0.85) return 'portrait'
  return 'square'
}

export function templateForAspect(aspect: AspectFormat): VideoTemplate {
  return `design-reveal-${aspect}` as VideoTemplate
}

export function multiSceneTemplateForAspect(aspect: AspectFormat): VideoTemplate {
  return `multi-scene-${aspect}` as VideoTemplate
}

export type VideoFormat = 'mp4' | 'webm' | 'mov'
export type VideoQuality = 'draft' | 'standard' | 'high'

export interface DesignRevealStyleConfig {
  pace: 'slow' | 'normal' | 'fast'
  intensity: 'subtle' | 'normal' | 'punchy'
  ease: 'soft' | 'classic' | 'snappy'
  palette: { bg: string; accent: string }
  mood: string
}

export interface DesignRevealVariables {
  svgUrl: string
  caption?: string
  brand?: string
  /** Brief complet concaténé envoyé pour interprétation (audit, debug). */
  prompt?: string
  /** Config structurée dérivée du prompt par Gemini — c'est ce que la composition
   *  HyperFrames consomme via `vars.styleConfig` pour piloter timings et palette. */
  styleConfig?: DesignRevealStyleConfig
  topic?: string
  audience?: string
  goal?: string
  tone?: string
  fileNames?: string[]
  customWidth?: number
  customHeight?: number
}

/** Variables consommées par les templates multi-scene (Jalon 1 — Archi C).
 *  Le moteur HyperFrames lit `vars.composition` et orchestre les N scènes
 *  selon le JSON produit par Gemini (`promptToComposition.ts`). */
export interface MultiSceneVariables {
  /** Composition multi-scènes générée par Gemini depuis le brief utilisateur.
   *  Type relaxé ici (Record) pour éviter le couplage entre types.ts (importé
   *  côté Cloud Run sans zod) et promptToComposition.ts (frontend only). */
  composition: Record<string, unknown>
  brand?: string
  prompt?: string
  topic?: string
  audience?: string
  goal?: string
  tone?: string
  fileNames?: string[]
  customWidth?: number
  customHeight?: number
}

export type VideoVariables = DesignRevealVariables | MultiSceneVariables

export interface RenderRequest {
  template: VideoTemplate
  variables: VideoVariables
  fps?: number
  quality?: VideoQuality
  format?: VideoFormat
}

export interface RenderResponse {
  renderId: string
  status: 'done' | 'error'
  url?: string
  durationMs?: number
  error?: string
}

export interface RenderStatus {
  renderId: string
  userId: string
  template: VideoTemplate
  status: 'running' | 'done' | 'error'
  storagePath?: string
  url?: string
  error?: string
  durationMs?: number
  createdAt: string
  finishedAt?: string
}
