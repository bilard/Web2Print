/**
 * IDML Parser — Reworked for real-world InDesign files
 *
 * Key points:
 * - ItemTransform = [a, b, c, d, tx, ty] affine matrix (scale + rotation + translation)
 * - PathPointType has Anchor + LeftDirection + RightDirection for Bézier curves
 * - Colors use CMYK notation: C=0 M=100 J=100 N=0
 * - Page ItemTransform offsets the page in the spread
 * - AppliedFont is in <Properties><AppliedFont> child, NOT an XML attribute
 * - Style cascade: CharacterStyleRange → AppliedCharacterStyle → ParagraphStyleRange → AppliedParagraphStyle
 */

export interface IdmlColor {
  r: number; g: number; b: number; a: number
}

export interface IdmlShadow {
  opacity: number   // 0–100
  offsetX: number   // pt
  offsetY: number   // pt
  blur: number      // pt (Size in IDML)
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
  // True for anchored frames (position relative to parent text flow, not absolute)
  isAnchored?: boolean
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
}

// ─── Style definitions ──────────────────────────────────────────────────────

interface GrepStyleMapping {
  pattern: string         // regex pattern (decoded from XML entities)
  charStyleId: string     // reference to character style
}

interface NestedStyleRule {
  charStyleId: string       // reference to character style
  delimiter: string         // specific string or special: 'AnyWord', 'AnyCharacter', 'Sentence', etc.
  repetition: number        // how many occurrences of delimiter to consume
  inclusive: boolean         // true = delimiter char included in THIS rule; false = in NEXT rule
}

interface StyleDef {
  fontSize?: number
  fontFamily?: string
  fontStyle?: string
  fillColor?: string
  alignment?: 'left' | 'center' | 'right' | 'justify'
  basedOn?: string
  baselineShift?: number
  leading?: number
  autoLeading?: number      // percentage (default 120, i.e. 120% of fontSize)
  horizontalScale?: number  // percentage (100 = normal)
  verticalScale?: number    // percentage (100 = normal)
  tracking?: number         // letter-spacing in 1/1000 em (InDesign "Approche")
  skew?: number             // italic angle in degrees (InDesign "Oblique simulée")
  strikeThru?: boolean      // StrikeThru attribute
  grepStyles?: GrepStyleMapping[]
  nestedStyles?: NestedStyleRule[]
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function parseXml(xmlStr: string): Document {
  return new DOMParser().parseFromString(xmlStr, 'application/xml')
}

function attr(el: Element, name: string, fallback = ''): string {
  return el.getAttribute(name) ?? fallback
}

/** Get direct child elements by tag name (`:scope >` doesn't work on XML docs from DOMParser) */
function directChildren(parent: Element, tagName: string): Element[] {
  const result: Element[] = []
  for (let i = 0; i < parent.childNodes.length; i++) {
    const child = parent.childNodes[i]
    if (child.nodeType === 1 && (child as Element).tagName === tagName) {
      result.push(child as Element)
    }
  }
  return result
}

/** Get text content from a <Properties><TagName> child element */
function propText(el: Element, tagName: string): string | null {
  const propsArr = directChildren(el, 'Properties')
  if (propsArr.length === 0) return null
  const children = directChildren(propsArr[0], tagName)
  return children.length > 0 ? (children[0].textContent?.trim() || null) : null
}

type Mat = [number, number, number, number, number, number]

function parseTf(val: string): Mat {
  const p = val.trim().split(/\s+/).map(Number)
  if (p.length === 6 && p.every((n) => !isNaN(n))) return p as Mat
  return [1, 0, 0, 1, 0, 0]
}

function mulMat(a: Mat, b: Mat): Mat {
  return [
    a[0]*b[0]+a[2]*b[1], a[1]*b[0]+a[3]*b[1],
    a[0]*b[2]+a[2]*b[3], a[1]*b[2]+a[3]*b[3],
    a[0]*b[4]+a[2]*b[5]+a[4], a[1]*b[4]+a[3]*b[5]+a[5],
  ]
}

function tfPoint(x: number, y: number, m: Mat): { x: number; y: number } {
  return { x: m[0]*x + m[2]*y + m[4], y: m[1]*x + m[3]*y + m[5] }
}

function decompose(m: Mat) {
  return {
    scaleX: Math.sqrt(m[0]*m[0] + m[1]*m[1]),
    scaleY: Math.sqrt(m[2]*m[2] + m[3]*m[3]),
    angle: Math.atan2(m[1], m[0]) * (180 / Math.PI),
    tx: m[4], ty: m[5],
  }
}

// ─── Bézier Path points ──────────────────────────────────────────────────────

interface PathPoint {
  anchor: [number, number]
  leftDir: [number, number]
  rightDir: [number, number]
}

function parseXY(val: string | null, fallback: [number, number]): [number, number] {
  if (!val) return fallback
  const p = val.trim().split(/\s+/).map(Number)
  return [isNaN(p[0]) ? fallback[0] : p[0], isNaN(p[1]) ? fallback[1] : p[1]]
}

function parsePathPoints(el: Element): PathPoint[] {
  const points: PathPoint[] = []
  // Only look in direct PathGeometry, not in nested child elements (Image, etc.)
  const propsArr = directChildren(el, 'Properties')
  let pts: ArrayLike<Element> = []
  if (propsArr.length > 0) {
    const geomArr = directChildren(propsArr[0], 'PathGeometry')
    if (geomArr.length > 0) {
      pts = geomArr[0].getElementsByTagName('PathPointType')
    }
  }
  if (pts.length === 0) {
    pts = el.getElementsByTagName('PathPointType')
  }
  for (let i = 0; i < pts.length; i++) {
    const anchorAttr = pts[i].getAttribute('Anchor')
    const anchor = parseXY(anchorAttr, [0, 0])
    const leftDir = parseXY(pts[i].getAttribute('LeftDirection'), anchor)
    const rightDir = parseXY(pts[i].getAttribute('RightDirection'), anchor)
    points.push({ anchor, leftDir, rightDir })
  }
  return points
}

/**
 * Generates SVG path data from IDML PathPoints, centered at bounding box center.
 * Uses cubic Bézier curves (C) when LeftDirection/RightDirection differ from anchor.
 */
function pathPointsToSvg(points: PathPoint[]): string {
  if (points.length < 2) return ''

  const xs = points.map(p => p.anchor[0])
  const ys = points.map(p => p.anchor[1])
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2
  const cy = (Math.min(...ys) + Math.max(...ys)) / 2

  const fx = (x: number) => (x - cx).toFixed(3)
  const fy = (y: number) => (y - cy).toFixed(3)

  let d = `M ${fx(points[0].anchor[0])} ${fy(points[0].anchor[1])}`

  for (let i = 0; i < points.length; i++) {
    const curr = points[i]
    const next = points[(i + 1) % points.length]

    const cp1 = curr.rightDir
    const cp2 = next.leftDir
    const dest = next.anchor

    const isStraight =
      cp1[0] === curr.anchor[0] && cp1[1] === curr.anchor[1] &&
      cp2[0] === dest[0] && cp2[1] === dest[1]

    if (isStraight) {
      d += ` L ${fx(dest[0])} ${fy(dest[1])}`
    } else {
      d += ` C ${fx(cp1[0])} ${fy(cp1[1])} ${fx(cp2[0])} ${fy(cp2[1])} ${fx(dest[0])} ${fy(dest[1])}`
    }
  }

  return d + ' Z'
}

// ─── World transform ─────────────────────────────────────────────────────────

/** Compose element's ItemTransform with all parent Group transforms up to Spread */
function computeWorldTransform(el: Element): Mat {
  const selfId = el.getAttribute('Self') ?? '?'
  const ownTfStr = attr(el, 'ItemTransform', '1 0 0 1 0 0')
  let tf = parseTf(ownTfStr)
  const groupChain: string[] = []
  let parentNode = el.parentNode as Element | null
  while (parentNode && parentNode.nodeType === 1) {
    const nodeName = (parentNode as Element).tagName ?? ''
    if (nodeName === 'Group') {
      const parentTfStr = (parentNode as Element).getAttribute('ItemTransform') ?? '1 0 0 1 0 0'
      const parentTf = parseTf(parentTfStr)
      tf = mulMat(parentTf, tf)
      groupChain.push(`Group(${(parentNode as Element).getAttribute('Self') ?? '?'} tf=${parentTfStr})`)
    }
    if (nodeName === 'Spread' || nodeName.includes('Spread')) break
    parentNode = parentNode.parentNode as Element | null
  }
  if (groupChain.length > 0) {
    console.log(`[IDML] computeWorldTransform ${selfId}: ownTf=${ownTfStr} groups=[${groupChain.join(' > ')}] → worldTf=[${tf.map(n => n.toFixed(3)).join(', ')}]`)
  }
  return tf
}

// ─── Anchored frames ────────────────────────────────────────────────────────

interface AnchoredFrameRef {
  self: string
  parentStory: string
  itemTransform: Mat
  bounds: Bounds
  appliedObjectStyle?: string
  fillColor?: string
  strokeColor?: string
  strokeWeight?: number
  /** 'Anchored' = custom positioned, undefined = inline */
  anchoredPosition?: string
  anchorPoint?: string
  horizontalAlignment?: string
  verticalAlignment?: string
  anchorXoffset?: number
  anchorYoffset?: number
  autoSizingType?: string
}

/** Extract anchored TextFrame references from story XML */
function extractAnchoredFrames(storyXml: string): AnchoredFrameRef[] {
  const doc = parseXml(storyXml)
  const textFrames = doc.getElementsByTagName('TextFrame')
  const result: AnchoredFrameRef[] = []
  for (let i = 0; i < textFrames.length; i++) {
    const tf = textFrames[i]
    const self = attr(tf, 'Self')
    const parentStory = attr(tf, 'ParentStory')
    if (!parentStory || parentStory === 'n') continue
    const itemTf = parseTf(attr(tf, 'ItemTransform', '1 0 0 1 0 0'))
    const parsed = parseBounds(tf)
    if (!parsed) continue
    // Extract AnchoredObjectSetting
    const aosEls = tf.getElementsByTagName('AnchoredObjectSetting')
    let anchoredPosition: string | undefined
    let anchorPoint: string | undefined
    let horizontalAlignment: string | undefined
    let verticalAlignment: string | undefined
    let anchorXoffset: number | undefined
    let anchorYoffset: number | undefined
    if (aosEls.length > 0) {
      const aos = aosEls[0]
      anchoredPosition = aos.getAttribute('AnchoredPosition') || undefined
      anchorPoint = aos.getAttribute('AnchorPoint') || undefined
      horizontalAlignment = aos.getAttribute('HorizontalAlignment') || undefined
      verticalAlignment = aos.getAttribute('VerticalAlignment') || undefined
      anchorXoffset = parseFloat(aos.getAttribute('AnchorXoffset') ?? '0') || undefined
      anchorYoffset = parseFloat(aos.getAttribute('AnchorYoffset') ?? '0') || undefined
    }

    // Extract TextFramePreference AutoSizingType
    const tfpEls = tf.getElementsByTagName('TextFramePreference')
    const autoSizingType = tfpEls.length > 0
      ? (tfpEls[0].getAttribute('AutoSizingType') || undefined)
      : undefined

    result.push({
      self,
      parentStory,
      itemTransform: itemTf,
      bounds: parsed.bounds,
      appliedObjectStyle: attr(tf, 'AppliedObjectStyle') || undefined,
      fillColor: attr(tf, 'FillColor') || undefined,
      strokeColor: attr(tf, 'StrokeColor') || undefined,
      strokeWeight: parseFloat(attr(tf, 'StrokeWeight', '0')) || undefined,
      anchoredPosition,
      anchorPoint,
      horizontalAlignment,
      verticalAlignment,
      anchorXoffset,
      anchorYoffset,
      autoSizingType,
    })
  }
  return result
}

// ─── Bounds ──────────────────────────────────────────────────────────────────

interface Bounds { top: number; left: number; bottom: number; right: number }
interface Anchor { x: number; y: number }

function anchorsToBounds(anchors: Anchor[]): Bounds | null {
  if (anchors.length < 2) return null
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const a of anchors) {
    if (a.x < minX) minX = a.x
    if (a.y < minY) minY = a.y
    if (a.x > maxX) maxX = a.x
    if (a.y > maxY) maxY = a.y
  }
  return { top: minY, left: minX, bottom: maxY, right: maxX }
}

