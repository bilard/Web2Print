import { useCallback } from 'react'
import { Rect, Ellipse, IText, Textbox, Line, Triangle, Polygon, FabricObject, Gradient, Group, Pattern } from 'fabric'
import { globalFabricCanvas } from './CanvasContainer'
import { useEditorStore } from '@/stores/editor.store'
import type { CanvasObjectProps, ShadowConfig, GradientConfig } from '@/stores/editor.store'

/**
 * For text objects with per-character styles, extract the dominant style
 * from the first character of each line (paragraph). This gives accurate
 * fontSize/fontFamily/fill values instead of the base object defaults.
 */
function getEffectiveTextProps(obj: any): {
  fontSize?: number
  fontFamily?: string
  fontWeight?: string
  fontStyle?: string
  fill?: string
} {
  const styles = obj.styles as Record<number, Record<number, Record<string, unknown>>> | undefined
  if (!styles) return {}

  // Find the first character that has style overrides
  for (const lineKey of Object.keys(styles).sort((a, b) => Number(a) - Number(b))) {
    const line = styles[Number(lineKey)]
    if (!line) continue
    for (const charKey of Object.keys(line).sort((a, b) => Number(a) - Number(b))) {
      const charStyle = line[Number(charKey)]
      if (!charStyle) continue
      const result: Record<string, unknown> = {}
      if (charStyle.fontSize !== undefined) result.fontSize = charStyle.fontSize
      if (charStyle.fontFamily !== undefined) result.fontFamily = charStyle.fontFamily
      if (charStyle.fontWeight !== undefined) result.fontWeight = charStyle.fontWeight
      if (charStyle.fontStyle !== undefined) result.fontStyle = charStyle.fontStyle
      if (charStyle.fill !== undefined) result.fill = charStyle.fill
      if (Object.keys(result).length > 0) return result as any
    }
  }
  return {}
}

let _counter = 0
function uid() { return `obj_${++_counter}_${Date.now()}` }

/** Flag to prevent store→canvas sync during active manipulation (drag/scale/rotate) */
export let isInteracting = false
export function setIsInteracting(v: boolean) { isInteracting = v }

function fabricShadowToConfig(shadow: unknown): ShadowConfig | null {
  if (!shadow || typeof shadow !== 'object') return null
  const s = shadow as any
  return {
    color: s.color ?? 'rgba(0,0,0,0.4)',
    blur: s.blur ?? 0,
    offsetX: s.offsetX ?? 0,
    offsetY: s.offsetY ?? 0,
  }
}

function isPatternFill(fill: unknown): boolean {
  if (!fill || typeof fill !== 'object') return false
  return fill instanceof Pattern || (fill as any).type === 'pattern'
}

function isGradientFill(fill: unknown): boolean {
  if (!fill || typeof fill !== 'object') return false
  // Check both instanceof and duck-typing (colorStops property) for robustness
  return fill instanceof Gradient || (Array.isArray((fill as any).colorStops) && typeof (fill as any).type === 'string')
}

function fabricGradientToConfig(fill: unknown): GradientConfig | null {
  if (!fill || typeof fill !== 'object') return null
  if (!isGradientFill(fill)) return null
  const g = fill as any
  const stops = (g.colorStops ?? []).map((s: any) => ({
    offset: s.offset ?? 0,
    color: s.color ?? '#000000',
  }))
  let angle = 0
  if (g.type === 'linear' && g.coords) {
    const dx = (g.coords.x2 ?? 0) - (g.coords.x1 ?? 0)
    const dy = (g.coords.y2 ?? 0) - (g.coords.y1 ?? 0)
    angle = Math.round(((Math.atan2(dy, dx) * 180) / Math.PI + 360) % 360)
  }
  return { type: g.type ?? 'linear', angle, stops }
}

