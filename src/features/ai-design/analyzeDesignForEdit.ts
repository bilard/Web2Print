/**
 * Types partagés pour la structure d'un design décomposé en éléments éditables.
 *
 * La fonction analyzeDesignForEdit (Claude Vision) a été retirée dans le pivot
 * 2+3 (2026-04-26). Ces types sont conservés car ils sont utilisés par
 * composeDesignFromScrapedData et renderNanoBananaCanvas.
 */

export type Bbox = { x: number; y: number; w: number; h: number }

export type TextRole =
  | 'price'
  | 'oldPrice'
  | 'title'
  | 'feature'
  | 'rating'
  | 'reviewCount'
  | 'badge'
  | 'cta'
  | 'other'

export interface TextElement {
  id: string
  text: string
  /** Position et taille en POURCENTAGES (0-100) du canvas */
  bbox: { x: number; y: number; w: number; h: number }
  /** Rôle data : sert au routing override + détection retail */
  role: TextRole
  /** Taille de police en % de la hauteur du canvas (ex: 6 = 6% de canvasHeight) */
  fontSizePct: number
  /** Nom exact d'une famille Google Fonts */
  fontFamily: string
  /** Couleur du texte (hex) */
  color: string
  bold: boolean
  italic?: boolean
  /** Barré (pour les prix d'origine barrés) */
  strikethrough?: boolean
  align: 'left' | 'center' | 'right'
  /** Couleur du fond local sous le texte (hex). */
  backgroundColor: string
  /** false si le fond local est un gradient/photo/dégradé. */
  backgroundIsUniform: boolean
}

export type ImageSlotRole = 'logo' | 'productPhoto' | 'badge' | 'other'

export interface ImageSlot {
  id: string
  role: ImageSlotRole
  bbox: { x: number; y: number; w: number; h: number }
  description: string
  /** Couleur du fond local sous le slot (hex). */
  backgroundColor: string
  backgroundIsUniform: boolean
}

export interface BackgroundDef {
  type: 'solid' | 'linearGradient' | 'radialGradient'
  /** Couleur hex pour type='solid' */
  color?: string
  /** Stops pour les gradients */
  stops?: Array<{ offset: number; color: string }>
  /** Angle en degrés pour linearGradient (0 = horizontal gauche→droite, 90 = vertical haut→bas) */
  angle?: number
}

export type DecorativeShapeType = 'rect' | 'circle' | 'ellipse' | 'path'

export interface DecorativeShape {
  id: string
  type: DecorativeShapeType
  /** Position et taille de la bbox en % du canvas */
  bbox: { x: number; y: number; w: number; h: number }
  /** Données SVG "d=..." dans un espace normalisé 0-100 × 0-100 (requis pour type='path') */
  pathData?: string
  /** Rayon de coin en % du min(w,h) — uniquement pour type='rect' */
  rx?: number
  /** Couleur hex */
  fill: string
  /** Opacité 0-1 (défaut 1) */
  opacity?: number
}

export type DesignMode = 'retail' | 'creative'

export interface DesignAnalysis {
  /** Métadonnée informative. Le routing dans useGenerateDesign n'utilise plus ce champ. */
  mode: DesignMode
  texts: TextElement[]
  imageSlots: ImageSlot[]
  /** Présent uniquement si mode='creative'. */
  background?: BackgroundDef
  /** Présent uniquement si mode='creative'. */
  decorativeShapes?: DecorativeShape[]
}
