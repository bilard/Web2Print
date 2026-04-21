import { Rect, Line, type FabricObject } from 'fabric'

export interface PrintMarksOptions {
  canvasWidthPx: number
  canvasHeightPx: number
  /** Origine de la page sur le canvas (0,0 par défaut). */
  pageLeftPx?: number
  pageTopPx?: number
  bleedPx: number
  cropMarkLengthPx: number
  cropMarkOffsetPx: number
  safeAreaPx: number
  showPrintMarks: boolean
  showSafeArea: boolean
}

type MarkType = 'bleed-rect' | 'crop-mark' | 'safe-area'

function tag(obj: FabricObject, markType: MarkType): FabricObject {
  const o = obj as FabricObject & { data?: Record<string, unknown>; excludeFromExport?: boolean }
  o.data = { ...(o.data ?? {}), isPrintMark: true, markType }
  o.selectable = false
  o.evented = false
  o.hoverCursor = 'default'
  o.excludeFromExport = true
  // Contre-mesure : un handler `object:added` global peut basculer originX/Y
  // à 'center' — on les rétablit après ajout via setCoords() dans l'effet.
  ;(o as FabricObject & { originX?: string; originY?: string }).originX = 'left'
  ;(o as FabricObject & { originX?: string; originY?: string }).originY = 'top'
  return obj
}

function makeBleedRect(x: number, y: number, w: number, h: number, bleed: number): FabricObject {
  const r = new Rect({
    left: x - bleed,
    top: y - bleed,
    originX: 'left',
    originY: 'top',
    width: w + bleed * 2,
    height: h + bleed * 2,
    fill: 'transparent',
    stroke: '#ff3b30',
    strokeWidth: 2.5,
    strokeDashArray: [8, 5],
  })
  return tag(r, 'bleed-rect')
}

function makeCropMarks(x: number, y: number, w: number, h: number, offset: number, length: number): FabricObject[] {
  const color = '#ff9500'
  const sw = 2
  const lines: FabricObject[] = []
  const x1 = x, y1 = y, x2 = x + w, y2 = y + h

  // Coin haut-gauche
  lines.push(new Line([x1 - offset - length, y1, x1 - offset, y1], { stroke: color, strokeWidth: sw }))
  lines.push(new Line([x1, y1 - offset - length, x1, y1 - offset], { stroke: color, strokeWidth: sw }))

  // Coin haut-droit
  lines.push(new Line([x2 + offset, y1, x2 + offset + length, y1], { stroke: color, strokeWidth: sw }))
  lines.push(new Line([x2, y1 - offset - length, x2, y1 - offset], { stroke: color, strokeWidth: sw }))

  // Coin bas-gauche
  lines.push(new Line([x1 - offset - length, y2, x1 - offset, y2], { stroke: color, strokeWidth: sw }))
  lines.push(new Line([x1, y2 + offset, x1, y2 + offset + length], { stroke: color, strokeWidth: sw }))

  // Coin bas-droit
  lines.push(new Line([x2 + offset, y2, x2 + offset + length, y2], { stroke: color, strokeWidth: sw }))
  lines.push(new Line([x2, y2 + offset, x2, y2 + offset + length], { stroke: color, strokeWidth: sw }))

  return lines.map((l) => tag(l, 'crop-mark'))
}

function makeSafeArea(x: number, y: number, w: number, h: number, margin: number): FabricObject {
  const r = new Rect({
    left: x + margin,
    top: y + margin,
    originX: 'left',
    originY: 'top',
    width: w - margin * 2,
    height: h - margin * 2,
    fill: 'transparent',
    stroke: '#00d9ff',
    strokeWidth: 2.5,
    strokeDashArray: [8, 5],
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

export function buildPrintMarks(opts: PrintMarksOptions): FabricObject[] {
  const objs: FabricObject[] = []
  const x = opts.pageLeftPx ?? 0
  const y = opts.pageTopPx ?? 0
  const w = opts.canvasWidthPx
  const h = opts.canvasHeightPx

  if (opts.showPrintMarks) {
    if (opts.bleedPx > 0) {
      objs.push(makeBleedRect(x, y, w, h, opts.bleedPx))
    }
    objs.push(...makeCropMarks(x, y, w, h, opts.cropMarkOffsetPx, opts.cropMarkLengthPx))
  }

  if (opts.showSafeArea && opts.safeAreaPx > 0) {
    objs.push(makeSafeArea(x, y, w, h, opts.safeAreaPx))
  }

  return objs
}