function parseBounds(el: Element): { bounds: Bounds; anchors: Anchor[] } | null {
  // Try GeometricBounds attribute first
  const gbAttr = el.getAttribute('GeometricBounds')
  if (gbAttr) {
    const p = gbAttr.trim().split(/\s+/).map(Number)
    if (p.length >= 4 && p.every(n => !isNaN(n))) {
      return {
        bounds: { top: p[0], left: p[1], bottom: p[2], right: p[3] },
        anchors: [
          { x: p[1], y: p[0] }, { x: p[3], y: p[0] },
          { x: p[3], y: p[2] }, { x: p[1], y: p[2] },
        ],
      }
    }
  }

  // PathGeometry anchors
  const pathPts = parsePathPoints(el)
  if (pathPts.length >= 2) {
    const anchors = pathPts.map(p => ({ x: p.anchor[0], y: p.anchor[1] }))
    const bounds = anchorsToBounds(anchors)
    if (bounds) return { bounds, anchors }
  }

  return null
}

/** Sélectionne le décalage (offsetX, offsetY) de la page à utiliser dans un spread.
 *  Pour les spreads en pages opposées, retourne la page à la coordonnée X la plus petite
 *  parmi celles dont l'offset est non-négatif (= page de droite dans un gabarit face à face). */
function selectPageOffset(pages: HTMLCollectionOf<Element>): { offsetX: number; offsetY: number } {
  const pageArray = Array.from(pages)
  if (pageArray.length === 0) return { offsetX: 0, offsetY: 0 }

  const offsets = pageArray.map((p) => {
    const tf = parseTf(attr(p, 'ItemTransform', '1 0 0 1 0 0'))
    const bounds = parseBounds(p)
    return {
      offsetX: bounds ? bounds.bounds.left + tf[4] : tf[4],
      offsetY: bounds ? bounds.bounds.top  + tf[5] : tf[5],
    }
  })
  const nonNeg = offsets.filter((o) => o.offsetX >= -0.5)
  return nonNeg.length > 0
    ? nonNeg.reduce((a, b) => a.offsetX <= b.offsetX ? a : b)
    : offsets.reduce((a, b) => a.offsetX >= b.offsetX ? a : b)
}

// ─── Colors ─────────────────────────────────────────────────────────────────

/**
 * CMYK → sRGB using the Neugebauer model with FOGRA39 primaries.
 *
 * The 8 Neugebauer primaries represent every combination of CMY inks
 * at 0% or 100%. Demichel equations compute area fractions for halftone
 * dot overlaps, then we blend the primary colors proportionally.
 * K is applied as a multiplicative darkening factor on top.
 *
 * FOGRA39 primary sRGB values (measured from ICC profile):
 *   W  (no ink)  : (255, 255, 255)
 *   C  (cyan)    : (  0, 158, 220)
 *   M  (magenta) : (227,   6, 118)
 *   Y  (yellow)  : (255, 236,   0)
 *   CM (blue)    : ( 80,  53, 150)
 *   CY (green)   : (  0, 152,  70)
 *   MY (red)     : (227,   6,  19)
 *   CMY          : ( 55,  40,  40)
 */
// FOGRA39 Neugebauer primaries [R, G, B]
const NB_W:   [number, number, number] = [255, 255, 255]
const NB_C:   [number, number, number] = [  0, 158, 220]
const NB_M:   [number, number, number] = [227,   6, 118]
const NB_Y:   [number, number, number] = [255, 236,   0]
const NB_CM:  [number, number, number] = [ 80,  53, 150]
const NB_CY:  [number, number, number] = [  0, 152,  70]
const NB_MY:  [number, number, number] = [227,   6,  19]
const NB_CMY: [number, number, number] = [ 55,  40,  40]

function cmykToRgb(c: number, m: number, y: number, k: number): IdmlColor {
  const C = c / 100, Y = y / 100, K = k / 100
  // Tone curve correction for magenta: compensates for halftone dot interaction
  const M = Math.pow(m / 100, 1.35)

  // Demichel equations: area fractions for each Neugebauer primary
  const c0 = 1 - C, m0 = 1 - M, y0 = 1 - Y
  const a_w   = c0 * m0 * y0   // white (no ink)
  const a_c   = C  * m0 * y0   // cyan only
  const a_m   = c0 * M  * y0   // magenta only
  const a_y   = c0 * m0 * Y    // yellow only
  const a_cm  = C  * M  * y0   // cyan + magenta
  const a_cy  = C  * m0 * Y    // cyan + yellow
  const a_my  = c0 * M  * Y    // magenta + yellow
  const a_cmy = C  * M  * Y    // all three

  // Neugebauer blend (weighted sum of 8 primaries)
  let r = 0, g = 0, b = 0
  const primaries: [[number, number, number], number][] = [
    [NB_W, a_w], [NB_C, a_c], [NB_M, a_m], [NB_Y, a_y],
    [NB_CM, a_cm], [NB_CY, a_cy], [NB_MY, a_my], [NB_CMY, a_cmy],
  ]
  for (const [rgb, a] of primaries) {
    r += a * rgb[0]
    g += a * rgb[1]
    b += a * rgb[2]
  }

  // Apply K channel: multiplicative darkening (Beer-Lambert for black ink)
  // Black 100% → sRGB(34, 30, 33), transmittance ≈ (0.133, 0.118, 0.129)
  if (K > 0) {
    r *= 1 - K * 0.867
    g *= 1 - K * 0.882
    b *= 1 - K * 0.871
  }

  const clamp = (v: number) => Math.round(Math.max(0, Math.min(255, v)))
  return { r: clamp(r), g: clamp(g), b: clamp(b), a: 1 }
}

function buildColorMap(resources: Record<string, string>): Map<string, IdmlColor> {
  const map = new Map<string, IdmlColor>()
  map.set('Color/Black', { r: 0, g: 0, b: 0, a: 1 })
  map.set('Color/White', { r: 255, g: 255, b: 255, a: 1 })
  map.set('Color/Paper', { r: 255, g: 255, b: 255, a: 1 })
  map.set('Color/None', { r: 0, g: 0, b: 0, a: 0 })
  map.set('Swatch/None', { r: 0, g: 0, b: 0, a: 0 })
  map.set('$ID/None', { r: 0, g: 0, b: 0, a: 0 })
  map.set('Color/Registration', { r: 0, g: 0, b: 0, a: 1 })

  for (const [, xml] of Object.entries(resources)) {
    if (!xml.includes('<Color ')) continue
    try {
      const doc = parseXml(xml)
      const colors = doc.getElementsByTagName('Color')
      for (let i = 0; i < colors.length; i++) {
        const el = colors[i]
        const id = attr(el, 'Self')
        const space = attr(el, 'Space')
        const valStr = attr(el, 'ColorValue')
        if (!id || !valStr) continue

        // Prefer AlternateColorValue (exact RGB from InDesign's ICC conversion)
        const altSpace = attr(el, 'AlternateSpace')
        const altValStr = attr(el, 'AlternateColorValue')
        if (altSpace && altValStr && (altSpace === 'sRGB' || altSpace === 'RGB')) {
          const altVals = altValStr.trim().split(/\s+/).map(Number)
          if (altVals.length >= 3) {
            // InDesign stores AlternateColorValue as 0-255 range
            const maxVal = Math.max(...altVals.slice(0, 3))
            const isNormalized = maxVal <= 1.01 && maxVal > 0
            const factor = isNormalized ? 255 : 1
            map.set(id, {
              r: Math.round(altVals[0] * factor),
              g: Math.round(altVals[1] * factor),
              b: Math.round(altVals[2] * factor),
              a: 1,
            })
            continue
          }
        }

        const vals = valStr.trim().split(/\s+/).map(Number)
        if (space === 'CMYK' && vals.length >= 4) {
          map.set(id, cmykToRgb(vals[0], vals[1], vals[2], vals[3]))
        } else if ((space === 'RGB' || space === 'sRGB') && vals.length >= 3) {
          map.set(id, { r: Math.round(vals[0]), g: Math.round(vals[1]), b: Math.round(vals[2]), a: 1 })
        }
      }
    } catch { /* skip */ }
  }
  return map
}

// ─── Style parsing ──────────────────────────────────────────────────────────

