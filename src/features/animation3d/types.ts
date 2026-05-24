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

export type SlideDirection = 'left' | 'right' | 'top' | 'bottom'

export interface LightingConfig {
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

export const DEFAULT_LIGHTING: LightingConfig = {
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
  label: string
  description: string
  emoji: string
}

export const PRESETS: PresetMeta[] = [
  { id: 'rotate3D',      label: 'Rotation 3D',      description: 'Tourne sur axe Z + skew perspective',    emoji: '🔄' },
  { id: 'flip3D',        label: 'Vraie 3D RotateY', description: 'Capture PNG + CSS3D transform rotateY',  emoji: '🎴' },
  { id: 'relief3D',      label: 'Relief 3D + Light', description: 'Extrusion Three.js + éclairage manuel',  emoji: '🧊' },
  { id: 'pulseScale',    label: 'Pulse Scale',      description: 'Respiration du bloc en zoom in/out',     emoji: '💓' },
  { id: 'hueCycle',      label: 'Couleurs cycle',   description: 'Traverse rouge→or→cyan→magenta',         emoji: '🌈' },
  { id: 'slideEntrance', label: 'Slide L/R',        description: 'Entrée depuis la gauche ou la droite',    emoji: '➡️' },
  { id: 'slideVertical', label: 'Slide H/B',        description: 'Entrée depuis le haut ou le bas',         emoji: '⬇️' },
  { id: 'motionPath',    label: 'Motion path',      description: 'Déplacement en cercle ou figure-8',       emoji: '➰' },
  { id: 'vibrate',       label: 'Vibration',        description: 'Tremblement court haute fréquence',       emoji: '📳' },
  { id: 'bounce',        label: 'Bounce',           description: 'Rebondit verticalement avec gravité',     emoji: '🏀' },
  { id: 'wave',          label: 'Wave',             description: 'Ondulation skew sinusoïdale fluide',      emoji: '🌊' },
  { id: 'glowAccent',    label: 'Glow accent',      description: 'Halo lumineux pulsant retail',            emoji: '✨' },
  { id: 'particles',     label: 'Particules dorées', description: 'Three.js — particules en orbite',         emoji: '⭐' },
]
