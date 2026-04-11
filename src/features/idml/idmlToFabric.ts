/**
 * Converts IdmlObject[] → Fabric.js objects
 *
 * All objects use originX/Y: 'center' so that rotation is applied around the
 * object's true center, matching InDesign's coordinate system.
 *
 * Polygons use svgPath (with Bézier curves) + scaleX/Y props so that the
 * path shape stays in local coordinates while scale/rotation are applied by Fabric.
 */
import { Rect, Ellipse, Line, Textbox, Path, Shadow, FabricImage } from 'fabric'
import type { FabricObject } from 'fabric'
import type { IdmlObject, IdmlColor, IdmlParagraph } from './idmlParser'
import { resolveAvailableFont } from '@/features/assets/useFonts'

/**
 * Extract per-character charSpacing from Fabric styles into a serializable map.
 * Format: { "lineIdx:charIdx": charSpacing }
 * This is needed because Fabric.js stylesToArray merges consecutive chars
 * with different charSpacing (not compared in hasStyleChanged), losing the values.
 */
function extractCharSpacingMap(
  styles: Record<number, Record<number, Record<string, unknown>>>,
): Record<string, number> | null {
  const map: Record<string, number> = {}
  let found = false
  for (const [lineIdx, line] of Object.entries(styles)) {
    for (const [charIdx, style] of Object.entries(line)) {
      if (style.charSpacing !== undefined) {
        map[`${lineIdx}:${charIdx}`] = style.charSpacing as number
        found = true
      }
    }
  }
  return found ? map : null
}

/**
 * Restore per-character charSpacing from a serialized map back into Fabric styles.
 */
function restoreCharSpacingToStyles(textbox: any, map: Record<string, number>): void {
  if (!textbox.styles) textbox.styles = {}
  for (const [key, value] of Object.entries(map)) {
    const [lineIdx, charIdx] = key.split(':').map(Number)
    if (!textbox.styles[lineIdx]) textbox.styles[lineIdx] = {}
    if (!textbox.styles[lineIdx][charIdx]) textbox.styles[lineIdx][charIdx] = {}
    textbox.styles[lineIdx][charIdx].charSpacing = value
  }
}

/**
 * Monkey-patch _getGraphemeBox on a Textbox to support per-character charSpacing.
 * Fabric.js only supports global charSpacing; this override reads 'charSpacing'
 * from per-character styles and applies it individually.
 * If charSpacingMap is provided (from data.charSpacingMap after deserialization),
 * restores the values into styles first.
 * Safe to call multiple times — will not double-patch.
 */
export function patchPerCharSpacing(textbox: FabricObject): void {
  const tb = textbox as any
  if (tb.__perCharSpacingPatched) return

  // Restore charSpacing from data.charSpacingMap if present (after loadFromJSON)
  const csMap = (tb.charSpacingMap ?? tb.data?.charSpacingMap) as Record<string, number> | undefined
  if (csMap) {
    restoreCharSpacingToStyles(tb, csMap)
  }

  const styles = tb.styles as Record<number, Record<number, Record<string, unknown>>> | undefined
  if (!styles) return

  const hasPerCharSpacing = Object.values(styles).some(
    (line: any) => Object.values(line).some((s: any) => s.charSpacing !== undefined)
  )
  if (!hasPerCharSpacing) return



  const origGetGraphemeBox = tb._getGraphemeBox.bind(tb)
  tb._getGraphemeBox = function (
    grapheme: string, lineIndex: number, charIndex: number,
    prevGrapheme?: string, skipLeft?: boolean,
  ) {
    const box = origGetGraphemeBox(grapheme, lineIndex, charIndex, prevGrapheme, skipLeft)
    const charStyle = this.styles?.[lineIndex]?.[charIndex]
    const perCharSpacing = charStyle?.charSpacing as number | undefined

    if (perCharSpacing !== undefined && perCharSpacing !== (this.charSpacing || 0)) {
      const globalCS = this.charSpacing !== 0
        ? (this.fontSize * this.charSpacing) / 1000
        : 0
      const charFontSize = (charStyle?.fontSize as number) ?? this.fontSize
      const perCharCS = (charFontSize * perCharSpacing) / 1000
      const delta = perCharCS - globalCS
      box.width += delta
      box.kernedWidth += delta
    }
    return box
  }
  tb.__perCharSpacingPatched = true
}

function colorToHex(c: IdmlColor | null, fallback = 'transparent'): string {
  if (!c || c.a === 0) return fallback
  const hex = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0')
  return `#${hex(c.r)}${hex(c.g)}${hex(c.b)}`
}

function makeShadow(obj: IdmlObject): Shadow | undefined {
  if (!obj.shadow) return undefined
  if (obj.shadow.blur === 0 && obj.shadow.offsetX === 0 && obj.shadow.offsetY === 0) return undefined
  // Use IDML values directly — no scaling
  const alpha = Math.max(0.01, Math.min(1, obj.shadow.opacity / 100))
  return new Shadow({
    color: `rgba(0,0,0,${alpha.toFixed(2)})`,
    blur: obj.shadow.blur,
    offsetX: obj.shadow.offsetX,
    offsetY: obj.shadow.offsetY,
  })
}