function parseStyleDef(el: Element): StyleDef {
  const def: StyleDef = {}

  // Font size from attribute
  const ps = el.getAttribute('PointSize')
  if (ps) def.fontSize = parseFloat(ps) || undefined

  // FontStyle attribute (Bold, Italic, Regular, Black, etc.)
  const fs = el.getAttribute('FontStyle')
  if (fs) def.fontStyle = fs

  // FillColor attribute
  const fc = el.getAttribute('FillColor')
  if (fc) def.fillColor = fc

  // Alignment
  const just = el.getAttribute('Justification')
  if (just) def.alignment = alignValue(just)

  // AppliedFont — in <Properties><AppliedFont> child (NOT attribute)
  const font = propText(el, 'AppliedFont')
  if (font) def.fontFamily = font

  // BaselineShift attribute (positive = up / superscript)
  // NOTE: 0 is a valid explicit override (resets parent style), so don't use || undefined
  const bs = el.getAttribute('BaselineShift')
  if (bs) {
    const bsVal = parseFloat(bs)
    if (!isNaN(bsVal)) def.baselineShift = bsVal
  }

  // Leading (line height in pt) — can be attribute or <Properties><Leading> child
  // "Auto" means 120% of font size (default)
  let lead = el.getAttribute('Leading')
  if (!lead) {
    // Try <Properties><Leading type="unit">value</Leading>
    // Only use it if type="unit" — type="enumeration" means "Auto"
    const propsArr = directChildren(el, 'Properties')
    if (propsArr.length > 0) {
      const leadEls = directChildren(propsArr[0], 'Leading')
      if (leadEls.length > 0) {
        const leadEl = leadEls[0]
        const leadType = leadEl.getAttribute('type')
        if (leadType === 'unit') {
          lead = leadEl.textContent?.trim() || null
        }
        // type="enumeration" with value "Auto" → skip (use auto leading)
      }
    }
  }
  if (lead && lead !== 'Auto') def.leading = parseFloat(lead) || undefined

  // AutoLeading (percentage, default 120 = 120% of fontSize)
  // Used when Leading is "Auto" or absent
  const al = el.getAttribute('AutoLeading')
  if (al) def.autoLeading = parseFloat(al) || undefined

  // HorizontalScale / VerticalScale (percentage, 100 = normal)
  const hs = el.getAttribute('HorizontalScale')
  if (hs) def.horizontalScale = parseFloat(hs) || undefined
  const vs = el.getAttribute('VerticalScale')
  if (vs) def.verticalScale = parseFloat(vs) || undefined

  // Tracking (letter-spacing in 1/1000 em — InDesign "Approche")
  const tr = el.getAttribute('Tracking')
  if (tr) {
    const trVal = parseFloat(tr)
    if (!isNaN(trVal)) def.tracking = trVal
  }

  // Skew (italic angle in degrees — InDesign "Oblique simulée")
  const skew = el.getAttribute('Skew')
  if (skew) {
    const skewVal = parseFloat(skew)
    if (!isNaN(skewVal) && skewVal !== 0) def.skew = skewVal
  }

  // StrikeThru (barré)
  const strikeThru = el.getAttribute('StrikeThru')
  if (strikeThru === 'true') def.strikeThru = true

  // BasedOn — in <Properties><BasedOn>
  const basedOn = propText(el, 'BasedOn')
  if (basedOn && !basedOn.startsWith('$ID/')) def.basedOn = basedOn

  return def
}

interface ObjectStyleDef {
  fillColor?: string
  strokeColor?: string
  strokeWeight?: number
  strokeAlignment?: string
  shadow?: IdmlShadow | null
  cornerRadius?: number
  cornerOption?: string  // 'None' | 'RoundedCorner' | 'InverseRoundedCorner' | etc.
  // TextFramePreference from ObjectStyle
  insetTop?: number
  insetBottom?: number
  insetLeft?: number
  insetRight?: number
  verticalJustification?: 'top' | 'center' | 'bottom'
}

/**
 * Parse InsetSpacing from a TextFramePreference element.
 * IDML stores it as:
 *   - Attribute: InsetSpacing="5.669 5.669 5.669 5.669"
 *   - Or Properties child: <Properties><InsetSpacing type="list"><ListItem type="unit">5.669</ListItem>...</InsetSpacing></Properties>
 * Returns [top, left, bottom, right] in pt, or null if not found.
 */
function parseInsetSpacing(tfp: Element): [number, number, number, number] | null {
  // Try attribute first
  const insetStr = tfp.getAttribute('InsetSpacing')
  if (insetStr) {
    const vals = insetStr.trim().split(/\s+/).map(Number)
    if (vals.length === 1 && !isNaN(vals[0]) && vals[0] > 0) {
      return [vals[0], vals[0], vals[0], vals[0]]
    }
    if (vals.length >= 4 && vals.some(v => v > 0)) {
      return [vals[0] ?? 0, vals[1] ?? 0, vals[2] ?? 0, vals[3] ?? 0]
    }
  }
  // Try Properties > InsetSpacing
  const propsEls = tfp.getElementsByTagName('Properties')
  if (propsEls.length > 0) {
    const isEls = propsEls[0].getElementsByTagName('InsetSpacing')
    if (isEls.length > 0) {
      const isEl = isEls[0]
      const listItems = isEl.getElementsByTagName('ListItem')
      if (listItems.length >= 4) {
        const vals = Array.from({ length: 4 }, (_, i) =>
          parseFloat(listItems[i].textContent ?? '0') || 0
        )
        if (vals.some(v => v > 0)) {
          return [vals[0], vals[1], vals[2], vals[3]]
        }
      } else if (listItems.length === 1) {
        const v = parseFloat(listItems[0].textContent ?? '0') || 0
        if (v > 0) return [v, v, v, v]
      } else if (listItems.length === 0) {
        // <InsetSpacing type="unit">VALUE</InsetSpacing> — single uniform value
        const v = parseFloat(isEl.textContent?.trim() ?? '0') || 0
        if (v > 0) return [v, v, v, v]
      }
    }
  }
  return null
}

function buildObjectStyleMap(resources: Record<string, string>): Map<string, ObjectStyleDef> {
  const map = new Map<string, ObjectStyleDef>()
  for (const [, xml] of Object.entries(resources)) {
    if (!xml.includes('ObjectStyle')) continue
    try {
      const doc = parseXml(xml)
      const els = doc.getElementsByTagName('ObjectStyle')
      for (let i = 0; i < els.length; i++) {
        const el = els[i]
        const id = attr(el, 'Self')
        if (!id) continue
        const def: ObjectStyleDef = {}
        const fc = el.getAttribute('FillColor')
        if (fc && fc !== 'Swatch/None') def.fillColor = fc
        const sc = el.getAttribute('StrokeColor')
        if (sc && sc !== 'Swatch/None') def.strokeColor = sc
        const sw = el.getAttribute('StrokeWeight')
        if (sw) def.strokeWeight = parseFloat(sw) || 0
        const sa = el.getAttribute('StrokeAlignment')
        if (sa) def.strokeAlignment = sa
        // Corner radius from ObjectStyle
        const objCornerRadii = [
          parseFloat(el.getAttribute('TopLeftCornerRadius') ?? '0'),
          parseFloat(el.getAttribute('TopRightCornerRadius') ?? '0'),
          parseFloat(el.getAttribute('BottomLeftCornerRadius') ?? '0'),
          parseFloat(el.getAttribute('BottomRightCornerRadius') ?? '0'),
        ].filter(r => !isNaN(r))
        const objMaxRadius = Math.max(0, ...objCornerRadii)
        if (objMaxRadius > 0) def.cornerRadius = objMaxRadius
        // Store CornerOption to know if rounding should actually be applied
        const objCornerOption = el.getAttribute('CornerOption') || el.getAttribute('TopLeftCornerOption') || ''
        if (objCornerOption) def.cornerOption = objCornerOption
        // Parse DropShadowSetting from TransparencySetting
        const transp = el.getElementsByTagName('DropShadowSetting')
        if (transp.length > 0) {
          const ds = transp[0]
          const mode = ds.getAttribute('Mode') ?? ''
          if (mode === 'Drop') {
            const opacity = parseFloat(ds.getAttribute('Opacity') ?? '0')
            if (opacity > 0) {
              def.shadow = {
                opacity: opacity || 75,
                offsetX: parseFloat(ds.getAttribute('XOffset') ?? '0'),
                offsetY: parseFloat(ds.getAttribute('YOffset') ?? '0'),
                blur: parseFloat(ds.getAttribute('Size') ?? '0'),
              }
            }
          }
        }
        // TextFramePreference: InsetSpacing + VerticalJustification
        const tfpEls = el.getElementsByTagName('TextFramePreference')
        if (tfpEls.length > 0) {
          const tfp = tfpEls[0]
          const insets = parseInsetSpacing(tfp)
          if (insets) {
            def.insetTop = insets[0]; def.insetLeft = insets[1]
            def.insetBottom = insets[2]; def.insetRight = insets[3]
          }
          const vjAttr = tfp.getAttribute('VerticalJustification')
          if (vjAttr === 'CenterAlign') def.verticalJustification = 'center'
          else if (vjAttr === 'BottomAlign') def.verticalJustification = 'bottom'
        }
        map.set(id, def)
      }
    } catch { /* skip */ }
  }
  return map
}

function buildStyleMaps(resources: Record<string, string>): {
  paraStyles: Map<string, StyleDef>
  charStyles: Map<string, StyleDef>
} {
  const paraStyles = new Map<string, StyleDef>()
  const charStyles = new Map<string, StyleDef>()

  for (const [, xml] of Object.entries(resources)) {
    if (!xml.includes('ParagraphStyle') && !xml.includes('CharacterStyle')) continue
    try {
      const doc = parseXml(xml)

      const paraEls = doc.getElementsByTagName('ParagraphStyle')
      for (let i = 0; i < paraEls.length; i++) {
        const el = paraEls[i]
        const id = attr(el, 'Self')
        if (!id) continue
        // DEBUG: dump all attributes of each ParagraphStyle
        const allAttrs: Record<string, string> = {}
        for (let a = 0; a < el.attributes.length; a++) {
          const at = el.attributes[a]
          if (at.name === 'Self' || at.name === 'Name') continue
          allAttrs[at.name] = at.value
        }
        // Also check Properties children for Leading/AutoLeading
        const dbgProps = directChildren(el, 'Properties')
        if (dbgProps.length > 0) {
          for (const child of Array.from(dbgProps[0].childNodes)) {
            if (child.nodeType === 1) {
              const ce = child as Element
              const t = ce.getAttribute('type') || ''
              allAttrs[`Props/${ce.tagName}(${t})`] = ce.textContent?.trim() || ''
            }
          }
        }
        console.log(`[IDML Style] ${id}:`, JSON.stringify(allAttrs))
        const def = parseStyleDef(el)
        // Parse AllGREPStyles from <Properties><AllGREPStyles>
        const propsArr = directChildren(el, 'Properties')
        if (propsArr.length > 0) {
          const grepLists = directChildren(propsArr[0], 'AllGREPStyles')
          if (grepLists.length > 0) {
            const items = directChildren(grepLists[0], 'ListItem')
            const greps: GrepStyleMapping[] = []
            for (const item of items) {
              const csEls = directChildren(item, 'AppliedCharacterStyle')
              const geEls = directChildren(item, 'GrepExpression')
              if (csEls.length > 0 && geEls.length > 0) {
                const charStyleId = csEls[0].textContent?.trim() ?? ''
                const pattern = geEls[0].textContent?.trim() ?? ''
                if (charStyleId && pattern) {
                  greps.push({ pattern, charStyleId })
                }
              }
            }
            if (greps.length > 0) def.grepStyles = greps
          }
          // Parse AllNestedStyles from <Properties><AllNestedStyles>
          const nestedLists = directChildren(propsArr[0], 'AllNestedStyles')
          if (nestedLists.length > 0) {
            const items = directChildren(nestedLists[0], 'ListItem')
            const nested: NestedStyleRule[] = []
            for (const item of items) {
              const csEls = directChildren(item, 'AppliedCharacterStyle')
              const delimEls = directChildren(item, 'Delimiter')
              const repEls = directChildren(item, 'Repetition')
              const inclEls = directChildren(item, 'Inclusive')
              if (csEls.length > 0 && delimEls.length > 0) {
                const charStyleId = csEls[0].textContent?.trim() ?? ''
                const delimType = delimEls[0].getAttribute('type') ?? 'string'
                const delimiter = delimType === 'enumeration'
                  ? (delimEls[0].textContent?.trim() ?? '')
                  : (delimEls[0].textContent?.trim() ?? '')
                const repetition = repEls.length > 0 ? parseInt(repEls[0].textContent?.trim() ?? '1') || 1 : 1
                const inclusive = inclEls.length > 0 ? (inclEls[0].textContent?.trim() === 'true') : true
                if (charStyleId && delimiter) {
                  nested.push({ charStyleId, delimiter, repetition, inclusive })
                }
              }
            }
            if (nested.length > 0) {
              def.nestedStyles = nested
              console.log(`[IDML] Nested styles for ${id}:`, JSON.stringify(nested))
            }
          }
        }
        paraStyles.set(id, def)
      }

      const charEls = doc.getElementsByTagName('CharacterStyle')
      for (let i = 0; i < charEls.length; i++) {
        const el = charEls[i]
        const id = attr(el, 'Self')
        if (id) charStyles.set(id, parseStyleDef(el))
      }
    } catch { /* skip */ }
  }

  // Resolve BasedOn chains (max 10 depth)
  const resolveChain = (map: Map<string, StyleDef>, id: string, depth = 0): StyleDef => {
    if (depth > 10) return {}
    const style = map.get(id)
    if (!style) return {}
    if (!style.basedOn) return { ...style }
    const parent = resolveChain(map, style.basedOn, depth + 1)
    return { ...parent, ...pickDefined(style) }
  }

  // Resolve all paragraph styles
  for (const [id] of paraStyles) {
    paraStyles.set(id, resolveChain(paraStyles, id))
  }
  // Resolve all character styles
  for (const [id] of charStyles) {
    charStyles.set(id, resolveChain(charStyles, id))
  }

  console.log(`[IDML] Styles: ${paraStyles.size} paragraph, ${charStyles.size} character`)
  return { paraStyles, charStyles }
}

