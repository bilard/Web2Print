/**
 * PPTX → Fabric.js
 * Applique les mêmes transformations que l'IDML :
 * - EMU → pixels (proportionnel au canvas)
 * - Couleurs ARGB avec transparence
 * - Texte : styles par paragraphe et par run, alignement, insets
 * - Images : FabricImage avec crop cover
 * - Formes : Rect, Ellipse, Line
 */
import { Rect, Ellipse, Line, Textbox, FabricImage, Triangle, Gradient, Shadow } from 'fabric'
import type { FabricObject } from 'fabric'
import type { PptxSlide, PptxShape, PptxPicture, PptxColor, PptxTextBody, PptxParagraph, PptxGradient, PptxShadow } from './pptxParser'

// ─── Helpers de conversion ────────────────────────────────────────────────────

interface Scale {
  x: number   // canvas px per EMU (horizontal)
  y: number   // canvas px per EMU (vertical)
  font: number // pt multiplier pour les polices
}

function makeScale(slide: PptxSlide, canvasW: number, canvasH: number): Scale {
  const x = canvasW / slide.widthEmu
  const y = canvasH / slide.heightEmu
  // 1 pt = 12700 EMU → les polices sont en pt, on les scale comme les dims verticales
  const font = 12700 * y
  return { x, y, font }
}

function emuX(v: number, s: Scale) { return v * s.x }
function emuY(v: number, s: Scale) { return v * s.y }

function colorToCss(c: PptxColor | null): string {
  if (!c) return 'transparent'
  if (c.alpha >= 1) return c.hex
  const a = Math.round(c.alpha * 255).toString(16).padStart(2, '0')
  return `${c.hex}${a}`
}

// ─── Gradient & Ombre ─────────────────────────────────────────────────────────

function makeLinearGradient(gradient: PptxGradient, w: number, h: number): Gradient<'linear'> {
  // PPTX angle : 0° = droite, 90° = bas (sens horaire)
  const rad = gradient.angle * Math.PI / 180
  const cos = Math.cos(rad)
  const sin = Math.sin(rad)
  const len = Math.abs(cos * w) + Math.abs(sin * h)
  const cx = w / 2, cy = h / 2
  return new Gradient({
    type: 'linear',
    gradientUnits: 'pixels',
    coords: {
      x1: cx - cos * len / 2,
      y1: cy - sin * len / 2,
      x2: cx + cos * len / 2,
      y2: cy + sin * len / 2,
    },
    colorStops: gradient.stops.map((s) => ({ offset: s.position, color: colorToCss(s.color) })),
  })
}

function makeShadow(shadow: PptxShadow, s: Scale): Shadow {
  // Canvas2D shadowBlur est un sigma gaussien — visuellement ~4x plus grand
  // que le blurRad PPTX converti en pixels. On divise par 4 pour compenser.
  return new Shadow({
    color: colorToCss(shadow.color),
    blur: emuX(shadow.blurRad, s) / 4,
    offsetX: emuX(shadow.offsetX, s),
    offsetY: emuY(shadow.offsetY, s),
    affectStroke: false,
    nonScaling: false,
  })
}

// ─── Texte ────────────────────────────────────────────────────────────────────

function buildText(paras: PptxParagraph[]): string {
  return paras.map((p) => p.runs.map((r) => r.text).join('')).join('\n')
}

/**
 * Construit les styles per-run pour Fabric.js
 * Format: { [lineIndex]: { [charIndex]: { ...style } } }
 */
function buildCharStyles(
  paras: PptxParagraph[],
  baseFs: number,
  baseFill: string,
  s: Scale,
): Record<number, Record<number, object>> {
  const result: Record<number, Record<number, object>> = {}
  let lineIdx = 0

  for (const para of paras) {
    let charIdx = 0
    result[lineIdx] = {}

    for (const run of para.runs) {
      const fs = run.sz * s.font
      const fill = run.color ? colorToCss(run.color) : baseFill
      const style: Record<string, unknown> = {}

      if (Math.abs(fs - baseFs) > 0.5) style.fontSize = fs
      if (fill !== baseFill) style.fill = fill
      if (run.bold) style.fontWeight = 'bold'
      if (run.italic) style.fontStyle = 'italic'
      if (run.underline) style.underline = true
      if (run.strike) style.linethrough = true
      if (run.fontFamily) style.fontFamily = run.fontFamily

      for (let i = 0; i < run.text.length; i++) {
        if (Object.keys(style).length > 0) {
          result[lineIdx][charIdx + i] = style
        }
      }
      charIdx += run.text.length
    }
    lineIdx++
  }
  return result
}