/**
 * Build Fabric.js per-character styles from IdmlParagraph charStyles.
 * Fabric styles format: { lineIndex: { charIndex: { fontSize, fill, deltaY, ... } } }
 */
function buildFabricCharStyles(
  paras: IdmlParagraph[],
  baseScale: number,
  basePara: IdmlParagraph,
): Record<number, Record<number, Record<string, unknown>>> | null {
  const styles: Record<number, Record<number, Record<string, unknown>>> = {}
  let lineIdx = 0
  let charIdx = 0

  // Base style = the textbox-level style (from basePara / firstPara)
  const baseWeight = basePara.fontWeight
  const baseFStyle = basePara.fontStyle
  const baseFamily = resolveAvailableFont(basePara.fontFamily) || 'Arial'
  const baseFontSize = basePara.fontSize
  const baseColor = colorToHex(basePara.color, '#000000')
  const baseTracking = basePara.tracking ?? 0

  for (let p = 0; p < paras.length; p++) {
    const para = paras[p]
    const text = para.text.replace(/\n$/, '')
    const cs = para.charStyles

    // Check if this paragraph's base style differs from textbox base style
    const paraWeight = para.fontWeight
    const paraFStyle = para.fontStyle
    const paraFamily = resolveAvailableFont(para.fontFamily) || 'Arial'
    const paraFontSize = para.fontSize
    const paraColor = colorToHex(para.color, '#000000')

    const paraDiffWeight = paraWeight !== baseWeight
    const paraDiffFStyle = paraFStyle !== baseFStyle
    const paraDiffFamily = paraFamily !== baseFamily
    const paraDiffFontSize = paraFontSize !== baseFontSize
    const paraDiffColor = paraColor !== baseColor
    const paraTracking = para.tracking ?? 0
    const paraDiffTracking = paraTracking !== baseTracking
    const paraHasDiff = paraDiffWeight || paraDiffFStyle || paraDiffFamily || paraDiffFontSize || paraDiffColor || paraDiffTracking

    for (let i = 0; i < text.length; i++) {
      if (text[i] === '\n') {
        lineIdx++
        charIdx = 0
        continue
      }

      const fabricStyle: Record<string, unknown> = {}

      // Start with paragraph-level differences from textbox base
      if (paraHasDiff) {
        if (paraDiffWeight) fabricStyle.fontWeight = paraWeight
        if (paraDiffFStyle) fabricStyle.fontStyle = paraFStyle
        if (paraDiffFamily) fabricStyle.fontFamily = paraFamily
        if (paraDiffFontSize) fabricStyle.fontSize = paraFontSize * baseScale
        if (paraDiffColor) fabricStyle.fill = paraColor
        if (paraDiffTracking) fabricStyle.charSpacing = paraTracking
      }

      // Then apply per-character overrides (these override paragraph-level diffs)
      if (cs && cs[i]) {
        const override = cs[i]
        if (override.invisible) {
          fabricStyle.fill = 'transparent'
          fabricStyle.fontSize = 2
        } else {
          let charFontSize = override.fontSize ? override.fontSize * baseScale : undefined
          // Apply verticalScale as fontSize multiplier (e.g. 70 = 70% height)
          if (override.verticalScale && override.verticalScale !== 100) {
            const baseFSize = charFontSize ?? (fabricStyle.fontSize as number | undefined) ?? basePara.fontSize * baseScale
            charFontSize = baseFSize * (override.verticalScale / 100)
          }
          if (charFontSize) fabricStyle.fontSize = charFontSize
          if (override.deltaY) fabricStyle.deltaY = override.deltaY * baseScale
          if (override.fill) fabricStyle.fill = override.fill
          if (override.linethrough) fabricStyle.linethrough = true
          if (override.fontWeight) fabricStyle.fontWeight = override.fontWeight
          if (override.fontStyle) fabricStyle.fontStyle = override.fontStyle
          if (override.fontFamily) fabricStyle.fontFamily = resolveAvailableFont(override.fontFamily) || override.fontFamily
          if (override.tracking !== undefined) fabricStyle.charSpacing = override.tracking
          // Skew: Fabric.js doesn't support per-character skewX, so we use italic as approximation
          // for moderate skew, and store skewX in data for potential custom rendering
          if (override.skewX) {
            fabricStyle.fontStyle = 'italic'
          }
        }
      }

      if (Object.keys(fabricStyle).length > 0) {
        if (!styles[lineIdx]) styles[lineIdx] = {}
        styles[lineIdx][charIdx] = fabricStyle
      }
      charIdx++
    }

    if (p < paras.length - 1) {
      lineIdx++
      charIdx = 0
    }
  }

  return Object.keys(styles).length > 0 ? styles : null
}

function makeData(obj: IdmlObject, name?: string) {
  return {
    id: obj.id,
    type: obj.type === 'TextFrame' ? 'text'
      : obj.type === 'Oval' ? 'ellipse'
      : obj.type === 'GraphicLine' ? 'line'
      : obj.type === 'Polygon' ? 'path'
      : 'rect',
    name: name ?? obj.type,
    idmlCx: obj.cx,
    idmlCy: obj.cy,
    idmlW: obj.width * Math.abs(obj.scaleX),
    idmlH: obj.height * Math.abs(obj.scaleY),
    localCx: obj.localCenterX,
    localCy: obj.localCenterY,
    // Store original fill color for change detection at export
    originalFillColor: colorToHex(obj.fill),
    // Store page offset so the exporter can convert canvas→spread coordinates
    idmlPageOffsetX: obj.idmlPageOffsetX,
    idmlPageOffsetY: obj.idmlPageOffsetY,
    ...(obj.isAnchored ? { isAnchored: true } : {}),
  }
}