function pickDefined(obj: StyleDef): Partial<StyleDef> {
  const result: Partial<StyleDef> = {}
  if (obj.fontSize !== undefined) result.fontSize = obj.fontSize
  if (obj.fontFamily !== undefined) result.fontFamily = obj.fontFamily
  if (obj.fontStyle !== undefined) result.fontStyle = obj.fontStyle
  if (obj.fillColor !== undefined) result.fillColor = obj.fillColor
  if (obj.alignment !== undefined) result.alignment = obj.alignment
  if (obj.baselineShift !== undefined) result.baselineShift = obj.baselineShift
  if (obj.leading !== undefined) result.leading = obj.leading
  if (obj.autoLeading !== undefined) result.autoLeading = obj.autoLeading
  if (obj.horizontalScale !== undefined) result.horizontalScale = obj.horizontalScale
  if (obj.verticalScale !== undefined) result.verticalScale = obj.verticalScale
  if (obj.tracking !== undefined) result.tracking = obj.tracking
  if (obj.skew !== undefined) result.skew = obj.skew
  if (obj.strikeThru !== undefined) result.strikeThru = obj.strikeThru
  if (obj.grepStyles !== undefined) result.grepStyles = obj.grepStyles
  if (obj.nestedStyles !== undefined) result.nestedStyles = obj.nestedStyles
  return result
}

// ─── Stories ────────────────────────────────────────────────────────────────

