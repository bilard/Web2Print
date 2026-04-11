import { Control, FabricObject, InteractiveFabricObject } from 'fabric'

// ── Custom renderers ────────────────────────────────────────────────────────

const CORNER_RADIUS = 6
const PILL_W = 6
const PILL_H = 18
const PILL_BORDER_RADIUS = 3
const FILL = '#ffffff'
const STROKE = '#b0b0b0'
const STROKE_WIDTH = 1.5
const ROTATION_ICON_OFFSET = 30
const ROTATION_ICON_RADIUS = 14

/** Render a circle handle (corners) */
function renderCircleHandle(
  this: Control,
  ctx: CanvasRenderingContext2D,
  left: number,
  top: number,
  _styleOverride: any,
  _fabricObject: InteractiveFabricObject,
) {
  ctx.save()
  ctx.translate(left, top)

  // Shadow
  ctx.shadowColor = 'rgba(0,0,0,0.15)'
  ctx.shadowBlur = 4
  ctx.shadowOffsetX = 0
  ctx.shadowOffsetY = 1

  ctx.beginPath()
  ctx.arc(0, 0, CORNER_RADIUS, 0, Math.PI * 2)
  ctx.fillStyle = FILL
  ctx.fill()

  ctx.shadowColor = 'transparent'
  ctx.strokeStyle = STROKE
  ctx.lineWidth = STROKE_WIDTH
  ctx.stroke()

  ctx.restore()
}

/** Render a pill/rounded-rect handle (middle sides) */
function renderPillHandle(
  this: Control,
  ctx: CanvasRenderingContext2D,
  left: number,
  top: number,
  _styleOverride: any,
  fabricObject: InteractiveFabricObject,
) {
  ctx.save()
  ctx.translate(left, top)

  // Rotate pill to follow the object's rotation
  const objAngle = (fabricObject.angle || 0) * (Math.PI / 180)
  // ml/mr (this.y === 0) are on vertical sides → pill drawn vertically (no extra rotation)
  // mt/mb (this.x === 0) are on horizontal sides → pill drawn horizontally (+90°)
  const isTopBottom = this.x === 0
  const rotation = objAngle + (isTopBottom ? Math.PI / 2 : 0)
  ctx.rotate(rotation)

  const w = PILL_W
  const h = PILL_H
  const r = PILL_BORDER_RADIUS

  // Shadow
  ctx.shadowColor = 'rgba(0,0,0,0.15)'
  ctx.shadowBlur = 4
  ctx.shadowOffsetX = 0
  ctx.shadowOffsetY = 1

  ctx.beginPath()
  ctx.roundRect(-w / 2, -h / 2, w, h, r)
  ctx.fillStyle = FILL
  ctx.fill()

  ctx.shadowColor = 'transparent'
  ctx.strokeStyle = STROKE
  ctx.lineWidth = STROKE_WIDTH
  ctx.stroke()

  ctx.restore()
}

/** Render the rotation icon — a circle with a rotation arrow */
function renderRotationControl(
  this: Control,
  ctx: CanvasRenderingContext2D,
  left: number,
  top: number,
  _styleOverride: any,
  _fabricObject: InteractiveFabricObject,
) {
  ctx.save()
  ctx.translate(left, top)

  const r = ROTATION_ICON_RADIUS

  // Shadow
  ctx.shadowColor = 'rgba(0,0,0,0.18)'
  ctx.shadowBlur = 6
  ctx.shadowOffsetX = 0
  ctx.shadowOffsetY = 2

  // White circle background
  ctx.beginPath()
  ctx.arc(0, 0, r, 0, Math.PI * 2)
  ctx.fillStyle = FILL
  ctx.fill()

  ctx.shadowColor = 'transparent'
  ctx.strokeStyle = '#d0d0d0'
  ctx.lineWidth = 1
  ctx.stroke()

  // Draw rotation arrow icon
  const iconR = r * 0.52
  ctx.strokeStyle = '#666666'
  ctx.lineWidth = 1.8
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'

  // Arc (270° sweep, leaving gap for arrow)
  ctx.beginPath()
  ctx.arc(0, 0, iconR, -Math.PI * 0.75, Math.PI * 0.65)
  ctx.stroke()

  // Arrowhead at the end of the arc
  const arrowAngle = Math.PI * 0.65
  const ax = Math.cos(arrowAngle) * iconR
  const ay = Math.sin(arrowAngle) * iconR
  const arrowSize = 3.5
  const tangent = arrowAngle + Math.PI / 2

  ctx.beginPath()
  ctx.moveTo(ax + Math.cos(tangent - 0.6) * arrowSize, ay + Math.sin(tangent - 0.6) * arrowSize)
  ctx.lineTo(ax, ay)
  ctx.lineTo(ax + Math.cos(tangent + 0.6) * arrowSize, ay + Math.sin(tangent + 0.6) * arrowSize)
  ctx.stroke()

  ctx.restore()
}