function idmlObjectToFabric(obj: IdmlObject): FabricObject | FabricObject[] | null {
  const displayW = obj.width * obj.scaleX
  const displayH = obj.height * obj.scaleY
  const angle = obj.rotation
  const cx = obj.cx
  const cy = obj.cy

  switch (obj.type) {

    case 'Rectangle': {
      const cr = obj.cornerRadius ? obj.cornerRadius * Math.min(Math.abs(obj.scaleX), Math.abs(obj.scaleY)) : 0
      if (obj.hasImage) {
        // Image placeholder — no rounded corners on images
        return new Rect({
          left: cx, top: cy, originX: 'center', originY: 'center',
          width: displayW, height: displayH, angle,
          fill: '#e0e0e0', stroke: '#aaa', strokeWidth: 0.5,
          shadow: makeShadow(obj),
          data: { ...makeData(obj, obj.imagePath ?? 'Image'), idmlW: displayW, idmlH: displayH },
        })
      }
      const fill = colorToHex(obj.fill)
      const strokeColor = colorToHex(obj.stroke)
      if (fill === 'transparent' && strokeColor === 'transparent') return null
      return new Rect({
        left: cx, top: cy, originX: 'center', originY: 'center',
        width: displayW, height: displayH, angle,
        rx: cr, ry: cr,
        fill,
        stroke: strokeColor === 'transparent' ? undefined : strokeColor,
        strokeWidth: obj.strokeWeight || 0,
        opacity: obj.opacity,
        shadow: makeShadow(obj),
        data: makeData(obj, 'Rectangle'),
      })
    }

    case 'Oval': {
      const fill = colorToHex(obj.fill)
      const strokeColor = colorToHex(obj.stroke)
      if (fill === 'transparent' && strokeColor === 'transparent') return null
      return new Ellipse({
        left: cx, top: cy, originX: 'center', originY: 'center',
        rx: displayW / 2, ry: displayH / 2, angle,
        fill,
        stroke: strokeColor === 'transparent' ? undefined : strokeColor,
        strokeWidth: obj.strokeWeight || 0,
        opacity: obj.opacity,
        shadow: makeShadow(obj),
        data: makeData(obj, 'Ellipse'),
      })
    }

    case 'GraphicLine': {
      return new Line([-displayW / 2, 0, displayW / 2, 0], {
        left: cx, top: cy, originX: 'center', originY: 'center',
        angle,
        stroke: colorToHex(obj.stroke, '#000000'),
        strokeWidth: Math.max(obj.strokeWeight, 0.5),
        fill: '',
        data: makeData(obj, 'Ligne'),
      })
    }

    case 'Polygon': {
      const svgPath = obj.svgPath
      if (!svgPath) return null

      const fill = colorToHex(obj.fill, 'transparent')
      const strokeColor = colorToHex(obj.stroke)

      // Outside stroke alignment: paint stroke first, then fill covers the inner half
      const isOutside = obj.strokeAlignment === 'outside'

      try {
        return new Path(svgPath, {
          left: cx, top: cy,
          originX: 'center', originY: 'center',
          scaleX: obj.scaleX,
          scaleY: obj.scaleY,
          angle,
          fill,
          stroke: strokeColor === 'transparent' ? undefined : strokeColor,
          strokeWidth: isOutside ? (obj.strokeWeight || 0) * 2 : (obj.strokeWeight || 0),
          paintFirst: isOutside ? 'stroke' : 'fill',
          strokeLineJoin: 'round',
          opacity: obj.opacity,
          shadow: makeShadow(obj),
          data: makeData(obj, 'Polygone'),
        })
      } catch (e) {
        console.warn('[idmlToFabric] Path error:', e)
        return null
      }
    }

    case 'TextFrame': {
      const paras = obj.paragraphs ?? []
      const bgFill = colorToHex(obj.fill)

      if (paras.length === 0) {
        // Empty TextFrame with oval/curved path → render as Path shape
        if (obj.frameSvgPath && bgFill !== 'transparent') {
          try {
            return new Path(obj.frameSvgPath, {
              left: cx, top: cy, originX: 'center', originY: 'center',
              scaleX: 1, scaleY: 1, angle: 0,
              fill: bgFill,
              stroke: '', strokeWidth: 0,
              opacity: obj.opacity,
              shadow: makeShadow(obj),
              data: makeData(obj, 'TextFrameBg'),
            })
          } catch { /* fall through */ }
        }
        if (bgFill !== 'transparent') {
          const tfCr = obj.cornerRadius ? obj.cornerRadius * Math.min(Math.abs(obj.scaleX), Math.abs(obj.scaleY)) : 0
          return new Rect({
            left: cx, top: cy, originX: 'center', originY: 'center',
            width: displayW, height: displayH, angle,
            rx: tfCr, ry: tfCr,
            fill: bgFill,
            stroke: '', strokeWidth: 0,
            opacity: obj.opacity,
            shadow: makeShadow(obj),
            data: makeData(obj, 'TextFrameBg'),
          })
        }
        return null
      }

      const fullText = paras.map((p) => p.text.replace(/\n$/, '')).join('\n')
      const firstPara = paras[0]

      // Bake scaleX into width and scaleY into fontSize so Fabric.js wraps text
      // at the correct visual width AND keeps correct vertical proportions.
      const sX = obj.scaleX ?? 1
      const sY = obj.scaleY ?? 1
      const textWidth = Math.max(obj.width * sX, 10)

      // When NestedStyles/explicit charStyles override the first char to a smaller size,
      // use that as the textbox base fontSize (matches InDesign's dominant-char leading).
      // E.g. "Normal:Prix normal" base=37.3pt but "22" (first char) uses Entier Normal=30pt.
      const firstCharOverride = firstPara.charStyles?.[0]?.fontSize
      const effectiveBaseFontSize = (firstCharOverride && firstCharOverride > 0 && firstCharOverride < firstPara.fontSize)
        ? firstCharOverride
        : firstPara.fontSize
      const fontSize = Math.max(effectiveBaseFontSize * sY, 4)

      // Per-character styles need sY applied to font sizes for correct proportions
      const fabricCharStyles = buildFabricCharStyles(paras, sY, firstPara)

      // Always use a separate background shape when TextFrame has a fill
      // (Fabric.js backgroundColor only covers text height, not full InDesign frame)
      const tfCr = obj.cornerRadius ? obj.cornerRadius * Math.min(Math.abs(obj.scaleX), Math.abs(obj.scaleY)) : 0
      const needsSeparateBg = bgFill !== 'transparent'
      const results: FabricObject[] = []

      if (needsSeparateBg) {
        if (obj.frameSvgPath) {
          // Oval/curved background shape
          try {
            const bgShape = new Path(obj.frameSvgPath, {
              left: cx, top: cy, originX: 'center', originY: 'center',
              scaleX: 1, scaleY: 1, angle: 0,
              fill: bgFill,
              stroke: '', strokeWidth: 0,
              opacity: obj.opacity,
              shadow: makeShadow(obj),
              // ID Fabric distinct du Textbox pour éviter les doublons dans le panneau Calques.
              // `idmlRefId` permet à l'exporter de retrouver l'élément IDML d'origine.
              data: { ...makeData(obj, 'TextFrameBg'), type: 'path', id: `${obj.id}__bg`, idmlRefId: obj.id },
            })
            results.push(bgShape)
          } catch (e) {
            console.warn('[idmlToFabric] TextFrame bg path error:', e)
          }
        } else {
          // Rectangular background with rounded corners
          const bgRect = new Rect({
            left: cx, top: cy, originX: 'center', originY: 'center',
            width: displayW, height: displayH, angle,
            rx: tfCr, ry: tfCr,
            fill: bgFill,
            stroke: '', strokeWidth: 0,
            opacity: obj.opacity,
            shadow: makeShadow(obj),
            // Voir commentaire ci-dessus : id distinct + idmlRefId pour le mapping export.
            data: { ...makeData(obj, 'TextFrameBg'), type: 'rect', id: `${obj.id}__bg`, idmlRefId: obj.id },
          })
          results.push(bgRect)
        }
      }

      // Compute lineHeight multiplier from IDML Leading
      // Fabric.js has a single lineHeight for the whole Textbox (= ratio of baseFontSize).
      // InDesign allows per-paragraph leading — each line's leading determines its
      // distance from the previous baseline. For Fabric.js, we must pick one value.
      paras.forEach((p, i) => {
        console.log(`[idmlToFabric] PARA[${i}] "${p.text.slice(0,15)}" fSize=${p.fontSize} leading=${p.lineHeight ?? 'auto'} autoLead=${p.autoLeading ?? 'default'}`)
      })

      let fabricLineHeight: number
      // InDesign convention: the 2nd paragraph's leading controls the gap from line 1 to 2.
      const leadingPara = paras.length >= 2 ? paras[1] : firstPara

      if (leadingPara.lineHeight && leadingPara.lineHeight > 0) {
        // Explicit leading in pt — convert to ratio of base fontSize
        fabricLineHeight = leadingPara.lineHeight / (firstPara.fontSize || 12)
      } else {
        // Auto leading: percentage of the dominant font size.
        // For single-paragraph text with NestedStyles (e.g. "22DT,99": base=37pt but dominant=30pt),
        // use effectiveBaseFontSize so line height matches the actual dominant character.
        // For multi-paragraph text (e.g. "30%\nd'économie"), InDesign uses PARA[N]'s fontSize
        // to control the gap between paragraphs — preserve original logic.
        const autoLead = leadingPara.autoLeading ?? firstPara.autoLeading ?? 120
        const leadingFontSize = (leadingPara === firstPara)
          ? effectiveBaseFontSize   // single para: use dominant char size
          : leadingPara.fontSize    // multi para: use 2nd paragraph's fontSize (original InDesign convention)
        const leadingPt = leadingFontSize * sY * (autoLead / 100)
        fabricLineHeight = leadingPt / (fontSize || 12)
      }
      // Clamp: Fabric.js lineHeight below 0.8 causes text overlap for normal text
      if (fabricLineHeight < 0.8) fabricLineHeight = 0.8

      // Tracking (letter-spacing) from IDML — in 1/1000 em, same unit as Fabric.js charSpacing
      // Global charSpacing = paragraph-level tracking. Per-character overrides are handled
      // by a monkey-patched _getGraphemeBox that reads charSpacing from per-char styles.
      const tracking = firstPara.tracking ?? 0


      // HorizontalScale from IDML (e.g. 75 = 75% width compression)
      const hScale = firstPara.horizontalScale
      const hScaleFactor = hScale ? hScale / 100 : 1

      // Inset margins (scaled to display coords)
      const insT = (obj.insetTop ?? 0) * sY
      const insB = (obj.insetBottom ?? 0) * sY
      const insL = (obj.insetLeft ?? 0) * sX
      const insR = (obj.insetRight ?? 0) * sX
      const hasInsets = insT > 0 || insB > 0 || insL > 0 || insR > 0

      // Reduce text width by horizontal insets
      const insetTextWidth = Math.max(textWidth - insL - insR, 10)
      // When UseNoLineBreaksForAutoSizing is set, InDesign auto-expands the frame
      // to fit all text on one line. Use a very large initial width, then shrink-wrap will reduce it.
      const noBreakWidth = obj.noLineBreaks ? Math.max(insetTextWidth, 5000) : insetTextWidth
      // Apply horizontal scale: compress text via scaleX, expand width to compensate.
      // Add generous buffer to prevent false line-wrapping: Fabric.js measures
      // uncompressed glyphs in the wider box, which can cause wrapping that
      // wouldn't occur in InDesign where glyphs are truly compressed.
      const adjustedWidth = hScaleFactor !== 1
        ? (noBreakWidth / hScaleFactor) + fontSize
        : noBreakWidth

      try {
        const resolvedFont = resolveAvailableFont(firstPara.fontFamily) || 'Arial'
        console.log(`[idmlToFabric] Text "${fullText.slice(0, 20)}" → font="${resolvedFont}" w=${firstPara.fontWeight} hScale=${hScale ?? 100}% tracking=${tracking} lH=${fabricLineHeight.toFixed(2)} fSize=${fontSize} autoLead=${firstPara.autoLeading ?? 'default'}% inset=${insT}/${insR}/${insB}/${insL} vJust=${obj.verticalJustification ?? 'top'}`)

        const textbox = new Textbox(fullText, {
          left: 0, top: 0, originX: 'center', originY: 'center',
          width: adjustedWidth, angle: 0,
          scaleX: hScaleFactor, scaleY: 1,
          fontSize,
          lineHeight: fabricLineHeight,
          charSpacing: tracking,
          fontFamily: resolvedFont,
          fontWeight: firstPara.fontWeight as string,
          fontStyle: firstPara.fontStyle as string,
          fill: colorToHex(firstPara.color, '#000000'),
          textAlign: firstPara.alignment,
          splitByGrapheme: false,
          stroke: '', strokeWidth: 0,
          opacity: obj.opacity,
          backgroundColor: (!needsSeparateBg && bgFill !== 'transparent') ? bgFill : undefined,
          data: { ...makeData(obj, fullText.slice(0, 30) || 'Texte'), idmlPtScale: sY },
          // Pass styles in constructor to prevent Fabric.js from auto-expanding width.
          // Setting styles AFTER construction triggers a min-width enforcement that
          // overrides our carefully computed wrap width (adjustedWidth).
          styles: fabricCharStyles ?? {},
        })

        // styles already set in constructor above — no post-construction assignment needed

        // Build charSpacingMap — simple direct approach
        {
          const csMap: Record<string, number> = {}
          // Single pass: iterate chars of fullText, match to paragraph charStyles
          let globalIdx = 0
          let lineIdx = 0
          let charIdx = 0
          for (const para of paras) {
            const pText = para.text.replace(/\n$/, '')
            const cs = para.charStyles
            for (let i = 0; i < pText.length; i++) {
              const ch = pText[i]
              if (ch === '\n') { lineIdx++; charIdx = 0; globalIdx++; continue }
              // Check charStyles for tracking override at this position
              const override = cs?.[globalIdx]
              const t = override?.tracking
              if (t !== undefined) {
                csMap[`${lineIdx}:${charIdx}`] = t as number
              }
              charIdx++
              globalIdx++
            }
            // Don't increment lineIdx here - fullText.join('\n') handles it
          }
          if (Object.keys(csMap).length > 0) {
            ;(textbox as any).charSpacingMap = csMap
          }
        }

        // Apply per-character charSpacing monkey-patch (for IDML tracking)
        patchPerCharSpacing(textbox)

        // Shrink-wrap: only for center-aligned or noLineBreaks textboxes.
        // For left/right/justify aligned text, the frame width determines alignment edge —
        // shrinking would shift text visually.
        const canShrinkWrap = firstPara.alignment === 'center' || obj.noLineBreaks
        if (canShrinkWrap) {
          const numLines = textbox.textLines?.length ?? 1
          let maxLineW = 0
          for (let li = 0; li < numLines; li++) {
            const lw = (textbox as any).getLineWidth?.(li) ?? 0
            if (lw > maxLineW) maxLineW = lw
          }
          const contentWidth = maxLineW + fontSize * 0.3
          if (contentWidth > 10 && contentWidth < adjustedWidth * 0.95) {
            textbox.set({ width: contentWidth })
            console.log(`[idmlToFabric] Shrink-wrap "${fullText.slice(0, 20)}" width: ${adjustedWidth.toFixed(0)} → ${contentWidth.toFixed(0)}`)
          }
        }

        // Compute vertical + horizontal offset for insets + vertical justification
        // InDesign default is TopAlign — text starts from top of frame
        const textH = textbox.height * (textbox.scaleY ?? 1)
        const vjust = obj.verticalJustification ?? 'top'

        // Horizontal offset from insets
        const localDx = (insL - insR) / 2

        // When hScaleFactor != 1, Fabric.js textH can be inflated by false line-wrapping
        // (wider unscaled box causes wrapping that wouldn't happen in InDesign).
        // In that case, estimate text height from paragraph data.
        // When hScaleFactor == 1, always trust Fabric.js textH — no false wrapping possible.
        let posTextH: number
        if (hScaleFactor !== 1 && textH > displayH) {
          const estimatedTextH = paras.reduce((sum, p) =>
            sum + (p.fontSize * sY) * fabricLineHeight, 0)
          posTextH = estimatedTextH
        } else {
          posTextH = textH
        }

        let localDy = 0
        if (vjust === 'top') {
          // Text top aligns to frame top + insetTop
          localDy = -(displayH / 2) + insT + posTextH / 2
        } else if (vjust === 'center') {
          // Text centered in available area (between insets)
          localDy = (insT - insB) / 2
        } else if (vjust === 'bottom') {
          // Text bottom aligns to frame bottom - insetBottom
          localDy = (displayH / 2) - insB - posTextH / 2
        }

        // Rotate local offset to world coordinates
        const rad = (angle * Math.PI) / 180
        const finalCx = cx + localDx * Math.cos(rad) - localDy * Math.sin(rad)
        const finalCy = cy + localDx * Math.sin(rad) + localDy * Math.cos(rad)

        console.log(`[idmlToFabric] OFFSET "${fullText.slice(0,20)}" vjust=${vjust} displayH=${displayH.toFixed(1)} textH=${textH.toFixed(1)} posTextH=${posTextH.toFixed(1)} insT=${insT.toFixed(1)} insB=${insB.toFixed(1)} insL=${insL.toFixed(1)} insR=${insR.toFixed(1)} localDx=${localDx.toFixed(1)} localDy=${localDy.toFixed(1)} cx=${cx.toFixed(1)}→${finalCx.toFixed(1)} cy=${cy.toFixed(1)}→${finalCy.toFixed(1)}`)

        textbox.set({ left: finalCx, top: finalCy, angle })
        // Override idmlCx/idmlCy to match the actual Fabric position (which includes inset
        // + vertical-justification offsets). The exporter uses (fab.left - idmlCx) as delta,
        const tbData = (textbox as FabricObject & { data: Record<string, unknown> }).data
        tbData.idmlCx = finalCx
        tbData.idmlCy = finalCy
        tbData.idmlW = textbox.width * (textbox.scaleX ?? 1)
        tbData.idmlH = textbox.height * (textbox.scaleY ?? 1)
        tbData.originalTextColor = colorToHex(firstPara.color, '#000000')
        tbData.originalFillColor = bgFill
        tbData.idmlOrigFontSize = fontSize
        results.push(textbox)
      } catch (e) {
        console.warn('[idmlToFabric] Textbox error:', e)
      }

      if (results.length === 0) return null
      if (results.length === 1) return results[0]
      return results
    }

    default:
      return null
  }
}

