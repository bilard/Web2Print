import { Rect, Circle, Line, type FabricObject } from 'fabric'

export interface PrintMarksOptions {
  canvasWidthPx: number
  canvasHeightPx: number
  /** Origine de la page sur le canvas (0,0 par défaut). */
  pageLeftPx?: number
  pageTopPx?: number
  bleedPx: number
  cropMarkLengthPx: number
  /** Distance (px) entre le bord du bleed et l'extrémité interne des traits. */
  cropMarkOffsetPx: number
  safeAreaPx: number
  showPrintMarks: boolean
  showSafeArea: boolean
  showRegistrationMarks?: boolean
  /** Styles personnalisables (couleurs + épaisseurs + taille des hirondelles). */
  bleedStroke?: number
  bleedColor?: string
  cropStroke?: number
  cropColor?: string
  regRadiusMm?: number
  regStroke?: number
  regColor?: string
  regOffsetMm?: number
  safeStroke?: number
  safeColor?: string
  safeDash?: number
  safeGap?: number
}

type MarkType = 'bleed-rect' | 'crop-mark' | 'bleed-mark' | 'safe-area' | 'registration-mark'

function tag(obj: FabricObject, markType: MarkType): FabricObject {
  const o = obj as FabricObject & { data?: Record<string, unknown>; excludeFromExport?: boolean }
  o.data = { ...(o.data ?? {}), isPrintMark: true, markType }
  o.selectable = false
  o.evented = false
  o.hoverCursor = 'default'
  o.excludeFromExport = true
  // IMPORTANT : ne PAS toucher originX/originY après construction.
  // Line v6 utilise 'center' par défaut et calcule left/top comme centroïde.
  // Forcer 'left'/'top' ici changerait l'interprétation de left sans recalculer
  // sa valeur → décalage visuel de width/2 (bug confirmé par dump console).
  return obj
}

// Valeurs par défaut alignées sur le store. NB : 1 px minimum sinon Fabric/Canvas
// dessine en sous-pixel et la ligne disparaît sur fond sombre. Les marks sont
// `excludeFromExport: true` (jamais à l'export final).
const DEFAULT_BLEED_COLOR = '#ffffff'
const DEFAULT_CROP_COLOR = '#ffffff'
const DEFAULT_SAFE_COLOR = '#ef4444'
const DEFAULT_STROKE = 1
const DEFAULT_REG_RADIUS_MM = 2.5

function makeBleedRect(
  x: number, y: number, w: number, h: number, bleed: number,
  color: string, stroke: number,
): FabricObject {
  const r = new Rect({
    left: x - bleed,
    top: y - bleed,
    originX: 'left',
    originY: 'top',
    width: w + bleed * 2,
    height: h + bleed * 2,
    fill: 'rgba(0,0,0,0)',
    stroke: color,
    strokeWidth: stroke,
    strokeUniform: true,
  })
  return tag(r, 'bleed-rect')
}

/**
 * Traits de coupe simples à chaque coin — 2 traits par coin, L-shape alignée
 * sur le trim, à l'extérieur du bleed. Formule unique, les 4 coins sont
 * identiques par construction (seuls les signes de direction changent).
 *
 * @param x,y,w,h  trim box (page)
 * @param bleed    épaisseur du bleed (px)
 * @param offset   écart entre le bord du bleed et l'extrémité intérieure des traits
 * @param length   longueur de chaque trait
 */
