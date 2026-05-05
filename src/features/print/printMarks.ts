import { Rect, Circle, type FabricObject } from 'fabric'

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

const BLEED_COLOR = '#e53935'
const CROP_COLOR = '#888888'
const SAFE_COLOR = '#c026d3'

function makeBleedRect(x: number, y: number, w: number, h: number, bleed: number): FabricObject {
  const r = new Rect({
    left: x - bleed,
    top: y - bleed,
    originX: 'left',
    originY: 'top',
    width: w + bleed * 2,
    height: h + bleed * 2,
    fill: 'rgba(0,0,0,0)',
    stroke: BLEED_COLOR,
    strokeWidth: 1,
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
): FabricObject[] {
  // Plage outward partagée par les 4 coins : de `inner` à `outer` depuis le trim.
  const inner = Math.round(bleed + offset)
  const outer = Math.round(bleed + offset + length)

  // Coordonnées entières des 4 coins du trim box
  const L = Math.round(x)
  const R = Math.round(x + w)
  const T = Math.round(y)
  const B = Math.round(y + h)

  const marks: FabricObject[] = []

  // Utiliser des petits Rect au lieu de Line pour meilleure visibilité
  const makeHorizontalMark = (left: number, top: number, width: number) => {
    return tag(new Rect({
      left,
      top: top - 1,
      width,
      height: 2,
      fill: CROP_COLOR,
      stroke: 'none',
      originX: 'left',
      originY: 'top',
    }), 'crop-mark')
  }

  const makeVerticalMark = (left: number, top: number, height: number) => {
    return tag(new Rect({
      left: left - 1,
      top,
      width: 2,
      height,
      fill: CROP_COLOR,
      stroke: 'none',
      originX: 'left',
      originY: 'top',
    }), 'crop-mark')
  }

  // TOP-LEFT : traits vers la gauche et vers le haut
  marks.push(makeHorizontalMark(L - outer, T, outer - inner))
  marks.push(makeVerticalMark(L, T - outer, outer - inner))

  // TOP-RIGHT : traits vers la droite et vers le haut
  marks.push(makeHorizontalMark(R + inner, T, outer - inner))
  marks.push(makeVerticalMark(R, T - outer, outer - inner))

  // BOTTOM-LEFT : traits vers la gauche et vers le bas
  marks.push(makeHorizontalMark(L - outer, B, outer - inner))
  marks.push(makeVerticalMark(L, B + inner, outer - inner))

  // BOTTOM-RIGHT : traits vers la droite et vers le bas
  marks.push(makeHorizontalMark(R + inner, B, outer - inner))
  marks.push(makeVerticalMark(R, B + inner, outer - inner))

  return marks
}

/**
 * Hirondelles simples (repères de montage) aux 4 milieux de côté :
 * cercle + croix intérieure, forme classique minimaliste.
 */
function makeRegistrationMarks(
  x: number, y: number, w: number, h: number,
  bleed: number, offset: number, length: number, dpi: number,
): FabricObject[] {
  const lineOpts = {
    stroke: CROP_COLOR,
    strokeWidth: 1,
    strokeUniform: true,
    strokeLineCap: 'butt' as const,
  }
  const mmToPx = (mm: number) => (mm * dpi) / 25.4
  const radius = mmToPx(1.5)

  const markDistance = bleed + offset + length / 2

  const makeMark = (cx: number, cy: number): FabricObject[] => [
    tag(new Circle({
      left: cx - radius,
      top: cy - radius,
      originX: 'left',
      originY: 'top',
      radius,
      fill: 'rgba(0,0,0,0)',
      stroke: CROP_COLOR,
      strokeWidth: 1,
      strokeUniform: true,
    }), 'registration-mark'),
    tag(new Rect({
      left: cx - radius,
      top: cy - 1,
      width: radius * 2,
      height: 2,
      fill: CROP_COLOR,
      stroke: 'none',
      originX: 'left',
      originY: 'top',
    }), 'registration-mark'),
    tag(new Rect({
      left: cx - 1,
      top: cy - radius,
      width: 2,
      height: radius * 2,
      fill: CROP_COLOR,
      stroke: 'none',
      originX: 'left',
      originY: 'top',
    }), 'registration-mark'),
  ]

  const centerX = x + w / 2
  const centerY = y + h / 2

  return [
    ...makeMark(centerX, y - markDistance),        // haut
    ...makeMark(centerX, y + h + markDistance),    // bas
    ...makeMark(x - markDistance, centerY),        // gauche
    ...makeMark(x + w + markDistance, centerY),    // droite
  ]
}

function makeSafeArea(x: number, y: number, w: number, h: number, margin: number): FabricObject {
  const r = new Rect({
    left: x + margin,
    top: y + margin,
    originX: 'left',
    originY: 'top',
    width: w - margin * 2,
    height: h - margin * 2,
    fill: 'rgba(0,0,0,0)',
    stroke: SAFE_COLOR,
    strokeWidth: 1.5,
    strokeUniform: true,
    strokeDashArray: [6, 4],
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

  if (opts.showPrintMarks) {
    if (opts.bleedPx > 0) {
      objs.push(makeBleedRect(x, y, w, h, opts.bleedPx))
    }
    objs.push(
      ...makeCornerMarks(x, y, w, h, opts.bleedPx, opts.cropMarkOffsetPx, opts.cropMarkLengthPx),
    )
  }

  if (opts.showSafeArea && opts.safeAreaPx > 0) {
    objs.push(makeSafeArea(x, y, w, h, opts.safeAreaPx))
  }

  if (opts.showRegistrationMarks) {
    objs.push(
      ...makeRegistrationMarks(
        x, y, w, h,
        opts.bleedPx, opts.cropMarkOffsetPx, opts.cropMarkLengthPx, dpi,
      ),
    )
  }

  return objs
}