function parseStory(
  storyXml: string,
  colorMap: Map<string, IdmlColor>,
  paraStyles: Map<string, StyleDef>,
  charStyles: Map<string, StyleDef>,
): IdmlParagraph[] {
  const doc = parseXml(storyXml)
  const paragraphs: IdmlParagraph[] = []

  const storyEls = doc.getElementsByTagName('Story')
  if (storyEls.length === 0) return paragraphs
  const storyEl = storyEls[0]

  const paraEls = directChildren(storyEl, 'ParagraphStyleRange')

  for (let p = 0; p < paraEls.length; p++) {
    const paraEl = paraEls[p]

    const paraStyleId = attr(paraEl, 'AppliedParagraphStyle')
    const paraStyleDef = paraStyles.get(paraStyleId) ?? {}
    const paraInline = parseStyleDef(paraEl)
    const paraDefaults: StyleDef = { ...paraStyleDef, ...pickDefined(paraInline) }

    const charEls = directChildren(paraEl, 'CharacterStyleRange')

    // Concatenate all CharacterStyleRanges into one paragraph text.
    // Track per-character style overrides from CSR-level formatting.
    let combinedText = ''
    let resolvedStyle: IdmlParagraph | null = null
    const charStylesMap: Record<number, CharStyleOverride> = {}

    for (let c = 0; c < charEls.length; c++) {
      const charEl = charEls[c]

      const charStyleId = attr(charEl, 'AppliedCharacterStyle')
      const charStyleDef = charStyles.get(charStyleId) ?? {}
      const charInline = parseStyleDef(charEl)

      let fontSize = charInline.fontSize ?? charStyleDef.fontSize ?? paraDefaults.fontSize ?? 12
      if (fontSize < 1) fontSize = 7

      const capitalization = charEl.getAttribute('Capitalization') ?? ''

      // Extract text from this CharacterStyleRange
      const textParts: string[] = []
      for (let n = 0; n < charEl.childNodes.length; n++) {
        const child = charEl.childNodes[n]
        if (child.nodeType === 1) {
          const tagName = (child as Element).tagName
          if (tagName === 'Content') {
            const t = child.textContent ?? ''
            const cleaned = t.replace(/[\ufeff\u200b\u200c\u200d]/g, '').replace(/\u2028/g, '\n')
            if (cleaned) textParts.push(capitalization === 'AllCaps' ? cleaned.toUpperCase() : cleaned)
          } else if (tagName === 'Br') {
            textParts.push('\n')
          }
        }
      }

      const text = textParts.join('')
      if (!text || fontSize < 0.5) continue

      const startIdx = combinedText.length
      combinedText += text

      // Build per-character style overrides from CSR-level formatting
      // Only record overrides when CSR style differs from paragraph defaults
      const csrFontSize = charInline.fontSize ?? charStyleDef.fontSize
      const csrBaselineShift = charInline.baselineShift ?? charStyleDef.baselineShift
      const csrFillColor = charInline.fillColor ?? charStyleDef.fillColor
      const csrFillIsInvisible = csrFillColor === 'Swatch/None' || csrFillColor === '$ID/None'
      const csrTracking = charInline.tracking ?? charStyleDef.tracking
      const csrSkew = charInline.skew ?? charStyleDef.skew
      const csrVerticalScale = charInline.verticalScale ?? charStyleDef.verticalScale
      const csrStrikeThru = charInline.strikeThru ?? charStyleDef.strikeThru ?? paraDefaults.strikeThru

      // Resolve font weight/style/family for this CSR
      const csrFontStyleRaw = charInline.fontStyle ?? charStyleDef.fontStyle ?? paraDefaults.fontStyle ?? 'Regular'
      const csrFontWeight = fontStyleToWeight(csrFontStyleRaw)
      const csrFontStyleVal = /italic|oblique/i.test(csrFontStyleRaw) ? 'italic' : 'normal'
      const csrFontFamily = (charInline.fontFamily ?? charStyleDef.fontFamily ?? paraDefaults.fontFamily ?? 'Arial')
        .replace(/\s+(Bold|Italic|Regular|Light|Medium|Black|Thin|ExtraBold|SemiBold|Heavy|Ultra).*$/i, '')
        .trim() || 'Arial'

      // Determine base style for comparison (will be set from first/largest CSR)
      const baseFontStyleRaw = paraDefaults.fontStyle ?? 'Regular'
      const baseFontWeight = fontStyleToWeight(baseFontStyleRaw)
      const baseFontStyleVal = /italic|oblique/i.test(baseFontStyleRaw) ? 'italic' : 'normal'
      const baseFontFamily = (paraDefaults.fontFamily ?? 'Arial')
        .replace(/\s+(Bold|Italic|Regular|Light|Medium|Black|Thin|ExtraBold|SemiBold|Heavy|Ultra).*$/i, '')
        .trim() || 'Arial'

      const hasFontDiff = csrFontWeight !== baseFontWeight || csrFontStyleVal !== baseFontStyleVal || csrFontFamily !== baseFontFamily
      const hasTrackingDiff = csrTracking !== undefined && csrTracking !== (paraDefaults.tracking ?? 0)
      const hasSkewDiff = csrSkew !== undefined && csrSkew !== (paraDefaults.skew ?? 0)
      const hasVScaleDiff = csrVerticalScale !== undefined && csrVerticalScale !== 100 && csrVerticalScale !== (paraDefaults.verticalScale ?? 100)
      const hasStrikeThru = csrStrikeThru === true

      if (csrFontSize || csrBaselineShift || (csrFillColor && csrFillColor !== paraDefaults.fillColor) || csrFillIsInvisible || hasFontDiff || hasTrackingDiff || hasSkewDiff || hasVScaleDiff || hasStrikeThru) {
        for (let i = 0; i < text.length; i++) {
          const override: CharStyleOverride = {}
          if (csrFontSize && csrFontSize !== paraDefaults.fontSize) override.fontSize = csrFontSize
          if (csrBaselineShift) override.deltaY = -csrBaselineShift // InDesign positive=up → Fabric negative=up
          if (csrFillIsInvisible) {
            override.invisible = true
          } else if (csrFillColor && csrFillColor !== paraDefaults.fillColor) {
            const c = colorMap.get(csrFillColor)
            if (c && c.a > 0) {
              const hex = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0')
              override.fill = `#${hex(c.r)}${hex(c.g)}${hex(c.b)}`
            }
          }
          if (csrFontWeight !== baseFontWeight) override.fontWeight = csrFontWeight
          if (csrFontStyleVal !== baseFontStyleVal) override.fontStyle = csrFontStyleVal
          if (csrFontFamily !== baseFontFamily) override.fontFamily = csrFontFamily
          if (hasTrackingDiff) override.tracking = csrTracking
          if (hasSkewDiff) override.skewX = csrSkew
          if (hasVScaleDiff) override.verticalScale = csrVerticalScale
          if (hasStrikeThru) override.linethrough = true
          if (Object.keys(override).length > 0) charStylesMap[startIdx + i] = override
        }
      }

      // Capture style: use paragraph defaults for base properties (font, weight, color, etc.)
      // Only take fontSize from the largest CSR (for correct textbox sizing).
      // This ensures per-char overrides (compared against paraDefaults) are consistent
      // with the textbox base style.
      if (!resolvedStyle || fontSize > resolvedStyle.fontSize) {
        // Font properties from paragraph defaults (NOT from CSR-specific char styles)
        const fontFamily = (paraDefaults.fontFamily ?? 'Arial')
          .replace(/\s+(Bold|Italic|Regular|Light|Medium|Black|Thin|ExtraBold|SemiBold|Heavy|Ultra).*$/i, '')
          .trim() || 'Arial'

        const fontStyleRaw = paraDefaults.fontStyle ?? 'Regular'
        const fontWeight = fontStyleToWeight(fontStyleRaw)
        const fontStyle = /italic|oblique/i.test(fontStyleRaw) ? 'italic' : 'normal'

        const colorRef = paraDefaults.fillColor ?? 'Color/Black'
        const color = colorMap.get(colorRef) ?? { r: 0, g: 0, b: 0, a: 1 }
        const alignment = paraDefaults.alignment ?? 'left'

        // Leading (line height) — cascade: CSR inline → CharStyle → PSR inline → ParaStyle
        const leading = charInline.leading ?? charStyleDef.leading ?? paraDefaults.leading ?? undefined
        // AutoLeading — cascade: PSR inline → ParaStyle (paragraph-level attribute)
        const autoLeading = paraDefaults.autoLeading ?? charStyleDef.autoLeading ?? undefined
        // Tracking, HorizontalScale, VerticalScale: use paragraph defaults for textbox base
        const paraTracking = paraDefaults.tracking ?? undefined
        const paraHScale = paraDefaults.horizontalScale ?? undefined
        const paraVScale = paraDefaults.verticalScale ?? undefined
        resolvedStyle = {
          text: '', fontSize, fontFamily, fontWeight, fontStyle, color, alignment,
          lineHeight: leading && !isNaN(leading) ? leading : undefined,
          autoLeading: autoLeading && !isNaN(autoLeading) ? autoLeading : undefined,
          horizontalScale: paraHScale && paraHScale !== 100 ? paraHScale : undefined,
          verticalScale: paraVScale && paraVScale !== 100 ? paraVScale : undefined,
          tracking: paraTracking !== undefined && paraTracking !== 0 ? paraTracking : undefined,
        }
      }
    }

    if (!combinedText.trim() || !resolvedStyle) continue

    // Apply Nested Styles from paragraph style definition
    // Nested styles auto-apply character styles based on text delimiters
    // They only apply to characters that don't already have explicit CharacterStyleRange overrides
    if (paraDefaults.nestedStyles && paraDefaults.nestedStyles.length > 0) try {
      // Track which char positions already have explicit CharStyle from CharacterStyleRange
      // (we only apply nested styles to positions with [No character style])
      const hasExplicitStyle = new Set<number>()
      // Rebuild: check which CSRs had a named style
      {
        let pos = 0
        for (let c = 0; c < charEls.length; c++) {
          const charEl = charEls[c]
          const csId = attr(charEl, 'AppliedCharacterStyle')
          const isNoStyle = !csId || csId.includes('[No character style]')
          const textParts: string[] = []
          for (let n = 0; n < charEl.childNodes.length; n++) {
            const child = charEl.childNodes[n]
            if (child.nodeType === 1) {
              const tagName = (child as Element).tagName
              if (tagName === 'Content') {
                const t = child.textContent ?? ''
                const cleaned = t.replace(/[\ufeff\u200b\u200c\u200d]/g, '').replace(/\u2028/g, '\n')
                if (cleaned) textParts.push(cleaned)
              } else if (tagName === 'Br') {
                textParts.push('\n')
              }
            }
          }
          const text = textParts.join('')
          if (!isNoStyle) {
            for (let i = 0; i < text.length; i++) hasExplicitStyle.add(pos + i)
          }
          pos += text.length
        }
      }

      // Apply nested style rules sequentially
      let cursor = 0
      for (const rule of paraDefaults.nestedStyles) {
        if (cursor >= combinedText.length) break

        const resolvedCharStyle = charStyles.get(rule.charStyleId) ?? {}
        // Find the delimiter position
        let delimEnd = combinedText.length  // default: rest of text

        if (rule.delimiter === 'AnyWord') {
          // AnyWord: find the end of Nth word (word = sequence of non-whitespace)
          let wordCount = 0
          let i = cursor
          while (i < combinedText.length && wordCount < rule.repetition) {
            // Skip leading whitespace
            while (i < combinedText.length && /\s/.test(combinedText[i])) i++
            if (i >= combinedText.length) break
            // Find end of word
            while (i < combinedText.length && !/\s/.test(combinedText[i])) i++
            wordCount++
          }
          delimEnd = rule.inclusive ? i : i
        } else if (rule.delimiter === 'AnyCharacter') {
          delimEnd = Math.min(cursor + rule.repetition, combinedText.length)
        } else if (rule.delimiter === 'Sentence') {
          let sentCount = 0
          let i = cursor
          while (i < combinedText.length && sentCount < rule.repetition) {
            if (/[.!?]/.test(combinedText[i])) sentCount++
            i++
          }
          delimEnd = i
        } else {
          // Specific string delimiter (e.g. "D", "T", ",")
          let found = 0
          let searchFrom = cursor
          while (found < rule.repetition && searchFrom < combinedText.length) {
            const idx = combinedText.indexOf(rule.delimiter, searchFrom)
            if (idx === -1) break
            found++
            if (found >= rule.repetition) {
              // Found the Nth occurrence
              if (rule.inclusive) {
                delimEnd = idx + rule.delimiter.length
              } else {
                delimEnd = idx
              }
            }
            searchFrom = idx + rule.delimiter.length
          }
          if (found < rule.repetition) {
            delimEnd = combinedText.length
          }
        }

        // Apply the character style to chars from cursor to delimEnd (skipping those with explicit styles)
        for (let i = cursor; i < delimEnd; i++) {
          if (hasExplicitStyle.has(i)) continue  // don't override explicit CharacterStyleRange
          if (combinedText[i] === '\n') continue  // skip line breaks

          const existing = charStylesMap[i] ?? {}

          // Apply character style properties
          if (resolvedCharStyle.fontSize && resolvedCharStyle.fontSize !== paraDefaults.fontSize) {
            existing.fontSize = resolvedCharStyle.fontSize
          }
          if (resolvedCharStyle.baselineShift) {
            existing.deltaY = -resolvedCharStyle.baselineShift
          }
          if (resolvedCharStyle.fillColor && resolvedCharStyle.fillColor !== paraDefaults.fillColor) {
            if (resolvedCharStyle.fillColor === 'Swatch/None' || resolvedCharStyle.fillColor === '$ID/None') {
              existing.invisible = true
            } else {
              const c = colorMap.get(resolvedCharStyle.fillColor)
              if (c && c.a > 0) {
                const hex = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0')
                existing.fill = `#${hex(c.r)}${hex(c.g)}${hex(c.b)}`
              }
            }
          }
          if (resolvedCharStyle.fontStyle) {
            const nWeight = fontStyleToWeight(resolvedCharStyle.fontStyle)
            const nFStyle = /italic|oblique/i.test(resolvedCharStyle.fontStyle) ? 'italic' : 'normal'
            const baseFontStyleRaw = paraDefaults.fontStyle ?? 'Regular'
            if (nWeight !== fontStyleToWeight(baseFontStyleRaw)) existing.fontWeight = nWeight
            if (nFStyle !== (/italic|oblique/i.test(baseFontStyleRaw) ? 'italic' : 'normal')) existing.fontStyle = nFStyle
          }
          if (resolvedCharStyle.fontFamily) {
            const nFamily = resolvedCharStyle.fontFamily
              .replace(/\s+(Bold|Italic|Regular|Light|Medium|Black|Thin|ExtraBold|SemiBold|Heavy|Ultra).*$/i, '')
              .trim() || 'Arial'
            const baseFamily = (paraDefaults.fontFamily ?? 'Arial')
              .replace(/\s+(Bold|Italic|Regular|Light|Medium|Black|Thin|ExtraBold|SemiBold|Heavy|Ultra).*$/i, '')
              .trim() || 'Arial'
            if (nFamily !== baseFamily) existing.fontFamily = nFamily
          }
          if (resolvedCharStyle.tracking !== undefined) {
            existing.tracking = resolvedCharStyle.tracking
          }
          if (resolvedCharStyle.skew) existing.skewX = resolvedCharStyle.skew
          if (resolvedCharStyle.verticalScale && resolvedCharStyle.verticalScale !== 100) {
            existing.verticalScale = resolvedCharStyle.verticalScale
          }
          if (resolvedCharStyle.strikeThru) existing.linethrough = true

          if (Object.keys(existing).length > 0) charStylesMap[i] = existing
        }

        cursor = delimEnd
        console.log(`[IDML Nested] Rule "${rule.charStyleId}" delim="${rule.delimiter}" → chars ${cursor > delimEnd ? delimEnd : cursor - (delimEnd - cursor)}..${delimEnd} of "${combinedText.slice(0, 30)}"`)
      }
    } catch (nestedErr) {
      console.warn('[IDML] Nested styles error:', nestedErr)
    }

    // Apply GREP styles from paragraph style definition
    // GREP styles apply character formatting via regex pattern matching on the combined text
    if (paraDefaults.grepStyles) {
      for (const grep of paraDefaults.grepStyles) {
        try {
          const regex = new RegExp(grep.pattern, 'g')
          const resolvedCharStyle = charStyles.get(grep.charStyleId) ?? {}
          let match
          while ((match = regex.exec(combinedText)) !== null) {
            for (let i = 0; i < match[0].length; i++) {
              const idx = match.index + i
              const existing = charStylesMap[idx] ?? {}
              // Check if this GREP style makes the character invisible
              if (resolvedCharStyle.fillColor === 'Swatch/None' || resolvedCharStyle.fillColor === '$ID/None') {
                existing.invisible = true
              }
              if (resolvedCharStyle.fontSize) existing.fontSize = resolvedCharStyle.fontSize
              if (resolvedCharStyle.baselineShift) existing.deltaY = -resolvedCharStyle.baselineShift
              if (resolvedCharStyle.fontStyle) {
                const grepWeight = fontStyleToWeight(resolvedCharStyle.fontStyle)
                const grepFontStyle = /italic|oblique/i.test(resolvedCharStyle.fontStyle) ? 'italic' : 'normal'
                if (grepWeight !== resolvedStyle!.fontWeight) existing.fontWeight = grepWeight
                if (grepFontStyle !== resolvedStyle!.fontStyle) existing.fontStyle = grepFontStyle
              }
              if (resolvedCharStyle.fontFamily) {
                const grepFamily = resolvedCharStyle.fontFamily
                  .replace(/\s+(Bold|Italic|Regular|Light|Medium|Black|Thin|ExtraBold|SemiBold|Heavy|Ultra).*$/i, '')
                  .trim() || 'Arial'
                if (grepFamily !== resolvedStyle!.fontFamily) existing.fontFamily = grepFamily
              }
              if (resolvedCharStyle.fillColor && resolvedCharStyle.fillColor !== 'Swatch/None' && resolvedCharStyle.fillColor !== '$ID/None') {
                const c = colorMap.get(resolvedCharStyle.fillColor)
                if (c && c.a > 0) {
                  const hex = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0')
                  existing.fill = `#${hex(c.r)}${hex(c.g)}${hex(c.b)}`
                }
              }
              if (resolvedCharStyle.skew) existing.skewX = resolvedCharStyle.skew
              if (resolvedCharStyle.verticalScale && resolvedCharStyle.verticalScale !== 100) existing.verticalScale = resolvedCharStyle.verticalScale
              if (resolvedCharStyle.strikeThru) existing.linethrough = true
              // Only propagate tracking from GREP if character is not invisible
              if (!existing.invisible && resolvedCharStyle.tracking !== undefined) existing.tracking = resolvedCharStyle.tracking
              charStylesMap[idx] = existing
            }
            // Prevent infinite loop on zero-length matches
            if (match[0].length === 0) regex.lastIndex++
          }
        } catch { /* invalid regex pattern — skip */ }
      }
    }

    const hasCharStyles = Object.keys(charStylesMap).length > 0
    paragraphs.push({ ...resolvedStyle, text: combinedText, ...(hasCharStyles ? { charStyles: charStylesMap } : {}) })
  }
  return paragraphs
}