function makeCornerMarks(
  x: number, y: number, w: number, h: number,
  bleed: number, offset: number, length: number,
  color: string, stroke: number,
): FabricObject[] {
  // Plage outward partagée par les 4 coins : de `inner` à `outer` depuis le trim.
  const inner = Math.round(bleed + offset)
  const outer = Math.round(bleed + offset + length)

  const L = Math.round(x)
  const R = Math.round(x + w)
  const T = Math.round(y)
  const B = Math.round(y + h)

  const marks: FabricObject[] = []

  // Rect plats d'épaisseur `stroke` — fiables au rendu Canvas à tous les zooms.
  const THICK = stroke
  const HALF = THICK / 2

  const makeHorizontalMark = (left: number, top: number, width: number) =>
    tag(new Rect({
      left,
      top: top - HALF,
      width,
      height: THICK,
      fill: color,
      stroke: 'none',
      originX: 'left',
      originY: 'top',
    }), 'crop-mark')

  const makeVerticalMark = (left: number, top: number, height: number) =>
    tag(new Rect({
      left: left - HALF,
      top,
      width: THICK,
      height,
      fill: color,
      stroke: 'none',
      originX: 'left',
      originY: 'top',
    }), 'crop-mark')

  // TOP-LEFT
  marks.push(makeHorizontalMark(L - outer, T, outer - inner))
  marks.push(makeVerticalMark(L, T - outer, outer - inner))

  // TOP-RIGHT
  marks.push(makeHorizontalMark(R + inner, T, outer - inner))
  marks.push(makeVerticalMark(R, T - outer, outer - inner))

  // BOTTOM-LEFT
  marks.push(makeHorizontalMark(L - outer, B, outer - inner))
  marks.push(makeVerticalMark(L, B + inner, outer - inner))

  // BOTTOM-RIGHT
  marks.push(makeHorizontalMark(R + inner, B, outer - inner))
  marks.push(makeVerticalMark(R, B + inner, outer - inner))

  return marks
}

/**
 * Hirondelles (repères de montage) normalisées imprimeurs — forme "cible" :
 *   - Cercle 5 mm Ø (rayon 2.5 mm) en stroke 2 px
 *   - Croix qui traverse le cercle et dépasse de 60 % du rayon (arm = 1.6 × R)
 *   - Disque plein central à 40 % du rayon externe pour le calage précis
 * Identique à la registration target d'Adobe InDesign / Illustrator.
 * Position : centre placé pour que la pointe interne du bras affleure le bout
 * du trait de coupe — ainsi les bras ne pénètrent JAMAIS dans le bleed.
 */
function makeRegistrationMarks(
  x: number, y: number, w: number, h: number,
  bleed: number, offset: number, length: number, dpi: number,
  color: string, stroke: number, radiusMm: number, offsetMm: number,
): FabricObject[] {
  const mmToPx = (mm: number) => (mm * dpi) / 25.4
  const radius = mmToPx(radiusMm)        // taille hirondelle paramétrable
  const arm = Math.round(radius * 1.6)   // bras dépasse de 0.6 × rayon de chaque côté
  const dotR = radius * 0.4              // disque plein — 40 % du rayon

  // Position auto : pointe interne du bras juste à l'extérieur des traits de
  // coupe (pas DANS le bleed). + décalage utilisateur (mm) pour rapprocher/éloigner.
  const markDistance = bleed + offset + length + arm + mmToPx(offsetMm)

  const makeMark = (cx: number, cy: number): FabricObject[] => {
    // Aligner le centre sur la grille pixel pour des bras crisp (sinon Canvas
    // répartit en sub-pixel → bras fantômes sur fond sombre).
    const cxI = Math.round(cx)
    const cyI = Math.round(cy)
    return [
    tag(new Circle({
      left: cxI - radius,
      top: cyI - radius,
      originX: 'left',
      originY: 'top',
      radius,
      fill: 'rgba(0,0,0,0)',
      stroke: color,
      strokeWidth: stroke,
      strokeUniform: true,
    }), 'registration-mark'),
    // Bras horizontal de la croix — Line + strokeUniform pour cohérence visuelle
    // EXACTE avec le stroke du cercle (même épaisseur perçue à tout zoom).
    // NB : ne PAS toucher originX/originY après construction (Line v6 utilise
    // 'center' et calcule left/top comme centroïde).
    tag(new Line([cxI - arm, cyI, cxI + arm, cyI], {
      stroke: color,
      strokeWidth: stroke,
      strokeUniform: true,
    }), 'registration-mark'),
    // Bras vertical de la croix
    tag(new Line([cxI, cyI - arm, cxI, cyI + arm], {
      stroke: color,
      strokeWidth: stroke,
      strokeUniform: true,
    }), 'registration-mark'),
    // Point central pour le calage précis
    tag(new Circle({
      left: cxI - dotR,
      top: cyI - dotR,
      originX: 'left',
      originY: 'top',
      radius: dotR,
      fill: color,
      stroke: 'none',
    }), 'registration-mark'),
  ]}

  const centerX = x + w / 2
  const centerY = y + h / 2

  return [
    ...makeMark(centerX, y - markDistance),        // haut
    ...makeMark(centerX, y + h + markDistance),    // bas
    ...makeMark(x - markDistance, centerY),        // gauche
    ...makeMark(x + w + markDistance, centerY),    // droite
  ]
}

