// Modèle de document IDML exposé au reste de l'application.
//
// Vit hors du parser pour que les modules qui n'ont besoin QUE du type
// (couleurs, export, conversion Fabric) n'aient pas à importer un parser de
// 1 700 lignes — et pour éviter le cycle que cela créait.
import type { TagTreeNode } from './xmlBackingStory'

export interface IdmlShadow {
  opacity: number   // 0–100
  offsetX: number   // pt
  offsetY: number   // pt
  blur: number      // pt (Size in IDML)
}
export interface CharStyleOverride {
  fontSize?: number
  deltaY?: number       // baseline shift: negative = up (superscript)
  fill?: string         // hex color override
  linethrough?: boolean
  invisible?: boolean   // "Caractère invisible" → render as transparent
  fontWeight?: string   // CSS font-weight (400, 700, etc.)
  fontStyle?: string    // 'italic' | 'normal'
  fontFamily?: string   // font family override
  tracking?: number     // letter-spacing in 1/1000 em (InDesign "Approche")
  skewX?: number        // italic angle in degrees (Fabric skewX)
  verticalScale?: number // percentage (100 = normal) — applied as fontSize multiplier
}

export interface IdmlColor {
  r: number; g: number; b: number; a: number
}

export interface IdmlObject {
  id: string
  type: 'TextFrame' | 'Rectangle' | 'Oval' | 'GraphicLine' | 'Polygon' | 'Image'
  cx: number        // center X in page coordinates (pt)
  cy: number        // center Y in page coordinates (pt)
  idmlPageOffsetX: number  // spread→page offset used at import (for export round-trip)
  idmlPageOffsetY: number
  width: number     // local width (before scale)
  height: number    // local height (before scale)
  scaleX: number
  scaleY: number
  rotation: number  // degrees
  fill: IdmlColor | null
  stroke: IdmlColor | null
  strokeWeight: number
  strokeAlignment?: 'center' | 'inside' | 'outside'
  opacity: number
  shadow?: IdmlShadow | null
  storyId?: string
  paragraphs?: IdmlParagraph[]
  imagePath?: string
  hasImage?: boolean
  svgPath?: string  // SVG path data centered at 0,0 (Polygon with Bézier curves)
  anchors?: { x: number; y: number }[]  // kept for bounds reference
  cornerRadius?: number  // uniform corner radius (pt) for Rectangle
  frameSvgPath?: string  // SVG path for non-rectangular TextFrame background shape
  isOvalFrame?: boolean  // TextFrame with oval/circular PathGeometry
  // Image positioning within frame (from Image child's ItemTransform + GraphicBounds)
  imageScaleX?: number   // Image scale within frame
  imageScaleY?: number
  imageOffsetX?: number  // Image offset from frame top-left (in frame local coords)
  imageOffsetY?: number
  imageWidth?: number    // Original image size (from GraphicBounds)
  imageHeight?: number
  // Local center of the frame in its path coordinate system (needed for image positioning)
  localCenterX?: number
  localCenterY?: number
  // TextFrame inset margins (pt) from TextFramePreference InsetSpacing
  insetTop?: number
  insetBottom?: number
  insetLeft?: number
  insetRight?: number
  // TextFrame vertical justification
  verticalJustification?: 'top' | 'center' | 'bottom'
  // TextFrame auto-sizing: no line breaks (text stays on one line)
  noLineBreaks?: boolean
  // TextFrame AutoSizingType: 'HeightOnly'/'HeightAndWidth' = cadre auto-grandissant ; 'Off'/absent = fixe
  autoSizingType?: string
  // True for anchored frames (position relative to parent text flow, not absolute)
  isAnchored?: boolean
  // EasyCatalog : nom du champ image lié (cadre Rectangle portant ECPageItemData="2 2 <champ>")
  ecImageField?: string
  // Merge XML natif : template avec {{champ}} (même concaténation que le texte affiché)
  mergeTemplate?: string
  // Merge XML natif : liste ordonnée des champs liés à ce TextFrame
  mergeFields?: string[]
  // Merge XML natif : paragraphes du MODÈLE ({{champ}}) avec leurs styles — sert à poser
  // data.templateStyles pour que remapStyles préserve la couleur/taille de chaque champ à la fusion.
  mergeTemplateParas?: IdmlParagraph[]
}

export interface IdmlParagraph {
  text: string
  fontSize: number
  fontFamily: string
  fontWeight: string
  fontStyle: string
  color: IdmlColor
  alignment: 'left' | 'center' | 'right' | 'justify'
  lineHeight?: number  // leading in pt (undefined = auto)
  autoLeading?: number // percentage for auto leading (default 120)
  horizontalScale?: number  // percentage (100 = normal, 75 = 75% width)
  verticalScale?: number    // percentage (100 = normal)
  tracking?: number         // letter-spacing in 1/1000 em (InDesign "Approche")
  charStyles?: Record<number, CharStyleOverride>  // per-character overrides keyed by char index
}

export interface IdmlDocument {
  pageWidth: number
  pageHeight: number
  objects: IdmlObject[]
  spreadCount: number
  tagTree?: TagTreeNode | null // hiérarchie des balises XML natives (groupes répétables)
}