// ── Apply custom controls to all FabricObjects ──────────────────────────────

/** Patch a controls set with custom renderers */
function patchControls(controls: Record<string, Control>) {
  for (const key of ['tl', 'tr', 'bl', 'br']) {
    if (controls[key]) {
      controls[key].render = renderCircleHandle
      controls[key].sizeX = CORNER_RADIUS * 2
      controls[key].sizeY = CORNER_RADIUS * 2
    }
  }
  for (const key of ['mt', 'mb', 'ml', 'mr']) {
    if (controls[key]) {
      controls[key].render = renderPillHandle
      controls[key].sizeX = PILL_H
      controls[key].sizeY = PILL_H
    }
  }
  if (controls.mtr) {
    controls.mtr.render = renderRotationControl
    // Position rotation above the object (y=-0.5 = top edge)
    controls.mtr.x = 0
    controls.mtr.y = -0.5
    controls.mtr.offsetY = -ROTATION_ICON_OFFSET
    controls.mtr.offsetX = 0
    controls.mtr.sizeX = ROTATION_ICON_RADIUS * 2
    controls.mtr.sizeY = ROTATION_ICON_RADIUS * 2
    controls.mtr.withConnection = true
    controls.mtr.cursorStyle = 'grab'
  }
}

export function applyCustomControls() {
  // Override default object styling on prototype
  const proto = FabricObject.prototype as any
  proto.borderColor = '#4A90D9'
  proto.borderScaleFactor = 2
  proto.cornerColor = FILL
  proto.cornerStrokeColor = STROKE
  proto.cornerSize = CORNER_RADIUS * 2
  proto.transparentCorners = false
  proto.borderOpacityWhenMoving = 0.6
  proto.cornerStyle = 'circle'
  proto.padding = 0
}

/** Apply custom controls to a single Fabric object */
export function applyCustomControlsToObject(obj: { controls?: Record<string, Control> }) {
  if (obj.controls) patchControls(obj.controls)
}

// ── Square handles (for the crop frame — mimics DAM crop overlay) ───────────

const CROP_HANDLE_SIZE = 8
const CROP_HANDLE_FILL = '#ffffff'
const CROP_HANDLE_STROKE = '#818cf8' // indigo-400

/** Render a small white square with an indigo-400 border (crop handle) */
function renderSquareHandle(
  this: Control,
  ctx: CanvasRenderingContext2D,
  left: number,
  top: number,
  _styleOverride: any,
  _fabricObject: InteractiveFabricObject,
) {
  ctx.save()
  ctx.translate(left, top)

  const s = CROP_HANDLE_SIZE
  ctx.fillStyle = CROP_HANDLE_FILL
  ctx.fillRect(-s / 2, -s / 2, s, s)

  ctx.strokeStyle = CROP_HANDLE_STROKE
  ctx.lineWidth = 1
  ctx.strokeRect(-s / 2, -s / 2, s, s)

  ctx.restore()
}

/**
 * Patche l'objet pour qu'il utilise des handles carrés blancs (style DAM).
 * Clone les controls pour ne pas affecter les autres objets qui partagent
 * les controls par défaut du prototype Fabric.
 */
export function applySquareCropControls(obj: {
  controls?: Record<string, Control>
}) {
  if (!obj.controls) return
  const original = obj.controls
  // Shallow clone of the controls map + clone of each Control instance so
  // `render` override reste propre à ce cropFrame.
  const cloned: Record<string, Control> = {}
  for (const key of Object.keys(original)) {
    const src = original[key] as any
    const dst = Object.create(Object.getPrototypeOf(src))
    Object.assign(dst, src)
    cloned[key] = dst
  }
  obj.controls = cloned

  for (const key of ['tl', 'tr', 'bl', 'br', 'mt', 'mb', 'ml', 'mr']) {
    if (cloned[key]) {
      cloned[key].render = renderSquareHandle
      cloned[key].sizeX = CROP_HANDLE_SIZE
      cloned[key].sizeY = CROP_HANDLE_SIZE
    }
  }
  // Supprime la poignée de rotation (le crop n'a pas de rotation)
  if (cloned.mtr) delete cloned.mtr
}