function makeSafeArea(
  x: number, y: number, w: number, h: number, margin: number,
  color: string, stroke: number, dash: number, gap: number,
): FabricObject {
  // Safe area : trait + tirets entièrement paramétrables (longueur tiret, espacement).
  const r = new Rect({
    left: x + margin,
    top: y + margin,
    originX: 'left',
    originY: 'top',
    width: w - margin * 2,
    height: h - margin * 2,
    fill: 'rgba(0,0,0,0)',
    stroke: color,
    strokeWidth: stroke,
    strokeUniform: true,
    strokeDashArray: [dash, gap],
  })
  return tag(r, 'safe-area')
}

/**
 * Détecte tout objet ressemblant à un print mark sur le canvas et le retire.
 *
 * Mode `'tagged'` (défaut) — runtime safe :
 *   1. Marks taggés `isPrintMark: true` ou `markType: ...`
 *
 * Mode `'aggressive'` — purge au chargement depuis Firestore :
 *   1. Tous les cas ci-dessus, plus
 *   2. Tout rect/line avec `strokeDashArray` non vide (aucun objet utilisateur
 *      légitime ne porte de pointillés dans ce projet à ce stade du pipeline).
 */
function isTransparent(fill: unknown): boolean {
  if (fill == null) return true
  if (fill === 'transparent') return true
  if (typeof fill !== 'string') return false
  const s = fill.toLowerCase().replace(/\s+/g, '')
  return s === 'rgba(0,0,0,0)' || s === 'rgb(0,0,0,0)' || /^rgba\([^)]*,0(\.0+)?\)$/.test(s)
}

function isBlackFill(fill: unknown): boolean {
  if (typeof fill !== 'string') return false
  const s = fill.toLowerCase().replace(/\s+/g, '')
  return s === '#000' || s === '#000000' || s === 'black' ||
         /^rgb\(0,0,0\)$/.test(s) ||
         /^rgba\(0,0,0,(?:1|0?\.[5-9]\d*)\)$/.test(s)
}

/**
 * Heuristique : objet probablement une hirondelle/crop mark "orphelin" (perdu
 * son tag isPrintMark lors d'un cycle save/load Firestore d'une vieille version
 * du code). On cible des formes très spécifiques pour minimiser les faux positifs.
 */
function looksLikeOrphanMark(obj: FabricObject): boolean {
  const anyObj = obj as FabricObject & {
    type?: string
    radius?: number
    width?: number
    height?: number
    fill?: unknown
    stroke?: unknown
  }
  const type = anyObj.type
  // Petit cercle creux (cercle externe d'une mire)
  if (type === 'circle' || type === 'Circle') {
    const r = anyObj.radius ?? 0
    if (r > 0 && r <= 12 && isTransparent(anyObj.fill) && anyObj.stroke != null) {
      return true
    }
    // Disque plein très petit (point central de mire ou registration dot)
    if (r > 0 && r <= 4 && !isTransparent(anyObj.fill)) {
      return true
    }
  }
  // Petit rectangle plein (bras de croix ou trait de coupe). Limites élargies +
  // détection couleur noire (vieilles versions avec CROP_COLOR = '#000000').
  if (type === 'rect' || type === 'Rect') {
    const w = anyObj.width ?? 0
    const h = anyObj.height ?? 0
    const minSide = Math.min(w, h)
    const maxSide = Math.max(w, h)
    if (minSide > 0 && minSide <= 10 && maxSide <= 80 && !isTransparent(anyObj.fill)) {
      return true
    }
    // Tout petit rectangle noir, peu importe sa longueur (bras de vieille croix)
    if (minSide > 0 && minSide <= 20 && isBlackFill(anyObj.fill)) {
      return true
    }
  }
  // Path ou Group ressemblant à une mire (registration target SVG figé)
  if (type === 'path' || type === 'Path' || type === 'group' || type === 'Group') {
    const w = anyObj.width ?? 0
    const h = anyObj.height ?? 0
    // Forme petite et carrée-ish (mires sont quasi-symétriques)
    if (w > 0 && h > 0 && w <= 40 && h <= 40) {
      const ratio = Math.min(w, h) / Math.max(w, h)
      if (ratio >= 0.6) {
        return true
      }
    }
  }
  return false
}