function createTextbox(shape: PptxShape, s: Scale): FabricObject[] {
  const { tf, textBody } = shape
  if (!textBody) return []

  const { paragraphs, anchor, insets } = textBody as PptxTextBody
  const text = buildText(paragraphs)
  if (!text.trim()) return []

  const x = emuX(tf.x, s)
  const y = emuY(tf.y, s)
  const w = emuX(tf.cx, s)
  const h = emuY(tf.cy, s)

  const insL = emuX(insets.l, s)
  const insR = emuX(insets.r, s)
  const insT = emuY(insets.t, s)
  const insB = emuY(insets.b, s)

  // Première police / taille de base
  const firstRun = paragraphs[0]?.runs[0]
  const firstPara = paragraphs[0]
  const baseFontSize = (firstRun?.sz ?? 18) * s.font
  const baseFill = firstRun?.color ? colorToCss(firstRun.color) : '#000000'
  const baseFontFamily = firstRun?.fontFamily ?? 'Calibri'
  const alignMap: Record<PptxParagraph['align'], string> = {
    left: 'left', center: 'center', right: 'right', justify: 'justify',
  }
  const textAlign = alignMap[firstPara?.align ?? 'left'] ?? 'left'

  const charStyles = buildCharStyles(paragraphs, baseFontSize, baseFill, s)

  const textW = w - insL - insR

  const tb = new Textbox(text, {
    left: x + insL,
    top: y + insT,
    width: Math.max(textW, 20),
    fontSize: baseFontSize,
    fontFamily: baseFontFamily,
    fill: baseFill,
    textAlign,
    fontWeight: firstRun?.bold ? 'bold' : 'normal',
    fontStyle: firstRun?.italic ? 'italic' : 'normal',
    underline: firstRun?.underline ?? false,
    linethrough: firstRun?.strike ?? false,
    styles: charStyles,
    angle: tf.rot,
    flipX: tf.flipH,
    flipY: tf.flipV,
  })

  // Alignement vertical
  const measured = tb.height ?? 0
  const availH = h - insT - insB
  if (anchor === 'middle') {
    tb.set('top', y + (h - measured) / 2)
  } else if (anchor === 'bottom') {
    tb.set('top', y + h - insB - measured)
  }

  // Fond du cadre de texte (si remplissage ou gradient défini)
  const objects: FabricObject[] = []
  if (shape.fill || shape.fillGradient) {
    const bg = new Rect({
      left: x, top: y, width: w, height: h,
      fill: colorToCss(shape.fill),
      stroke: shape.stroke ? colorToCss(shape.stroke) : '',
      strokeWidth: shape.stroke ? emuX(shape.strokeWidth, s) : 0,
      angle: tf.rot,
      flipX: tf.flipH, flipY: tf.flipV,
      selectable: false,
    })
    if (shape.fillGradient) {
      bg.set('fill', makeLinearGradient(shape.fillGradient, w, h))
    }
    if (shape.shadow) {
      bg.set('shadow', makeShadow(shape.shadow, s))
    }
    objects.push(bg)
  }
  objects.push(tb)
  return objects
}

// ─── Formes géométriques ──────────────────────────────────────────────────────

function createShape(shape: PptxShape, s: Scale): FabricObject[] {
  const { tf, geom, fill, stroke, strokeWidth } = shape
  const x = emuX(tf.x, s)
  const y = emuY(tf.y, s)
  const w = emuX(tf.cx, s)
  const h = emuY(tf.cy, s)
  const sw = stroke ? emuX(strokeWidth, s) : 0

  const common = {
    left: x, top: y,
    fill: colorToCss(fill),
    stroke: colorToCss(stroke),
    strokeWidth: sw,
    angle: tf.rot,
    flipX: tf.flipH, flipY: tf.flipV,
  }

  /** Applique gradient, ombre et data.type sur un objet Fabric après création */
  function applyEffects(obj: FabricObject, objW: number, objH: number, type: string): void {
    if (shape.fillGradient) {
      obj.set('fill', makeLinearGradient(shape.fillGradient, objW, objH))
    }
    if (shape.shadow) {
      obj.set('shadow', makeShadow(shape.shadow, s))
    }
    ;(obj as any).data = { type }
  }

  if (geom === 'triangle') {
    const obj = new Triangle({ ...common, width: w, height: h })
    applyEffects(obj, w, h, 'rect')
    return [obj]
  }

  if (geom === 'ellipse') {
    const obj = new Ellipse({ ...common, rx: w / 2, ry: h / 2 })
    obj.set({ left: x + w / 2, top: y + h / 2, originX: 'center', originY: 'center' })
    applyEffects(obj, w, h, 'rect')
    return [obj]
  }

  if (geom === 'line') {
    const obj = new Line([x, y, x + w, y + h], {
      stroke: colorToCss(stroke ?? fill),
      strokeWidth: sw || 1,
      angle: tf.rot,
    })
    ;(obj as any).data = { type: 'rect' }
    return [obj]
  }

  // roundRect → Rect avec rx/ry
  if (geom === 'roundRect' && shape.cornerAdj > 0) {
    const r = Math.min(w, h) * shape.cornerAdj / 100000
    const obj = new Rect({ ...common, width: w, height: h, rx: r, ry: r })
    applyEffects(obj, w, h, 'rect')
    return [obj]
  }

  // rect / other → Rect
  const obj = new Rect({ ...common, width: w, height: h })
  applyEffects(obj, w, h, 'rect')
  return [obj]
}

