import { Rect, Line, type FabricObject } from 'fabric'

export interface PrintMarksOptions {
  canvasWidthPx: number
  canvasHeightPx: number
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
  return obj
}

function makeBleedRect(w: number, h: number, bleed: number): FabricObject {
  const r = new Rect({
    left: -bleed,
    top: -bleed,
    width: w + bleed * 2,
    height: h + bleed * 2,
    fill: 'transparent',
    stroke: '#ff3b30',
    strokeWidth: 1,
    strokeDashArray: [6, 4],
  })
  return tag(r, 'bleed-rect')
}

function makeCropMarks(w: number, h: number, bleed: number, length: number): FabricObject[] {
  const color = '#000000'
  const sw = 0.5
  const offset = bleed
  const lines: FabricObject[] = []

  // Coin haut-gauche
  lines.push(new Line([-offset - length, 0, -offset, 0], { stroke: color, strokeWidth: sw }))
  lines.push(new Line([0, -offset - length, 0, -offset], { stroke: color, strokeWidth: sw }))

  // Coin haut-droit
  lines.push(new Line([w + offset, 0, w + offset + length, 0], { stroke: color, strokeWidth: sw }))
  lines.push(new Line([w, -offset - length, w, -offset], { stroke: color, strokeWidth: sw }))

  // Coin bas-gauche
  lines.push(new Line([-offset - length, h, -offset, h], { stroke: color, strokeWidth: sw }))
  lines.push(new Line([0, h + offset, 0, h + offset + length], { stroke: color, strokeWidth: sw }))

  // Coin bas-droit
  lines.push(new Line([w + offset, h, w + offset + length, h], { stroke: color, strokeWidth: sw }))
  lines.push(new Line([w, h + offset, w, h + offset + length], { stroke: color, strokeWidth: sw }))

  return lines.map((l) => tag(l, 'crop-mark'))
}

function makeSafeArea(w: number, h: number, margin: number): FabricObject {
  const r = new Rect({
    left: margin,
    top: margin,
    width: w - margin * 2,
    height: h - margin * 2,
    fill: 'transparent',
    stroke: '#34c759',
    strokeWidth: 1,
    strokeDashArray: [4, 3],
  })
  return tag(r, 'safe-area')
}

export function buildPrintMarks(opts: PrintMarksOptions): FabricObject[] {
  const objs: FabricObject[] = []

  if (opts.showPrintMarks && opts.bleedPx > 0) {
    objs.push(makeBleedRect(opts.canvasWidthPx, opts.canvasHeightPx, opts.bleedPx))
    objs.push(
      ...makeCropMarks(opts.canvasWidthPx, opts.canvasHeightPx, opts.bleedPx, opts.cropMarkLengthPx),
    )
  }

  if (opts.showSafeArea && opts.safeAreaPx > 0) {
    objs.push(makeSafeArea(opts.canvasWidthPx, opts.canvasHeightPx, opts.safeAreaPx))
  }

  return objs
}