export function removeAllPrintMarks(
  objects: readonly FabricObject[],
  mode: 'tagged' | 'aggressive' = 'tagged',
): FabricObject[] {
  const removed: FabricObject[] = []
  for (const obj of objects) {
    const data = (obj as FabricObject & { data?: Record<string, unknown> }).data
    if (data?.isPrintMark === true) {
      removed.push(obj)
      continue
    }
    if (typeof data?.markType === 'string') {
      removed.push(obj)
      continue
    }
    if (mode === 'aggressive') {
      const anyObj = obj as FabricObject & { strokeDashArray?: number[] | null }
      const dash = anyObj.strokeDashArray
      if (Array.isArray(dash) && dash.length > 0) {
        removed.push(obj)
        continue
      }
      if (looksLikeOrphanMark(obj)) {
        removed.push(obj)
      }
    }
  }
  return removed
}

export function buildPrintMarks(opts: PrintMarksOptions & { dpi?: number }): FabricObject[] {
  const objs: FabricObject[] = []
  const x = opts.pageLeftPx ?? 0
  const y = opts.pageTopPx ?? 0
  const w = opts.canvasWidthPx
  const h = opts.canvasHeightPx
  const dpi = opts.dpi ?? 300

  // Styles paramétrables — défauts alignés sur le store.
  const bleedColor = opts.bleedColor ?? DEFAULT_BLEED_COLOR
  const bleedStroke = opts.bleedStroke ?? DEFAULT_STROKE
  const cropColor = opts.cropColor ?? DEFAULT_CROP_COLOR
  const cropStroke = opts.cropStroke ?? DEFAULT_STROKE
  const regColor = opts.regColor ?? DEFAULT_CROP_COLOR
  const regStroke = opts.regStroke ?? DEFAULT_STROKE
  const regRadiusMm = opts.regRadiusMm ?? DEFAULT_REG_RADIUS_MM
  const regOffsetMm = opts.regOffsetMm ?? 0
  const safeColor = opts.safeColor ?? DEFAULT_SAFE_COLOR
  const safeStroke = opts.safeStroke ?? DEFAULT_STROKE
  const safeDash = opts.safeDash ?? 4
  const safeGap = opts.safeGap ?? 3

  if (opts.showPrintMarks) {
    if (opts.bleedPx > 0) {
      objs.push(makeBleedRect(x, y, w, h, opts.bleedPx, bleedColor, bleedStroke))
    }
    objs.push(
      ...makeCornerMarks(
        x, y, w, h, opts.bleedPx, opts.cropMarkOffsetPx, opts.cropMarkLengthPx,
        cropColor, cropStroke,
      ),
    )
  }

  if (opts.showSafeArea && opts.safeAreaPx > 0) {
    objs.push(makeSafeArea(x, y, w, h, opts.safeAreaPx, safeColor, safeStroke, safeDash, safeGap))
  }

  if (opts.showRegistrationMarks) {
    objs.push(
      ...makeRegistrationMarks(
        x, y, w, h,
        opts.bleedPx, opts.cropMarkOffsetPx, opts.cropMarkLengthPx, dpi,
        regColor, regStroke, regRadiusMm, regOffsetMm,
      ),
    )
  }

  return objs
}

if (import.meta.hot) {
  import.meta.hot.accept()
}