/** Map InDesign FontStyle to CSS font-weight value matching FontFace descriptors */
function fontStyleToWeight(raw: string): string {
  const r = raw.toLowerCase()
  if (/thin|hairline/.test(r)) return '100'
  if (/light/.test(r)) return '300'
  if (/medium/.test(r)) return '500'
  if (/semibold|demi/.test(r)) return '600'
  if (/extra\s*bold/.test(r)) return '800'
  if (/black|heavy|ultra/.test(r)) return '900'
  if (/bold/.test(r)) return '700'
  return '400'
}

function alignValue(val: string): IdmlParagraph['alignment'] {
  if (/center/i.test(val)) return 'center'
  if (/right/i.test(val)) return 'right'
  if (/full|justify/i.test(val)) return 'justify'
  return 'left'
}

// ─── Main parser ─────────────────────────────────────────────────────────────

const ITEM_TAGS = new Set(['TextFrame', 'Rectangle', 'Oval', 'GraphicLine', 'Polygon'])

/** Recursively emit IdmlObjects for anchored TextFrames inside a story */
function processAnchoredFrames(
  parentWorldTf: Mat,
  parentBounds: Bounds,
  parentCanvasCx: number,
  parentCanvasCy: number,
  storyId: string,
  pageOffsetX: number,
  pageOffsetY: number,
  colorMap: Map<string, IdmlColor>,
  storiesMap: Map<string, IdmlParagraph[]>,
  objStyleMap: Map<string, ObjectStyleDef>,
  anchoredFrameMap: Map<string, AnchoredFrameRef[]>,
  results: IdmlObject[],
  depth = 0,
): void {
  if (depth > 5) return
  const anchored = anchoredFrameMap.get(storyId)
  if (!anchored) return

  // Use the provided parent canvas center (already corrected for anchored positioning)
  const parentCx = parentCanvasCx
  const parentCy = parentCanvasCy
  const parentW = parentBounds.right - parentBounds.left
  const parentH = parentBounds.bottom - parentBounds.top
  const { scaleX: parentSx, scaleY: parentSy, angle: parentAngle } = decompose(parentWorldTf)

  for (const af of anchored) {
    // Compose rotation/scale from parent + child transforms
    const worldTf = mulMat(parentWorldTf, af.itemTransform)
    const { scaleX, scaleY, angle } = decompose(worldTf)
    const localW = af.bounds.right - af.bounds.left
    const localH = af.bounds.bottom - af.bounds.top
    const displayW = localW * scaleX
    const displayH = localH * scaleY

    // Position: for inline anchored frames, use parent center
    // For custom 'Anchored' objects, compute relative to parent
    let cx: number
    let cy: number

    if (af.anchoredPosition === 'Anchored') {
      // Custom anchored: position relative to parent frame
      const parentRad = parentAngle * Math.PI / 180
      const cosA = Math.cos(parentRad)
      const sinA = Math.sin(parentRad)
      const pDispW = parentW * parentSx
      const pDispH = parentH * parentSy

      let offsetX = 0
      let offsetY = 0

      if (af.horizontalAlignment === 'RightAlign') {
        offsetX = (pDispW - displayW) / 2
      } else if (af.horizontalAlignment === 'LeftAlign') {
        offsetX = -(pDispW - displayW) / 2
      }

      if (af.verticalAlignment === 'CenterAlign') {
        offsetY = 0
      } else if (af.verticalAlignment === 'BottomAlign') {
        offsetY = (pDispH - displayH) / 2
      } else if (af.verticalAlignment === 'TopAlign') {
        offsetY = -(pDispH - displayH) / 2
      }

      offsetY += (af.anchorYoffset ?? 0) * scaleY

      // Rotate offsets by parent angle
      const rotX = offsetX * cosA - offsetY * sinA
      const rotY = offsetX * sinA + offsetY * cosA

      cx = parentCx + rotX
      cy = parentCy + rotY
    } else {
      // Inline anchored: position at parent center (text flow approximation)
      cx = parentCx
      cy = parentCy
    }

    // Resolve colors from inline or ObjectStyle
    const objStyle = af.appliedObjectStyle ? objStyleMap.get(af.appliedObjectStyle) : undefined
    const fillRef = af.fillColor || objStyle?.fillColor || '$ID/None'
    const strokeRef = af.strokeColor || objStyle?.strokeColor || '$ID/None'
    const fill = colorMap.get(fillRef) ?? null
    const stroke = colorMap.get(strokeRef) ?? null
    const strokeWeight = af.strokeWeight ?? objStyle?.strokeWeight ?? 0

    let paragraphs = storiesMap.get(af.parentStory) ?? []

    // For auto-sized frames (WidthOnly), InDesign shrinks width to fit content.
    // In Fabric.js we use fixed width, so force center alignment to keep text centered.
    if (af.autoSizingType && /width/i.test(af.autoSizingType) && paragraphs.length > 0) {
      paragraphs = paragraphs.map(p => ({ ...p, alignment: 'center' as const }))
    }

    const obj: IdmlObject = {
      id: af.self,
      type: 'TextFrame',
      cx, cy,
      idmlPageOffsetX: pageOffsetX,
      idmlPageOffsetY: pageOffsetY,
      width: localW, height: localH,
      scaleX, scaleY,
      rotation: Math.round(angle * 10) / 10,
      fill, stroke, strokeWeight,
      opacity: 1,
      storyId: af.parentStory,
      paragraphs,
      isAnchored: true,
    }

    if (paragraphs.length === 0 && !fill) continue

    results.push(obj)
    console.log(`[IDML] Anchored TextFrame ${af.self}: story=${af.parentStory} paras=${paragraphs.length} center=(${cx.toFixed(0)},${cy.toFixed(0)}) ${(displayW).toFixed(0)}x${(displayH).toFixed(0)} anchored=${af.anchoredPosition ?? 'inline'}`)

    // Recursively process anchored frames — pass the CORRECTED cx/cy as parent center
    processAnchoredFrames(worldTf, af.bounds, cx, cy, af.parentStory, pageOffsetX, pageOffsetY, colorMap, storiesMap, objStyleMap, anchoredFrameMap, results, depth + 1)
  }
}

/** Walk spread/group children in document order (= InDesign z-order) */
function walkElementsInOrder(
  parent: Element,
  pageOffsetX: number,
  pageOffsetY: number,
  colorMap: Map<string, IdmlColor>,
  storiesMap: Map<string, IdmlParagraph[]>,
  results: IdmlObject[],
  objStyleMap: Map<string, ObjectStyleDef>,
  anchoredFrameMap: Map<string, AnchoredFrameRef[]>,
) {
  for (let i = 0; i < parent.childNodes.length; i++) {
    const child = parent.childNodes[i]
    if (child.nodeType !== 1) continue
    const el = child as Element
    const tag = el.tagName

    if (tag === 'Group') {
      walkElementsInOrder(el, pageOffsetX, pageOffsetY, colorMap, storiesMap, results, objStyleMap, anchoredFrameMap)
    } else if (ITEM_TAGS.has(tag)) {
      const obj = parseElement(el, tag as IdmlObject['type'], pageOffsetX, pageOffsetY, colorMap, storiesMap, objStyleMap)
      if (obj) {
        results.push(obj)
      }
      // Always process anchored TextFrames for TextFrame elements
      // Even empty containers (no text, no fill) or TextFrames converted to Polygon
      // must propagate anchored frames (e.g. price TextFrame inside arrow story)
      if (tag === 'TextFrame') {
        const storyId = attr(el, 'ParentStory')
        if (storyId && storyId !== 'n') {
          const worldTf = computeWorldTransform(el)
          const elBounds = parseBounds(el)
          if (elBounds) {
            // Compute the parent TextFrame's canvas center for anchored frame positioning
            const elLocalCx = (elBounds.bounds.left + elBounds.bounds.right) / 2
            const elLocalCy = (elBounds.bounds.top + elBounds.bounds.bottom) / 2
            const elCenter = tfPoint(elLocalCx, elLocalCy, worldTf)
            const elCanvasCx = elCenter.x - pageOffsetX
            const elCanvasCy = elCenter.y - pageOffsetY
            processAnchoredFrames(worldTf, elBounds.bounds, elCanvasCx, elCanvasCy, storyId, pageOffsetX, pageOffsetY, colorMap, storiesMap, objStyleMap, anchoredFrameMap, results)
          }
        }
      }
    }
  }
}