/**
 * Create a visible placeholder for images that can't be loaded (TIF, PSD, EPS, AI...)
 * Shows a light grey box with a cross and the filename.
 */
function createImagePlaceholder(obj: IdmlObject): FabricObject[] {
  const frameW = obj.width * obj.scaleX
  const frameH = obj.height * obj.scaleY
  const label = obj.imagePath ?? 'Image'

  const bg = new Rect({
    left: obj.cx, top: obj.cy, originX: 'center', originY: 'center',
    width: frameW, height: frameH, angle: obj.rotation,
    fill: '#e8e8e8', stroke: '#bbb', strokeWidth: 0.5,
    shadow: makeShadow(obj),
    data: { id: obj.id, type: 'image', name: label, idmlCx: obj.cx, idmlCy: obj.cy, idmlPageOffsetX: obj.idmlPageOffsetX, idmlPageOffsetY: obj.idmlPageOffsetY },
  })

  // Diagonal cross lines
  const results: FabricObject[] = [bg]
  try {
    const halfW = frameW / 2
    const halfH = frameH / 2
    const crossPath = `M ${-halfW} ${-halfH} L ${halfW} ${halfH} M ${halfW} ${-halfH} L ${-halfW} ${halfH}`
    const cross = new Path(crossPath, {
      left: obj.cx, top: obj.cy, originX: 'center', originY: 'center',
      angle: obj.rotation,
      stroke: '#ccc', strokeWidth: 0.5,
      fill: '', selectable: false, evented: false,
      data: { id: `${obj.id}_cross`, type: 'path', name: 'cross' },
    })
    results.push(cross)
  } catch { /* ignore cross drawing errors */ }

  // Filename label
  try {
    const fontSize = Math.min(12, frameH / 6, frameW / (label.length * 0.6))
      const text = new Textbox(label, {
        left: obj.cx, top: obj.cy, originX: 'center', originY: 'center',
        width: frameW * 0.9, angle: obj.rotation,
        fontSize, fontFamily: 'Arial', fill: '#888',
        textAlign: 'center', selectable: false, evented: false,
        data: { id: `${obj.id}_label`, type: 'text', name: 'label' },
      })
      if (text.data) {
        text.data.idmlW = text.width * (text.scaleX ?? 1)
        text.data.idmlH = text.height * (text.scaleY ?? 1)
      }
      results.push(text)
  } catch { /* ignore text errors */ }

  return results
}

