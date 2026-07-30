import type { TranslationKey } from '@/lib/i18n'
export type Animation3DPreset =
  | 'rotate3D'
  | 'pulseScale'
  | 'hueCycle'
  | 'slideEntrance'
  | 'glowAccent'
  | 'particles'
  | 'slideVertical'
  | 'motionPath'
  | 'vibrate'
  | 'bounce'
  | 'flip3D'
  | 'wave'
  | 'relief3D'

type SlideDirection = 'left' | 'right' | 'top' | 'bottom'

interface LightingConfig {
  directionalIntensity: number   // 0..3
  directionalColor: string       // hex
  dirPosX: number                // -5..5
  dirPosY: number                // -5..5
  dirPosZ: number                // 1..10
  ambientIntensity: number       // 0..2
  ambientColor: string           // hex
}

export interface ReliefConfig {
  depth: number      // extrusion depth (px-equivalent units, 5..120)
  bevel: number      // bevel size (0..20)
  rotX: number       // initial X rotation (deg, -45..45)
  rotY: number       // initial Y rotation (deg, -90..90)
  autoRotate: boolean
  lighting: LightingConfig
}

export interface Animation3DConfig {
  preset: Animation3DPreset
  duration: number  // seconds per cycle
  loop: boolean
  intensity: number // 0.5 .. 2.0
  direction?: SlideDirection
  relief?: ReliefConfig
}

const DEFAULT_LIGHTING: LightingConfig = {
  directionalIntensity: 1.2,
  directionalColor: '#ffffff',
  dirPosX: 2,
  dirPosY: 3,
  dirPosZ: 4,
  ambientIntensity: 0.5,
  ambientColor: '#ffffff',
}

export const DEFAULT_RELIEF: ReliefConfig = {
  depth: 40,
  bevel: 4,
  rotX: -10,
  rotY: 18,
  autoRotate: false,
  lighting: DEFAULT_LIGHTING,
}

export const DEFAULT_ANIMATION_CONFIG: Animation3DConfig = {
  preset: 'rotate3D',
  duration: 3,
  loop: true,
  intensity: 1,
}

export interface PresetMeta {
  id: Animation3DPreset
  labelKey: TranslationKey
  descriptionKey: TranslationKey
  emoji: string
}

// ⚠️ CLÉS, pas `t()` : tableau évalué au CHARGEMENT du module.
export const PRESETS: PresetMeta[] = [
  { id: 'rotate3D',      labelKey: 'a3.rotate3D.label',      descriptionKey: 'a3.rotate3D',      emoji: '🔄' },
  { id: 'flip3D',        labelKey: 'a3.flip3D.label',        descriptionKey: 'a3.flip3D',        emoji: '🎴' },
  { id: 'relief3D',      labelKey: 'a3.relief3D.label',      descriptionKey: 'a3.relief3D',      emoji: '🧊' },
  { id: 'pulseScale',    labelKey: 'a3.pulseScale.label',    descriptionKey: 'a3.pulseScale',    emoji: '💓' },
  { id: 'hueCycle',      labelKey: 'a3.hueCycle.label',      descriptionKey: 'a3.hueCycle',      emoji: '🌈' },
  { id: 'slideEntrance', labelKey: 'a3.slideEntrance.label', descriptionKey: 'a3.slideEntrance', emoji: '➡️' },
  { id: 'slideVertical', labelKey: 'a3.slideVertical.label', descriptionKey: 'a3.slideVertical', emoji: '⬇️' },
  { id: 'motionPath',    labelKey: 'a3.motionPath.label',    descriptionKey: 'a3.motionPath',    emoji: '➰' },
  { id: 'vibrate',       labelKey: 'a3.vibrate.label',       descriptionKey: 'a3.vibrate',       emoji: '📳' },
  { id: 'bounce',        labelKey: 'a3.bounce.label',        descriptionKey: 'a3.bounce',        emoji: '🏀' },
  { id: 'wave',          labelKey: 'a3.wave.label',          descriptionKey: 'a3.wave',          emoji: '🌊' },
  { id: 'glowAccent',    labelKey: 'a3.glowAccent.label',    descriptionKey: 'a3.glowAccent',    emoji: '✨' },
  { id: 'particles',     labelKey: 'a3.particles.label',     descriptionKey: 'a3.particles',     emoji: '⭐' },
]