export function parseIdml(
  spreads: Record<string, string>,
  stories: Record<string, string>,
  resources: Record<string, string>,
  _designMap: string,
  masterSpreads: Record<string, string> = {},
): IdmlDocument {
  // Page size from Preferences
  let pageWidth = 283
  let pageHeight = 283
  for (const [, xml] of Object.entries(resources)) {
    if (!xml.includes('DocumentPreference')) continue
    try {
      const doc = parseXml(xml)
      const els = doc.getElementsByTagName('DocumentPreference')
      if (els.length > 0) {
        pageWidth = parseFloat(els[0].getAttribute('PageWidth') ?? '283') || 283
        pageHeight = parseFloat(els[0].getAttribute('PageHeight') ?? '283') || 283
        break
      }
    } catch { /* skip */ }
  }

  const colorMap = buildColorMap(resources)
  const { paraStyles, charStyles } = buildStyleMaps(resources)
  const objStyleMap = buildObjectStyleMap(resources)
  console.log(`[IDML] Colors: ${colorMap.size}, ObjStyles: ${objStyleMap.size}, page: ${pageWidth.toFixed(1)}×${pageHeight.toFixed(1)} pt`)

  // Build anchored frame map: storyId → anchored TextFrames within that story
  const anchoredFrameMap = new Map<string, AnchoredFrameRef[]>()
  for (const [, xml] of Object.entries(stories)) {
    try {
      const doc = parseXml(xml)
      const storyEls = doc.getElementsByTagName('Story')
      if (storyEls.length === 0) continue
      const storyId = storyEls[0].getAttribute('Self') ?? ''
      if (!storyId) continue
      const anchored = extractAnchoredFrames(xml)
      if (anchored.length > 0) {
        anchoredFrameMap.set(storyId, anchored)
        console.log(`[IDML] Story ${storyId} has ${anchored.length} anchored frame(s): ${anchored.map(a => `${a.self}→${a.parentStory}`).join(', ')}`)
      }
    } catch { /* skip */ }
  }

  // Parse stories
  const storiesMap = new Map<string, IdmlParagraph[]>()
  for (const [path, xml] of Object.entries(stories)) {
    try {
      const doc = parseXml(xml)
      const storyEls = doc.getElementsByTagName('Story')
      if (storyEls.length === 0) continue
      const storyId = storyEls[0].getAttribute('Self') ?? ''
      if (!storyId) continue
      const paras = parseStory(xml, colorMap, paraStyles, charStyles)
      storiesMap.set(storyId, paras)
      const preview = paras.map(p => p.text).join(' ').slice(0, 40)
      console.log(`[IDML] Story ${storyId}: ${paras.length} para(s) "${preview}"`)
    } catch (err) {
      console.error(`[IDML] Error story ${path}:`, err)
    }
  }

  // Parse spreads
  const allObjects: IdmlObject[] = []
  let spreadCount = 0

  for (const [, spreadXml] of Object.entries(spreads)) {
    spreadCount++
    const doc = parseXml(spreadXml)

    const pages = doc.getElementsByTagName('Page')
    const { offsetX: pageOffsetX, offsetY: pageOffsetY } = selectPageOffset(pages)
    console.log(`[IDML] Spread pages: ${pages.length}, pageOffset=(${pageOffsetX.toFixed(1)}, ${pageOffsetY.toFixed(1)})`)

    // Walk elements in document order (= InDesign z-order, back to front)
    const spreadEl = doc.getElementsByTagName('Spread')[0]
    if (spreadEl) {
      walkElementsInOrder(spreadEl, pageOffsetX, pageOffsetY, colorMap, storiesMap, allObjects, objStyleMap, anchoredFrameMap)
    }
  }

  // Parse MasterSpreads — their objects appear on every page (template background)
  const masterCount = Object.keys(masterSpreads).length
  if (masterCount > 0) {
    console.log(`[IDML] Parsing ${masterCount} MasterSpread(s)...`)
    for (const [, masterXml] of Object.entries(masterSpreads)) {
      const doc = parseXml(masterXml)

      const pages = doc.getElementsByTagName('Page')
      const { offsetX: pageOffsetX, offsetY: pageOffsetY } = selectPageOffset(pages)
      console.log(`[IDML] MasterSpread page offset: (${pageOffsetX.toFixed(1)}, ${pageOffsetY.toFixed(1)})`)

      const masterSpreadEl = doc.getElementsByTagName('MasterSpread')[0]
      if (masterSpreadEl) {
        walkElementsInOrder(masterSpreadEl, pageOffsetX, pageOffsetY, colorMap, storiesMap, allObjects, objStyleMap, anchoredFrameMap)
      }
    }
  }

  console.log(`[IDML] Total: ${allObjects.length} objects (${spreadCount} spread(s) + ${masterCount} master(s))`)

  // Compute actual content bounding box for diagnostics
  if (allObjects.length > 0) {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
    for (const obj of allObjects) {
      // Account for rotation when computing visual bounding box
      const w = obj.width * Math.abs(obj.scaleX)
      const h = obj.height * Math.abs(obj.scaleY)
      const rad = (obj.rotation ?? 0) * Math.PI / 180
      const cosR = Math.abs(Math.cos(rad))
      const sinR = Math.abs(Math.sin(rad))
      const hw = (w * cosR + h * sinR) / 2
      const hh = (w * sinR + h * cosR) / 2
      minX = Math.min(minX, obj.cx - hw)
      minY = Math.min(minY, obj.cy - hh)
      maxX = Math.max(maxX, obj.cx + hw)
      maxY = Math.max(maxY, obj.cy + hh)
    }
    const contentW = maxX - minX
    const contentH = maxY - minY
    console.log(`[IDML] Content bbox: (${minX.toFixed(1)}, ${minY.toFixed(1)}) → (${maxX.toFixed(1)}, ${maxY.toFixed(1)}) = ${contentW.toFixed(1)}×${contentH.toFixed(1)}`)
    console.log(`[IDML] DocumentPreference page: ${pageWidth.toFixed(1)}×${pageHeight.toFixed(1)}`)

    // Page offset already positions objects in page-relative coordinates.
    // Do NOT re-center content — it would displace elements when the design
    // is asymmetric or when images extend beyond the frame (clipped in InDesign).
  }

  return { pageWidth, pageHeight, objects: allObjects, spreadCount }
}