function fabricObjToProps(o: FabricObject, index: number, parentId?: string): CanvasObjectProps {
  const d = (o as any).data ?? {}
  const fill = o.fill
  const isPat = isPatternFill(fill)
  const isGrad = isGradientFill(fill)
  const fillStr = typeof fill === 'string' ? fill : '#6366f1'
  const fillType = isPat || d.fillType === 'image' ? 'image' as const : isGrad ? 'gradient' as const : (!fill || fill === 'transparent' || fill === '' ? 'none' as const : 'solid' as const)

  const w = ((o as any).width ?? 0) * (o.scaleX ?? 1)
  const h = ((o as any).height ?? 0) * (o.scaleY ?? 1)
  const isCenterX = (o as any).originX === 'center'
  const isCenterY = (o as any).originY === 'center'
  const posX = (o.left ?? 0) - (isCenterX ? w / 2 : 0)
  const posY = (o.top ?? 0) - (isCenterY ? h / 2 : 0)

  const effectiveText = (o instanceof IText || o instanceof Textbox) ? getEffectiveTextProps(o) : {}

  // Enfants de groupe
  const isFabricGroup = o instanceof Group
  let children: CanvasObjectProps[] | undefined
  if (isFabricGroup) {
    const groupId = d.id ?? `obj_${index}`
    children = o.getObjects().map((child, i) => fabricObjToProps(child, i, groupId))
  }

  // Type : si c'est une instance Group Fabric, forcer 'group' même si data.type est absent.
  // Pour les imports SVG, détecter les textes via instanceof faute de data.type pré-rempli.
  const resolvedType = isFabricGroup
    ? 'group'
    : d.type
      ? (d.type as CanvasObjectProps['type'])
      : (o instanceof IText || o instanceof Textbox)
        ? 'text'
        : 'rect'

  return {
    id: d.id ?? `obj_${index}`,
    type: resolvedType,
    name: d.name ?? '',
    visible: o.visible ?? true,
    locked: d.locked ?? false,
    x: Math.round(posX),
    y: Math.round(posY),
    width: Math.round(w),
    height: Math.round(h),
    fill: (effectiveText.fill && typeof effectiveText.fill === 'string') ? effectiveText.fill : fillStr,
    stroke: typeof o.stroke === 'string' ? o.stroke : '',
    strokeWidth: o.strokeWidth ?? 0,
    strokeDashArray: o.strokeDashArray as number[] | undefined,
    strokeLineCap: (o.strokeLineCap ?? 'butt') as CanvasObjectProps['strokeLineCap'],
    strokeLineJoin: (o.strokeLineJoin ?? 'miter') as CanvasObjectProps['strokeLineJoin'],
    opacity: o.opacity ?? 1,
    angle: Math.round(o.angle ?? 0),
    flipX: o.flipX ?? false,
    flipY: o.flipY ?? false,
    cornerRadius: (o as any).rx ?? 0,
    shadow: fabricShadowToConfig(o.shadow),
    fillType,
    gradient: isGrad ? (d.gradient ?? fabricGradientToConfig(fill)) : (d.gradient ?? null),
    fillImage: d.fillImage ?? null,
    fillImageName: d.fillImageName ?? null,
    blendMode: (o as any).globalCompositeOperation ?? 'source-over',
    lockAspectRatio: d.lockAspectRatio ?? false,
    fontSize: effectiveText.fontSize ?? (o as any).fontSize,
    fontFamily: effectiveText.fontFamily ?? (o as any).fontFamily,
    fontWeight: effectiveText.fontWeight ?? (o as any).fontWeight,
    fontStyle: effectiveText.fontStyle ?? (o as any).fontStyle,
    textAlign: (o as any).textAlign,
    text: (o as any).text,
    underline: (o as any).underline,
    linethrough: (o as any).linethrough,
    charSpacing: (o as any).charSpacing,
    lineHeight: (o as any).lineHeight,
    textTransform: d.textTransform ?? 'none',
    children,
    parentId,
  }
}

export function syncToStore(canvas: NonNullable<typeof globalFabricCanvas>) {
  const { setCanvasObjects } = useEditorStore.getState()
  const objects: CanvasObjectProps[] = canvas
    .getObjects()
    .filter((o) => !o.data?.isGrid && !o.data?.isPageBg)
    .map((o, i) => fabricObjToProps(o, i))
  setCanvasObjects(objects)
}

// ── Shape point generators ──────────────────────────────────────────────────

function starPoints(cx: number, cy: number, outerR: number, innerR: number, points: number): { x: number; y: number }[] {
  const result: { x: number; y: number }[] = []
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 === 0 ? outerR : innerR
    const angle = (Math.PI / points) * i - Math.PI / 2
    result.push({ x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) })
  }
  return result
}

function arrowPoints(): { x: number; y: number }[] {
  return [
    { x: 0, y: 30 }, { x: 100, y: 30 }, { x: 100, y: 0 },
    { x: 150, y: 50 }, { x: 100, y: 100 }, { x: 100, y: 70 },
    { x: 0, y: 70 },
  ]
}

function hexagonPoints(cx: number, cy: number, r: number): { x: number; y: number }[] {
  return Array.from({ length: 6 }, (_, i) => {
    const angle = (Math.PI / 3) * i - Math.PI / 2
    return { x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) }
  })
}

