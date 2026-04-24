import { Canvas, Rect, Circle, Ellipse, Path, Textbox, Image as FabricImage, Gradient } from 'fabric'
import type { FabricObject } from 'fabric'
import type {
  DesignAnalysis,
  BackgroundDef,
  DecorativeShape,
} from './analyzeDesignForEdit'

type Bbox = { x: number; y: number; w: number; h: number }

function bboxToPx(bbox: Bbox, canvasWidth: number, canvasHeight: number) {
  return {
    xPx: (bbox.x / 100) * canvasWidth,
    yPx: (bbox.y / 100) * canvasHeight,
    wPx: (bbox.w / 100) * canvasWidth,
    hPx: (bbox.h / 100) * canvasHeight,
  }
}

/**
 * Rend le fond du design (couleur solide ou gradient) comme un Rect Fabric plein canvas.
 * Placé juste au-dessus du pageBg pour ne pas couvrir les marques d'impression.
 */
export function renderBackground(
  canvas: Canvas,
  bg: BackgroundDef,
  canvasWidth: number,
  canvasHeight: number
): Rect {
  const rect = new Rect({
    left: 0,
    top: 0,
    width: canvasWidth,
    height: canvasHeight,
    originX: 'left',
    originY: 'top',
    selectable: false,
    evented: false,
    hoverCursor: 'default',
  })
  rect.data = { isDesignBackground: true }

  if ((bg.type === 'linearGradient' || bg.type === 'radialGradient') && bg.stops?.length) {
    const coords =
      bg.type === 'linearGradient'
        ? computeLinearGradientCoords(bg.angle ?? 90, canvasWidth, canvasHeight)
        : {
            x1: canvasWidth / 2,
            y1: canvasHeight / 2,
            r1: 0,
            x2: canvasWidth / 2,
            y2: canvasHeight / 2,
            r2: Math.max(canvasWidth, canvasHeight) / 2,
          }
    rect.set(
      'fill',
      new Gradient({
        type: bg.type === 'linearGradient' ? 'linear' : 'radial',
        coords,
        colorStops: bg.stops.map((s) => ({ offset: clamp01(s.offset), color: s.color })),
      })
    )
  } else {
    rect.set('fill', bg.color || '#ffffff')
  }

  canvas.add(rect)
  const pageBg = canvas.getObjects().find((o) => o.data?.isPageBg)
  if (pageBg) {
    const idx = canvas.getObjects().indexOf(pageBg)
    canvas.moveObjectTo(rect, idx + 1)
  } else {
    canvas.sendObjectToBack(rect)
  }

  return rect
}

/**
 * Rend les formes décoratives (rects arrondis, cercles, ellipses, paths SVG).
 * L'ordre du tableau est respecté : premier élément = le plus derrière.
 */
export function renderDecorativeShapes(
  canvas: Canvas,
  shapes: DecorativeShape[],
  canvasWidth: number,
  canvasHeight: number
): FabricObject[] {
  const created: FabricObject[] = []

  for (const s of shapes) {
    const { xPx, yPx, wPx, hPx } = bboxToPx(s.bbox, canvasWidth, canvasHeight)
    const opacity = s.opacity ?? 1

    let obj: FabricObject | null = null

    try {
      if (s.type === 'rect') {
        const radius = s.rx ? (s.rx / 100) * Math.min(wPx, hPx) : 0
        obj = new Rect({
          left: xPx,
          top: yPx,
          width: wPx,
          height: hPx,
          rx: radius,
          ry: radius,
          fill: s.fill,
          opacity,
          originX: 'left',
          originY: 'top',
          selectable: true,
        })
      } else if (s.type === 'circle') {
        const radius = Math.min(wPx, hPx) / 2
        obj = new Circle({
          left: xPx,
          top: yPx,
          radius,
          fill: s.fill,
          opacity,
          originX: 'left',
          originY: 'top',
          selectable: true,
        })
      } else if (s.type === 'ellipse') {
        obj = new Ellipse({
          left: xPx,
          top: yPx,
          rx: wPx / 2,
          ry: hPx / 2,
          fill: s.fill,
          opacity,
          originX: 'left',
          originY: 'top',
          selectable: true,
        })
      } else if (s.type === 'path' && s.pathData) {
        const p = new Path(s.pathData, {
          fill: s.fill,
          opacity,
          selectable: true,
        })
        const naturalW = p.width || 100
        const naturalH = p.height || 100
        p.set({
          scaleX: wPx / naturalW,
          scaleY: hPx / naturalH,
          left: xPx,
          top: yPx,
          originX: 'left',
          originY: 'top',
        })
        obj = p
      }
    } catch (err) {
      console.warn(`[createDesign] Shape ${s.id} (type=${s.type}) échouée, ignorée`, err)
      continue
    }

    if (!obj) continue

    obj.data = { id: s.id, isDecorativeShape: true }
    canvas.add(obj)
    created.push(obj)
  }

  return created
}

/**
 * Crée des Fabric Textbox éditables. La taille de police vient directement de
 * Claude Vision (fontSizePct relatif à la hauteur du canvas) — pas de fallback
 * heuristique qui casserait l'intention typographique.
 */