function parseElement(
  el: Element,
  type: IdmlObject['type'],
  pageOffsetX: number,
  pageOffsetY: number,
  colorMap: Map<string, IdmlColor>,
  storiesMap: Map<string, IdmlParagraph[]>,
  objStyleMap: Map<string, ObjectStyleDef> = new Map(),
): IdmlObject | null {
  const parsed = parseBounds(el)
  if (!parsed) {
    if (type === 'TextFrame') {
      const storyId = attr(el, 'ParentStory')
      const selfId = attr(el, 'Self')
      console.warn(`[IDML] TextFrame ${selfId} story=${storyId} → no bounds, skipped`)
    }
    return null
  }

  const { bounds, anchors } = parsed
  const localW = bounds.right - bounds.left
  const localH = bounds.bottom - bounds.top
  if (localW < 0.5 || localH < 0.5) return null

  // Compose accumulated transform (element + parent groups)
  const tf = computeWorldTransform(el)

  // Transform local center to page coordinates
  const localCx = (bounds.left + bounds.right) / 2
  const localCy = (bounds.top + bounds.bottom) / 2
  const center = tfPoint(localCx, localCy, tf)
  const cx = center.x - pageOffsetX
  const cy = center.y - pageOffsetY

  const selfId = attr(el, 'Self') || '?'
  const parentTag = (el.parentNode as Element)?.tagName ?? ''
  if (parentTag === 'Group') {
    console.log(`[IDML] parseElement GROUPED ${type} ${selfId}: localCenter=(${localCx.toFixed(1)},${localCy.toFixed(1)}) spreadCenter=(${center.x.toFixed(1)},${center.y.toFixed(1)}) pageOffset=(${pageOffsetX.toFixed(1)},${pageOffsetY.toFixed(1)}) → canvas=(${cx.toFixed(1)},${cy.toFixed(1)})`)
  }

  const { scaleX, scaleY, angle } = decompose(tf)

  // Colors — inline attributes override ObjectStyle
  const appliedObjStyle = attr(el, 'AppliedObjectStyle')
  const objStyle = objStyleMap.get(appliedObjStyle)
  const fillRef = attr(el, 'FillColor') || objStyle?.fillColor || '$ID/None'
  const strokeRef = attr(el, 'StrokeColor') || objStyle?.strokeColor || '$ID/None'
  const fill = colorMap.get(fillRef) ?? null
  const stroke = colorMap.get(strokeRef) ?? null
  const strokeWeight = parseFloat(attr(el, 'StrokeWeight', '0')) || objStyle?.strokeWeight || 0
  const strokeAlignRaw = attr(el, 'StrokeAlignment') || objStyle?.strokeAlignment
  const strokeAlignment: IdmlObject['strokeAlignment'] =
    strokeAlignRaw === 'OutsideAlignment' ? 'outside'
    : strokeAlignRaw === 'InsideAlignment' ? 'inside'
    : 'center'
  const opacity = parseFloat(attr(el, 'Opacity', '100')) / 100

  // Shadow — from inline TransparencySetting or ObjectStyle
  let shadow: IdmlShadow | null = null
  const inlineDS = el.getElementsByTagName('DropShadowSetting')
  if (inlineDS.length > 0) {
    const ds = inlineDS[0]
    const dsOpacity = parseFloat(ds.getAttribute('Opacity') ?? '0')
    const dsMode = ds.getAttribute('Mode') ?? ''
    if (dsMode === 'Drop' && dsOpacity > 0) {
      // InDesign defaults Size (blur) to 5pt when not specified in XML
      shadow = {
        opacity: dsOpacity,
        offsetX: parseFloat(ds.getAttribute('XOffset') ?? '0'),
        offsetY: parseFloat(ds.getAttribute('YOffset') ?? '0'),
        blur: parseFloat(ds.getAttribute('Size') ?? '5'),
      }
    }
  } else if (objStyle?.shadow) {
    shadow = objStyle.shadow
  }

  const id = attr(el, 'Self') || `item_${Math.random().toString(36).slice(2)}`

  // Image/graphic child — InDesign uses different elements depending on file type:
  // <Image> for raster (JPG, PNG, TIF, PSD...), <EPS>, <PDF>, <WMF>, <ImportedPage>
  // All share <Link> child with LinkResourceURI pointing to the placed file.
  const GRAPHIC_TAGS = ['Image', 'EPS', 'PDF', 'WMF', 'ImportedPage']
  let hasImage = false
  let imagePath: string | undefined
  let imageScaleX: number | undefined
  let imageScaleY: number | undefined
  let imageOffsetX: number | undefined
  let imageOffsetY: number | undefined
  let imageWidth: number | undefined
  let imageHeight: number | undefined

  let graphicEl: Element | null = null
  for (const tag of GRAPHIC_TAGS) {
    const els = el.getElementsByTagName(tag)
    if (els.length > 0) {
      graphicEl = els[0]
      break
    }
  }
  // Fallback: look for any child that has a <Link> descendant
  if (!graphicEl) {
    const allLinks = el.getElementsByTagName('Link')
    if (allLinks.length > 0 && allLinks[0].parentElement !== el) {
      graphicEl = allLinks[0].parentElement
    }
  }

  if (graphicEl) {
    hasImage = true
    const links = graphicEl.getElementsByTagName('Link')
    if (links.length > 0) {
      const uri = links[0].getAttribute('LinkResourceURI') ?? ''
      imagePath = decodeURIComponent(uri.replace(/^file:/, '').split('/').pop() ?? '')
    }
    // Extract graphic element's own ItemTransform and GraphicBounds for positioning within frame
    const imgTfStr = graphicEl.getAttribute('ItemTransform')
    if (imgTfStr) {
      const imgTf = imgTfStr.split(/\s+/).map(Number)
      if (imgTf.length === 6 && imgTf.every(n => !isNaN(n))) {
        imageScaleX = Math.sqrt(imgTf[0] * imgTf[0] + imgTf[1] * imgTf[1])
        imageScaleY = Math.sqrt(imgTf[2] * imgTf[2] + imgTf[3] * imgTf[3])
        // tx, ty = image offset in frame's local coordinate system
        imageOffsetX = imgTf[4]
        imageOffsetY = imgTf[5]
      }
    }
    // GraphicBounds can be either an attribute ("top left bottom right") or a
    // <Properties><GraphicBounds Left="..." Top="..." Right="..." Bottom="..."/> child.
    const imgGbAttr = graphicEl.getAttribute('GraphicBounds')
    if (imgGbAttr) {
      const gb = imgGbAttr.split(/\s+/).map(Number)
      if (gb.length === 4) {
        imageWidth = gb[3] - gb[1]   // right - left
        imageHeight = gb[2] - gb[0]  // bottom - top
      }
    } else {
      // Try <Properties><GraphicBounds .../> child element
      const propsEls = directChildren(graphicEl, 'Properties')
      if (propsEls.length > 0) {
        const gbEls = propsEls[0].getElementsByTagName('GraphicBounds')
        if (gbEls.length > 0) {
          const gbEl = gbEls[0]
          const l = parseFloat(gbEl.getAttribute('Left') ?? '0')
          const t = parseFloat(gbEl.getAttribute('Top') ?? '0')
          const r = parseFloat(gbEl.getAttribute('Right') ?? '0')
          const b = parseFloat(gbEl.getAttribute('Bottom') ?? '0')
          if (r > l && b > t) {
            imageWidth = r - l
            imageHeight = b - t
          }
        }
      }
    }
  }

  // Corner radius for Rectangles AND TextFrames (both can have rounded corners in IDML)
  let cornerRadius: number | undefined
  if (type === 'Rectangle' || type === 'TextFrame') {
    // Check CornerOption — only apply if at least one corner is "RoundedCorner"
    const cornerOptions = [
      attr(el, 'TopLeftCornerOption'),
      attr(el, 'TopRightCornerOption'),
      attr(el, 'BottomLeftCornerOption'),
      attr(el, 'BottomRightCornerOption'),
    ]
    const hasRoundedCorner = cornerOptions.some(o => o === 'RoundedCorner')
    // Some IDML files don't specify CornerOption but have CornerRadius > 0
    const radii = [
      parseFloat(attr(el, 'TopLeftCornerRadius', '0')),
      parseFloat(attr(el, 'TopRightCornerRadius', '0')),
      parseFloat(attr(el, 'BottomLeftCornerRadius', '0')),
      parseFloat(attr(el, 'BottomRightCornerRadius', '0')),
    ].map(r => isNaN(r) ? 0 : r)
    const maxRadius = Math.max(...radii)
    if (maxRadius > 0 && (hasRoundedCorner || cornerOptions.every(o => !o))) {
      cornerRadius = maxRadius
    }
    // Fallback to ObjectStyle corner radius — only for Rectangles (not TextFrames)
    // Only apply when CornerOption is explicitly "RoundedCorner" (not "None" which is InDesign default)
    if (!cornerRadius && type === 'Rectangle' && objStyle?.cornerRadius && objStyle.cornerOption === 'RoundedCorner') {
      cornerRadius = objStyle.cornerRadius
    }
  }

  const base: IdmlObject = {
    id, type, cx, cy,
    idmlPageOffsetX: pageOffsetX,
    idmlPageOffsetY: pageOffsetY,
    width: localW, height: localH,
    scaleX, scaleY,
    rotation: Math.round(angle * 10) / 10,
    fill, stroke, strokeWeight, strokeAlignment, opacity,
    shadow,
    hasImage, imagePath,
    imageScaleX, imageScaleY, imageOffsetX, imageOffsetY, imageWidth, imageHeight,
    cornerRadius,
    localCenterX: localCx,
    localCenterY: localCy,
  }

  // Polygon: bake ItemTransform (rotation + scale + shear) into path coords
  if (type === 'Polygon') {
    const pathPts = parsePathPoints(el)
    if (pathPts.length >= 3) {
      const spreadCx = center.x
      const spreadCy = center.y
      const avgScale = (scaleX + scaleY) / 2
      const bakedPts: PathPoint[] = pathPts.map(p => {
        const ta = tfPoint(p.anchor[0], p.anchor[1], tf)
        const tl = tfPoint(p.leftDir[0], p.leftDir[1], tf)
        const tr = tfPoint(p.rightDir[0], p.rightDir[1], tf)
        return {
          anchor: [ta.x - spreadCx, ta.y - spreadCy] as [number, number],
          leftDir: [tl.x - spreadCx, tl.y - spreadCy] as [number, number],
          rightDir: [tr.x - spreadCx, tr.y - spreadCy] as [number, number],
        }
      })
      base.svgPath = pathPointsToSvg(bakedPts)
      base.rotation = 0
      base.scaleX = 1
      base.scaleY = 1
      // Scale strokeWeight and shadow to match baked transform
      base.strokeWeight = base.strokeWeight * avgScale
      if (base.shadow) {
        base.shadow = {
          ...base.shadow,
          offsetX: base.shadow.offsetX * avgScale,
          offsetY: base.shadow.offsetY * avgScale,
          blur: base.shadow.blur * avgScale,
        }
      }
      base.anchors = pathPts.map(p => ({ x: p.anchor[0], y: p.anchor[1] }))
    } else {
      base.anchors = anchors
    }
    return base
  }

  if (type === 'TextFrame') {
    const storyId = attr(el, 'ParentStory')
    const paragraphs = storiesMap.get(storyId) ?? []

    // Parse TextFramePreference: InsetSpacing + VerticalJustification
    // Inline TextFramePreference overrides ObjectStyle TextFramePreference
    let insetTop = objStyle?.insetTop ?? 0
    let insetBottom = objStyle?.insetBottom ?? 0
    let insetLeft = objStyle?.insetLeft ?? 0
    let insetRight = objStyle?.insetRight ?? 0
    let verticalJustification: 'top' | 'center' | 'bottom' = objStyle?.verticalJustification ?? 'top'
    const tfpEls = el.getElementsByTagName('TextFramePreference')
    if (tfpEls.length > 0) {
      const tfp = tfpEls[0]
      const insets = parseInsetSpacing(tfp)
      if (insets) {
        insetTop = insets[0]; insetLeft = insets[1]; insetBottom = insets[2]; insetRight = insets[3]
      }
      const vjAttr = tfp.getAttribute('VerticalJustification')
      if (vjAttr === 'CenterAlign') verticalJustification = 'center'
      else if (vjAttr === 'BottomAlign') verticalJustification = 'bottom'
      else if (vjAttr === 'TopAlign') verticalJustification = 'top'
    }
    // Check for UseNoLineBreaksForAutoSizing (text must stay on one line)
    let noLineBreaks = false
    if (tfpEls.length > 0) {
      const nlb = tfpEls[0].getAttribute('UseNoLineBreaksForAutoSizing')
      if (nlb === 'true') noLineBreaks = true
    }

    console.log(`[IDML] TextFrame ${id}: story=${storyId} paras=${paragraphs.length} center=(${cx.toFixed(0)},${cy.toFixed(0)}) ${(localW*scaleX).toFixed(0)}x${(localH*scaleY).toFixed(0)} fill=${fillRef} inset=${insetTop.toFixed(2)}/${insetRight.toFixed(2)}/${insetBottom.toFixed(2)}/${insetLeft.toFixed(2)} vJust=${verticalJustification}`)

    // Detect non-rectangular TextFrame (Oval, custom shape) by checking PathGeometry curves
    const framePts = parsePathPoints(el)
    let isOvalFrame = false
    let frameSvgPath: string | undefined
    if (framePts.length >= 3 && fill) {
      const hasCurves = framePts.some(p =>
        p.leftDir[0] !== p.anchor[0] || p.leftDir[1] !== p.anchor[1] ||
        p.rightDir[0] !== p.anchor[0] || p.rightDir[1] !== p.anchor[1]
      )
      if (hasCurves) {
        // It's an oval/circular TextFrame — build the SVG path for the background shape
        isOvalFrame = framePts.length === 4  // 4 curved points = ellipse
        const spreadCx = center.x
        const spreadCy = center.y
        const bakedPts: PathPoint[] = framePts.map(p => {
          const ta = tfPoint(p.anchor[0], p.anchor[1], tf)
          const tl = tfPoint(p.leftDir[0], p.leftDir[1], tf)
          const tr = tfPoint(p.rightDir[0], p.rightDir[1], tf)
          return {
            anchor: [ta.x - spreadCx, ta.y - spreadCy] as [number, number],
            leftDir: [tl.x - spreadCx, tl.y - spreadCy] as [number, number],
            rightDir: [tr.x - spreadCx, tr.y - spreadCy] as [number, number],
          }
        })
        frameSvgPath = pathPointsToSvg(bakedPts)
        console.log(`[IDML] TextFrame ${id} has curved PathGeometry (${framePts.length} pts, isOval=${isOvalFrame})`)
      }
    }

    // Empty TextFrame with custom shape (>4 path points) = render as Polygon (SVG path)
    // e.g. the large arrow shape u116 with 12 path points
    if (paragraphs.length === 0) {
      const pathPts = parsePathPoints(el)
      if (pathPts.length > 4 && fill) {
        // Convert to Polygon-like with baked SVG path
        const spreadCx = center.x
        const spreadCy = center.y
        const avgScale = (scaleX + scaleY) / 2
        const bakedPts: PathPoint[] = pathPts.map(p => {
          const ta = tfPoint(p.anchor[0], p.anchor[1], tf)
          const tl = tfPoint(p.leftDir[0], p.leftDir[1], tf)
          const tr = tfPoint(p.rightDir[0], p.rightDir[1], tf)
          return {
            anchor: [ta.x - spreadCx, ta.y - spreadCy] as [number, number],
            leftDir: [tl.x - spreadCx, tl.y - spreadCy] as [number, number],
            rightDir: [tr.x - spreadCx, tr.y - spreadCy] as [number, number],
          }
        })
        return {
          ...base,
          type: 'Polygon',
          svgPath: pathPointsToSvg(bakedPts),
          rotation: 0,
          scaleX: 1,
          scaleY: 1,
          // Scale strokeWeight and shadow to match baked transform
          strokeWeight: base.strokeWeight * avgScale,
          shadow: base.shadow ? {
            ...base.shadow,
            offsetX: base.shadow.offsetX * avgScale,
            offsetY: base.shadow.offsetY * avgScale,
            blur: base.shadow.blur * avgScale,
          } : null,
        }
      }
      // Regular empty text frame (4 points) → skip
      return null
    }

    return {
      ...base, storyId, paragraphs, isOvalFrame, frameSvgPath,
      insetTop: insetTop || undefined,
      insetBottom: insetBottom || undefined,
      insetLeft: insetLeft || undefined,
      insetRight: insetRight || undefined,
      verticalJustification: verticalJustification !== 'top' ? verticalJustification : undefined,
      noLineBreaks: noLineBreaks || undefined,
    }
  }

  console.log(`[IDML] ${type} ${id}: center=(${cx.toFixed(0)},${cy.toFixed(0)}) ${(localW*scaleX).toFixed(0)}x${(localH*scaleY).toFixed(0)} fill=${fillRef}${hasImage ? ' IMAGE='+imagePath : ''}`)
  return base
}