function diamondPoints(w: number, h: number): { x: number; y: number }[] {
  return [{ x: w / 2, y: 0 }, { x: w, y: h / 2 }, { x: w / 2, y: h }, { x: 0, y: h / 2 }]
}

function calloutPoints(w: number, h: number): { x: number; y: number }[] {
  return [
    { x: 0, y: 0 }, { x: w, y: 0 }, { x: w, y: h * 0.7 },
    { x: w * 0.35, y: h * 0.7 }, { x: w * 0.15, y: h },
    { x: w * 0.25, y: h * 0.7 }, { x: 0, y: h * 0.7 },
  ]
}

// ── Main hook ───────────────────────────────────────────────────────────────

export function useAddObject() {
  const { setSelectedObjectId } = useEditorStore()

  const addObject = useCallback((type: string) => {
    const canvas = globalFabricCanvas
    if (!canvas) return

    const id = uid()
    const cx = canvas.getWidth() / 2
    const cy = canvas.getHeight() / 2
    const vt = canvas.viewportTransform ?? [1, 0, 0, 1, 0, 0]
    const zoom = canvas.getZoom()
    const docX = (cx - vt[4]) / zoom
    const docY = (cy - vt[5]) / zoom

    let obj: FabricObject | null = null

    if (type === 'rect') {
      obj = new Rect({
        left: docX - 75, top: docY - 50, width: 150, height: 100,
        fill: '#6366f1', strokeWidth: 0,
        data: { id, type: 'rect' },
      })
    } else if (type === 'ellipse') {
      obj = new Ellipse({
        left: docX - 60, top: docY - 60, rx: 60, ry: 60,
        fill: '#6366f1', strokeWidth: 0,
        data: { id, type: 'ellipse' },
      })
    } else if (type === 'text') {
      obj = new Textbox('Double-cliquez pour éditer', {
        left: docX - 120, top: docY - 12,
        width: 240,
        fontSize: 24, fontFamily: 'Inter', fill: '#ffffff',
        data: { id, type: 'text' },
      })
    } else if (type === 'line') {
      obj = new Line([docX - 80, docY, docX + 80, docY], {
        stroke: '#ffffff', strokeWidth: 2, fill: '',
        data: { id, type: 'line' },
      })
    } else if (type === 'triangle') {
      obj = new Triangle({
        left: docX - 75, top: docY - 65, width: 150, height: 130,
        fill: '#6366f1', strokeWidth: 0,
        data: { id, type: 'triangle' },
      })
    } else if (type === 'star') {
      const pts = starPoints(0, 0, 65, 30, 5)
      const p = new Polygon(pts, { left: docX - 65, top: docY - 65, fill: '#6366f1', strokeWidth: 0 })
      ;(p as any).data = { id, type: 'star' }
      obj = p
    } else if (type === 'arrow') {
      const pts = arrowPoints()
      const p = new Polygon(pts, { left: docX - 75, top: docY - 50, fill: '#6366f1', strokeWidth: 0 })
      ;(p as any).data = { id, type: 'arrow' }
      obj = p
    } else if (type === 'hexagon') {
      const pts = hexagonPoints(0, 0, 60)
      const p = new Polygon(pts, { left: docX - 60, top: docY - 60, fill: '#6366f1', strokeWidth: 0 })
      ;(p as any).data = { id, type: 'hexagon' }
      obj = p
    } else if (type === 'diamond') {
      const pts = diamondPoints(120, 120)
      const p = new Polygon(pts, { left: docX - 60, top: docY - 60, fill: '#6366f1', strokeWidth: 0 })
      ;(p as any).data = { id, type: 'diamond' }
      obj = p
    } else if (type === 'callout') {
      const pts = calloutPoints(180, 130)
      const p = new Polygon(pts, { left: docX - 90, top: docY - 65, fill: '#6366f1', strokeWidth: 0 })
      ;(p as any).data = { id, type: 'callout' }
      obj = p
    } else {
      return
    }

    canvas.add(obj)
    canvas.setActiveObject(obj)
    canvas.requestRenderAll()
    syncToStore(canvas)
    setSelectedObjectId(id)

    obj.on('modified', () => syncToStore(canvas))
    obj.on('moving', () => syncToStore(canvas))
    obj.on('scaling', () => syncToStore(canvas))
    obj.on('rotating', () => syncToStore(canvas))
  }, [setSelectedObjectId])

  return { addObject }
}