// ─── Images ───────────────────────────────────────────────────────────────────

async function createPicture(pic: PptxPicture, s: Scale): Promise<FabricObject[]> {
  const { tf, dataUrl } = pic
  const x = emuX(tf.x, s)
  const y = emuY(tf.y, s)
  const w = emuX(tf.cx, s)
  const h = emuY(tf.cy, s)

  try {
    const img = await FabricImage.fromURL(dataUrl, { crossOrigin: 'anonymous' })
    const natW = img.width ?? 1
    const natH = img.height ?? 1

    // Cover : remplir le cadre en maintenant les proportions
    const coverScale = Math.max(w / natW, h / natH)
    const cropW = Math.min(natW, w / coverScale)
    const cropH = Math.min(natH, h / coverScale)
    const cropX = (natW - cropW) / 2
    const cropY = (natH - cropH) / 2

    img.set({
      left: x, top: y,
      scaleX: coverScale, scaleY: coverScale,
      cropX, cropY,
      width: cropW, height: cropH,
      angle: tf.rot,
      flipX: tf.flipH, flipY: tf.flipV,
    })
    return [img]
  } catch {
    // Placeholder si l'image ne peut pas charger
    const ph = new Rect({
      left: x, top: y, width: w, height: h,
      fill: '#cccccc', stroke: '#999999', strokeWidth: 1,
    })
    return [ph]
  }
}

// ─── Point d'entrée principal ─────────────────────────────────────────────────

export async function pptxToFabricObjects(
  slide: PptxSlide,
  canvasW: number,
  canvasH: number,
): Promise<FabricObject[]> {
  const s = makeScale(slide, canvasW, canvasH)
  const all: FabricObject[] = []

  // Fond blanc de base (comme PowerPoint) — les gradients dont le 1er stop
  // n'est pas à pos=0 créent une zone transparente en Canvas2D ; sur fond blanc
  // cette zone se fond en gris doux, reproduisant le comportement PowerPoint.
  const slideBase = new Rect({
    left: 0, top: 0, width: canvasW, height: canvasH,
    fill: '#ffffff',
    selectable: false,
    evented: false,
  });
  (slideBase as any).data = { isPageBg: true }
  all.push(slideBase)

  // Fond de slide (gradient ou couleur solide par-dessus le blanc)
  if (slide.background || slide.backgroundGradient) {
    const bg = new Rect({
      left: 0, top: 0, width: canvasW, height: canvasH,
      fill: slide.background ? colorToCss(slide.background) : 'transparent',
      selectable: false,
      evented: false,
    })
    if (slide.backgroundGradient) {
      bg.set('fill', makeLinearGradient(slide.backgroundGradient, canvasW, canvasH))
    }
    ;(bg as any).data = { isPageBg: true }
    all.push(bg)
  }

  for (const el of slide.elements) {
    if (el.kind === 'picture') {
      const objs = await createPicture(el, s)
      all.push(...objs)
    } else {
      // Shape avec texte → créer le texte
      const shape = el as PptxShape
      if (shape.textBody && shape.textBody.paragraphs.some((p) => p.runs.some((r) => r.text.trim()))) {
        all.push(...createTextbox(shape, s))
      } else if (shape.fill || shape.stroke) {
        // Forme sans texte
        all.push(...createShape(shape, s))
      }
    }
  }

  return all
}