export async function idmlToFabricObjects(
  objects: IdmlObject[],
  imageMap?: Map<string, string>,
): Promise<FabricObject[]> {
  console.log(`[idmlToFabric] imageMap has ${imageMap?.size ?? 0} entries:`, imageMap ? [...imageMap.keys()] : [])
  const result: FabricObject[] = []
  for (const obj of objects) {
    try {
      // For image placeholders, try to load the actual image from assembly
      if (obj.hasImage && obj.imagePath) {
        const blobUrl = imageMap?.get(obj.imagePath) || imageMap?.get(obj.imagePath.toLowerCase())
        if (!blobUrl) {
          console.warn(`[idmlToFabric] Image NOT FOUND in imageMap: "${obj.imagePath}" (lowercase: "${obj.imagePath.toLowerCase()}")`)
          console.warn(`[idmlToFabric] Available keys:`, imageMap ? [...imageMap.keys()] : [])
        }
        if (blobUrl) {
          try {
            const frameW = obj.width * obj.scaleX
            const frameH = obj.height * obj.scaleY
            const img = await FabricImage.fromURL(blobUrl, { crossOrigin: 'anonymous' })
            const imgNatW = img.width ?? frameW
            const imgNatH = img.height ?? frameH

            // Crop IDML-faithful : utilise imageOffsetX/Y + imageScaleX/Y + imageWidth/Height
            // pour reproduire exactement le placement InDesign.
            let cropX: number, cropY: number, cropW: number, cropH: number
            let fabScaleX: number, fabScaleY: number

            const iScaleX = obj.imageScaleX
            const iScaleY = obj.imageScaleY ?? obj.imageScaleX
            const iOffX  = obj.imageOffsetX
            const iOffY  = obj.imageOffsetY ?? obj.imageOffsetX
            const iW     = obj.imageWidth
            const iH     = obj.imageHeight

            // Centre Fabric de l'image : centre de la PORTION VISIBLE (pas le centre du cadre)
            let imgLeft = obj.cx  // canvas X du centre image
            let imgTop  = obj.cy  // canvas Y du centre image

            if (
              iScaleX != null && iScaleX > 0 &&
              iOffX   != null &&
              iW      != null && iW > 0 &&
              iH      != null && iH > 0 &&
              imgNatW > 0 && imgNatH > 0
            ) {
              // Coin haut-gauche du cadre dans le repère local de l'élément
              const localCx = obj.localCenterX ?? 0
              const localCy = obj.localCenterY ?? 0
              const frameLeft  = localCx - obj.width  / 2
              const frameTop   = localCy - obj.height / 2
              const frameRight  = localCx + obj.width  / 2
              const frameBottom = localCy + obj.height / 2

              // Bornes de l'image dans le repère local du cadre
              const iOffY2   = iOffY  ?? 0
              const iScaleY2 = iScaleY ?? iScaleX
              const imgLocalLeft   = iOffX
              const imgLocalTop    = iOffY2
              const imgLocalRight  = iOffX  + iW * iScaleX
              const imgLocalBottom = iOffY2 + iH * iScaleY2

              // Intersection visible : clip de l'image par le cadre
              const visLeft   = Math.max(frameLeft,   imgLocalLeft)
              const visRight  = Math.min(frameRight,  imgLocalRight)
              const visTop    = Math.max(frameTop,    imgLocalTop)
              const visBottom = Math.min(frameBottom, imgLocalBottom)

              if (visRight > visLeft && visBottom > visTop) {
                // Pixels par point IDML
                const pxPerPtX = imgNatW / iW
                const pxPerPtY = imgNatH / iH

                cropX = Math.max(0, (visLeft  - imgLocalLeft) / iScaleX  * pxPerPtX)
                cropY = Math.max(0, (visTop   - imgLocalTop)  / iScaleY2 * pxPerPtY)
                cropW = Math.max(1, Math.min(imgNatW - cropX, (visRight  - visLeft)  / iScaleX  * pxPerPtX))
                cropH = Math.max(1, Math.min(imgNatH - cropY, (visBottom - visTop)   / iScaleY2 * pxPerPtY))

                // Taille de la portion visible dans l'espace canvas (en unités IDML × scale monde)
                const visW_canvas = (visRight  - visLeft)  * (obj.scaleX ?? 1)
                const visH_canvas = (visBottom - visTop)   * (obj.scaleY ?? 1)

                fabScaleX = visW_canvas / cropW
                fabScaleY = visH_canvas / cropH

                // Centre de la portion visible dans le repère local → canvas
                const visCxLocal = (visLeft + visRight)  / 2
                const visCyLocal = (visTop  + visBottom) / 2
                const dxLocal = visCxLocal - localCx  // offset depuis le centre du frame
                const dyLocal = visCyLocal - localCy

                // Appliquer la partie linéaire de la transform monde (rotation + scale)
                const rad  = (obj.rotation * Math.PI) / 180
                const sX   = obj.scaleX ?? 1
                const sY   = obj.scaleY ?? 1
                const cosA = Math.cos(rad), sinA = Math.sin(rad)
                imgLeft = obj.cx + (cosA * dxLocal * sX - sinA * dyLocal * sY)
                imgTop  = obj.cy + (sinA * dxLocal * sX + cosA * dyLocal * sY)

                console.log(`[idmlToFabric] Image IDML: ${obj.imagePath} vis=(${visLeft.toFixed(1)},${visTop.toFixed(1)} ${(visRight-visLeft).toFixed(1)}x${(visBottom-visTop).toFixed(1)}) → crop=(${cropX.toFixed(0)},${cropY.toFixed(0)} ${cropW.toFixed(0)}x${cropH.toFixed(0)}) center=(${imgLeft.toFixed(1)},${imgTop.toFixed(1)}) fabScale=(${fabScaleX.toFixed(4)},${fabScaleY.toFixed(4)})`)
              } else {
                // Image complètement hors cadre → placeholder
                cropX = 0; cropY = 0; cropW = imgNatW; cropH = imgNatH
                fabScaleX = frameW / imgNatW; fabScaleY = frameH / imgNatH
              }
            } else {
              // Fallback : cover centré (pas de données IDML)
              const coverScale = Math.max(frameW / imgNatW, frameH / imgNatH)
              cropW = Math.min(frameW / coverScale, imgNatW)
              cropH = Math.min(frameH / coverScale, imgNatH)
              cropX = Math.max(0, (imgNatW - cropW) / 2)
              cropY = Math.max(0, (imgNatH - cropH) / 2)
              fabScaleX = coverScale
              fabScaleY = coverScale
              console.log(`[idmlToFabric] Image cover-crop (fallback): ${obj.imagePath} nat=${imgNatW}x${imgNatH} crop=(${cropX.toFixed(0)},${cropY.toFixed(0)} ${cropW.toFixed(0)}x${cropH.toFixed(0)}) scale=${coverScale.toFixed(4)}`)
            }

            img.set({
              left: imgLeft, top: imgTop,
              originX: 'center', originY: 'center',
              cropX, cropY,
              width: cropW,
              height: cropH,
              scaleX: fabScaleX,
              scaleY: fabScaleY,
              angle: obj.rotation,
              shadow: makeShadow(obj),
              data: {
                id: obj.id, type: 'image', name: obj.imagePath ?? 'Image',
                idmlCx: imgLeft,
                idmlCy: imgTop,
                idmlW: cropW * fabScaleX,
                idmlH: cropH * fabScaleY,
                localCx: obj.localCenterX,
                localCy: obj.localCenterY,
                idmlPageOffsetX: obj.idmlPageOffsetX,
                idmlPageOffsetY: obj.idmlPageOffsetY,
                // État initial du crop (en pixels source) pour permettre à
                // l'export IDML de calculer un shift relatif si l'utilisateur
                // recadre l'image.
                idmlCropX0: cropX,
                idmlCropY0: cropY,
                idmlCropW0: cropW,
                idmlCropH0: cropH,
              },
            })
            result.push(img)
            continue
          } catch (e) {
            console.warn(`[idmlToFabric] Failed to load image "${obj.imagePath}" (format not supported by browser):`, e)
          }
        }

        // Image couldn't be loaded → always create a visible placeholder
        const placeholders = createImagePlaceholder(obj)
        result.push(...placeholders)
        console.log(`[idmlToFabric] Image placeholder: "${obj.imagePath}" → ${placeholders.length} objects at (${obj.cx.toFixed(0)},${obj.cy.toFixed(0)})`)
        continue
      }

      const fabricObj = idmlObjectToFabric(obj)
      if (fabricObj) {
        if (Array.isArray(fabricObj)) {
          result.push(...fabricObj)
          console.log(`[idmlToFabric] ${obj.type} ${obj.id} → ${fabricObj.length} objects at (${obj.cx.toFixed(0)},${obj.cy.toFixed(0)})`)
        } else {
          result.push(fabricObj)
          console.log(`[idmlToFabric] ${obj.type} ${obj.id} → 1 object at (${obj.cx.toFixed(0)},${obj.cy.toFixed(0)})`)
        }
      } else {
        console.log(`[idmlToFabric] ${obj.type} ${obj.id} → SKIPPED (null) at (${obj.cx.toFixed(0)},${obj.cy.toFixed(0)})`)
      }
    } catch (e) {
      console.warn(`[idmlToFabric] Error converting ${obj.type} ${obj.id}:`, e)
    }
  }
  console.log(`[idmlToFabric] ${result.length} / ${objects.length} objects converted`)
  return result
}