export function addEditableTextOverlays(
  canvas: Canvas,
  texts: DesignAnalysis['texts'],
  canvasWidth: number,
  canvasHeight: number
): Textbox[] {
  const created: Textbox[] = []

  for (const t of texts) {
    const { xPx, yPx, wPx } = bboxToPx(t.bbox, canvasWidth, canvasHeight)

    const fontSize = Math.max(8, ((t.fontSizePct ?? 2) / 100) * canvasHeight)

    const tb = new Textbox(t.text, {
      left: xPx,
      top: yPx,
      width: Math.max(wPx, 40),
      fontSize,
      fontFamily: t.fontFamily?.trim() || 'Inter',
      fill: t.color || '#111111',
      fontWeight: t.bold ? 'bold' : 'normal',
      fontStyle: t.italic ? 'italic' : 'normal',
      linethrough: !!t.strikethrough,
      textAlign: t.align || 'left',
      originX: 'left',
      originY: 'top',
      selectable: true,
      editable: true,
      padding: 2,
    })
    tb.data = { id: t.id, editableText: true }

    canvas.add(tb)
    created.push(tb)
  }

  return created
}

/**
 * Ajoute la source image complète + zones éditables overlay:
 * 1. Si sourceDataUri existe, place l'image Nano Banana complète en fond (UNE SEULE FOIS)
 * 2. Pour chaque imageSlot, crée une zone semi-transparente sélectionnable/éditable par-dessus
 */
export async function addEditableImageSlots(
  canvas: Canvas,
  slots: DesignAnalysis['imageSlots'],
  canvasWidth: number,
  canvasHeight: number,
  sourceDataUri: string | null
): Promise<FabricObject[]> {
  const created: FabricObject[] = []

  // Étape 1: Placer l'image source complète EN ARRIÈRE-PLAN (une seule fois)
  if (sourceDataUri) {
    try {
      const sourceImg = await FabricImage.fromURL(sourceDataUri, { crossOrigin: 'anonymous' })
      const imgW = sourceImg.width || canvasWidth
      const imgH = sourceImg.height || canvasHeight
      sourceImg.set({
        left: 0,
        top: 0,
        scaleX: canvasWidth / imgW,
        scaleY: canvasHeight / imgH,
        originX: 'left',
        originY: 'top',
        selectable: false,
        evented: false,
        hoverCursor: 'default',
      })
      sourceImg.data = { isSourceImage: true }
      canvas.add(sourceImg)
      // Envoyer l'image source en arrière-plan pour que les zones restent visibles par-dessus
      canvas.sendObjectToBack(sourceImg)
    } catch (err) {
      console.warn('[createDesign] Failed to load source image', err)
    }
  }

  // Étape 2: Créer les zones overlay éditables pour chaque slot
  // Ces zones sont des rectangles semi-transparents qui peuvent être modifiés
  for (const s of slots) {
    const { xPx, yPx, wPx, hPx } = bboxToPx(s.bbox, canvasWidth, canvasHeight)

    const rect = new Rect({
      left: xPx,
      top: yPx,
      width: wPx,
      height: hPx,
      fill: 'rgba(99, 102, 241, 0.15)',
      stroke: 'rgba(99, 102, 241, 0.8)',
      strokeDashArray: [8, 4],
      strokeWidth: 2,
      originX: 'left',
      originY: 'top',
      selectable: true,
      hoverCursor: 'pointer',
    })
    rect.data = { id: s.id, editableImageSlot: true, role: s.role, description: s.description }
    canvas.add(rect)
    created.push(rect)
  }

  return created
}

// ─── helpers ─────────────────────────────────────────────────────────────────

function computeLinearGradientCoords(angleDeg: number, w: number, h: number) {
  const rad = (angleDeg * Math.PI) / 180
  const cos = Math.cos(rad)
  const sin = Math.sin(rad)
  // Longueur projetée du gradient sur l'axe de l'angle : garantit que les
  // stops 0 et 1 atteignent bien les bords de la bbox quel que soit le ratio.
  const len = Math.abs(cos * w) + Math.abs(sin * h)
  const cx = w / 2
  const cy = h / 2
  return {
    x1: cx - (cos * len) / 2,
    y1: cy - (sin * len) / 2,
    x2: cx + (cos * len) / 2,
    y2: cy + (sin * len) / 2,
  }
}

function clamp01(v: number): number {
  if (!Number.isFinite(v)) return 0
  return Math.max(0, Math.min(1, v))
}

function decodeImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('Source image load failed'))
    img.src = src
  })
}

function cropFromDecoded(img: HTMLImageElement, bbox: Bbox): string {
  const sx = Math.max(0, (bbox.x / 100) * img.width)
  const sy = Math.max(0, (bbox.y / 100) * img.height)
  const sw = Math.min(img.width - sx, (bbox.w / 100) * img.width)
  const sh = Math.min(img.height - sy, (bbox.h / 100) * img.height)
  if (sw <= 0 || sh <= 0) throw new Error('Crop dimensions invalid')
  const c = document.createElement('canvas')
  c.width = Math.round(sw)
  c.height = Math.round(sh)
  const ctx = c.getContext('2d')
  if (!ctx) throw new Error('2D context unavailable')
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh)
  return c.toDataURL('image/png')
}
