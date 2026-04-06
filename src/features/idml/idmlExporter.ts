/**
 * IDML Exporter V4 — Patch complet du fichier IDML original.
 *
 * Modifications prises en charge :
 * 1. Texte modifié        → patch des fichiers Story (DOMParser sur les Stories uniquement)
 * 2. Image remplacée      → remplacement du fichier dans Links/
 * 3. Couleur de fond      → patch FillColor dans les Spreads + swatch dans Graphic.xml
 * 4. Position modifiée    → patch ItemTransform dans les Spreads
 * 5. Taille modifiée      → patch PathPointArray / transform enfant des images
 *
 * Stratégie Spreads : remplacement string ciblé (pas de DOMParser/XMLSerializer)
 * pour éviter toute corruption des attributs ou namespaces IDML.
 */

import JSZip from 'jszip'
import type { FabricObject } from 'fabric'

// ─── Types ───────────────────────────────────────────────────────────────────

interface FabricData {
  id?: string
  type?: string
  name?: string
  originalFillColor?: string
  originalTextColor?: string
  idmlCx?: number
  idmlCy?: number
  idmlW?: number
  idmlH?: number
  localCx?: number
  localCy?: number
  idmlPtScale?: number
  idmlOrigFontSize?: number
  idmlPageOffsetX?: number
  idmlPageOffsetY?: number
}

interface PatchableObj {
  id: string
  fillChanged: boolean
  newFill: string
  posChanged: boolean
  newLeft: number
  newTop: number
  newAngle: number
  idmlCx: number
  idmlCy: number
  sizeChanged: boolean
  newDisplayW: number
  newDisplayH: number
  origDisplayW: number
  origDisplayH: number
  localCx: number | null
  localCy: number | null
}

interface StyleSegment {
  startChar: number
  endChar: number
  absoluteFontSize: number | null
  fillHex: string | null
}

interface PerLineStyle {
  absoluteFontSize: number | null
  fillHex: string | null
  segments?: StyleSegment[]
}

interface CsrInfo {
  element: Element
  text: string
  charCount: number
}

interface PsrInfo {
  element: Element
  text: string
  csrs: CsrInfo[]
  internalNewlines: number
  hasTrailingBr: boolean
}

interface StoryPatchOpts {
  lineStyles?: PerLineStyle[]
}

interface ResolvedStyle {
  absoluteFontSize: number | null
  fillHex: string | null
}

interface StyleRun extends ResolvedStyle {
  text: string
}

// ─── Image helpers ───────────────────────────────────────────────────────────

/**
 * Extrait les pixels d'un FabricImage via un canvas temporaire (JPEG qualité 0.92).
 * Utilise les dimensions naturelles de l'élément pour préserver la résolution originale.
 */
async function getImageBytesFromFabric(obj: FabricObject): Promise<Uint8Array | null> {
  try {
    const src = (obj as any).getSrc?.() as string | undefined
    if (src && (src.startsWith('http://') || src.startsWith('https://'))) {
      try {
        const resp = await fetch(src)
        if (resp.ok) {
          return new Uint8Array(await resp.arrayBuffer())
        }
      } catch (fetchErr) {
        console.warn('[IDML Export] fetch échoué, fallback canvas:', fetchErr)
      }
    }

    const el = (obj as any).getElement?.() as HTMLImageElement | HTMLCanvasElement | undefined
    if (!el) return null

    const w = (el as HTMLImageElement).naturalWidth || (el as HTMLCanvasElement).width || 1
    const h = (el as HTMLImageElement).naturalHeight || (el as HTMLCanvasElement).height || 1

    const tmpCanvas = document.createElement('canvas')
    tmpCanvas.width = w
    tmpCanvas.height = h

    const ctx = tmpCanvas.getContext('2d')
    if (!ctx) return null
    ctx.drawImage(el as HTMLImageElement, 0, 0, w, h)

    const blob = await new Promise<Blob | null>((resolve) =>
      tmpCanvas.toBlob(resolve, 'image/jpeg', 0.92),
    )
    if (!blob) return null

    return new Uint8Array(await blob.arrayBuffer())
  } catch (e) {
    console.warn('[IDML Export] getImageBytesFromFabric error:', e)
    return null
  }
}

// ─── Color helpers ───────────────────────────────────────────────────────────

/** Convertit un hex (#rrggbb) en composantes RGB 0–255 */
function hexToRgb(hex: string): [number, number, number] | null {
  const m = hex.replace('#', '').match(/^([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i)
  if (!m) return null
  return [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)]
}

function normalizeHexColor(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const input = value.trim()
  if (!input || input === 'transparent' || input === 'none') return null

  if (/^#[0-9a-f]{3}$/i.test(input)) {
    const chars = input.slice(1).split('')
    return `#${chars.map((ch) => ch + ch).join('').toLowerCase()}`
  }

  if (/^#[0-9a-f]{6}$/i.test(input)) {
    return input.toLowerCase()
  }

  const rgb = input.match(
    /^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})(?:\s*,\s*(\d*\.?\d+))?\s*\)$/i,
  )
  if (!rgb) return null

  const r = Math.max(0, Math.min(255, parseInt(rgb[1], 10)))
  const g = Math.max(0, Math.min(255, parseInt(rgb[2], 10)))
  const b = Math.max(0, Math.min(255, parseInt(rgb[3], 10)))

  const toHex = (n: number) => n.toString(16).padStart(2, '0')
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`
}

function sameResolvedStyle(a: ResolvedStyle, b: ResolvedStyle): boolean {
  return a.absoluteFontSize === b.absoluteFontSize && a.fillHex === b.fillHex
}

/** Self ID du swatch (format IDML interne : "Color/Web2Print_rrggbb") */
function colorSwatchSelf(hex: string): string {
  return `Color/Web2Print_${hex.replace('#', '').toLowerCase()}`
}

/**
 * Ajoute un swatch CMYK dans Graphic.xml s'il n'existe pas déjà.
 * InDesign utilise CMYK pour les documents print — les swatches RGB sont ignorés pour le texte.
 * Retourne [xmlModifié, wasModified].
 */
function addColorSwatchToGraphic(graphicXml: string, hex: string): [string, boolean] {
  const normalized = normalizeHexColor(hex)
  if (!normalized) return [graphicXml, false]

  const self = colorSwatchSelf(normalized)
  if (graphicXml.includes(`Self="${self}"`)) return [graphicXml, false]

  const rgb = hexToRgb(normalized)
  if (!rgb) return [graphicXml, false]

  const [r, g, b] = rgb.map((v) => v / 255)
  const k = 1 - Math.max(r, g, b)
  const denom = 1 - k
  const C = denom > 0 ? Math.round(((1 - r - k) / denom) * 100) : 0
  const M = denom > 0 ? Math.round(((1 - g - k) / denom) * 100) : 0
  const Y = denom > 0 ? Math.round(((1 - b - k) / denom) * 100) : 0
  const K = Math.round(k * 100)

  const name = `Web2Print_${normalized.replace('#', '').toLowerCase()}`
  const swatchXml =
    `\n  <Color Self="${self}" Model="Process" Space="CMYK" ColorValue="${C} ${M} ${Y} ${K}"` +
    ` ColorOverride="Normal" ConvertToHsb="false" AlternateSpace="NoAlternateColor"` +
    ` AlternateColorValue="" Name="${name}" ColorEditable="true" ColorRemovable="true"` +
    ` Visible="true" SwatchCreatorID="7937" />`

  const closingTag = '</idPkg:Graphic>'
  const insertPos = graphicXml.lastIndexOf(closingTag)
  if (insertPos === -1) return [graphicXml, false]

  return [
    graphicXml.slice(0, insertPos) + swatchXml + '\n' + graphicXml.slice(insertPos),
    true,
  ]
}

// ─── Spread patching ─────────────────────────────────────────────────────────

function findElementBlock(
  xml: string,
  selfId: string,
): { tagStart: number; tagEnd: number; block: string } | null {
  const selfStr = `Self="${selfId}"`
  const selfPos = xml.indexOf(selfStr)
  if (selfPos === -1) return null

  let tagStart = selfPos
  while (tagStart > 0 && xml[tagStart] !== '<') tagStart--

  let tagEnd = selfPos + selfStr.length
  while (tagEnd < xml.length && xml[tagEnd] !== '>') tagEnd++
  tagEnd++

  return { tagStart, tagEnd, block: xml.substring(tagStart, tagEnd) }
}

function extractItemTransformFromXml(
  xml: string,
  selfId: string,
): [number, number, number, number, number, number] | null {
  const found = findElementBlock(xml, selfId)
  if (!found) return null

  const match = found.block.match(/\bItemTransform="([^"]*)"/)
  if (!match) return null

  const parts = match[1].trim().split(/\s+/).map(Number)
  if (parts.length !== 6 || parts.some((n) => Number.isNaN(n))) return null

  return parts as [number, number, number, number, number, number]
}

function extractGeometricBoundsFromXml(
  xml: string,
  selfId: string,
): [number, number, number, number] | null {
  const found = findElementBlock(xml, selfId)
  if (!found) return null

  const match = found.block.match(/\bGeometricBounds="([^"]*)"/)
  if (!match) return null

  const parts = match[1].trim().split(/\s+/).map(Number)
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n))) return null

  return parts as [number, number, number, number]
}

function patchElementAttribute(
  xml: string,
  selfId: string,
  attrName: string,
  newValue: string,
): string {
  const found = findElementBlock(xml, selfId)
  if (!found) return xml

  const { tagStart, tagEnd, block } = found
  const attrRegex = new RegExp(`\\b${attrName}="([^"]*)"`)

  let patched: string
  if (attrRegex.test(block)) {
    patched = block.replace(attrRegex, `${attrName}="${newValue}"`)
  } else {
    const closePos = block.lastIndexOf('>')
    const isSelfClosing = closePos > 0 && block[closePos - 1] === '/'
    const insertAt = isSelfClosing ? closePos - 1 : closePos
    patched = block.slice(0, insertAt) + ` ${attrName}="${newValue}"` + block.slice(insertAt)
  }

  return xml.substring(0, tagStart) + patched + xml.substring(tagEnd)
}

// ─── XML helpers (pour Stories uniquement) ──────────────────────────────────

function parseXml(xml: string): Document {
  return new DOMParser().parseFromString(xml, 'application/xml')
}

function serializeXml(doc: Document, originalXml: string): string {
  const serialized = new XMLSerializer().serializeToString(doc)
  const declMatch = originalXml.match(/^(<\?xml[^?]*\?>)\s*/)
  if (declMatch && !serialized.startsWith('<?xml')) {
    return declMatch[1] + '\n' + serialized
  }
  return serialized
}

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

function cleanText(t: string): string {
  return t.replace(/[\ufeff\u200b\u200c\u200d]/g, '').replace(/\u2028/g, '\n')
}

function serializeNode(node: Node): string {
  return new XMLSerializer().serializeToString(node)
}

function replaceElementWithNodes(target: Element, replacements: Element[]): void {
  const parent = target.parentNode
  if (!parent) return

  for (const replacement of replacements) {
    parent.insertBefore(replacement, target)
  }
  parent.removeChild(target)
}

function parseCsrFragment(fragment: string): Element[] {
  const doc = parseXml(`<Root>${fragment}</Root>`)
  const root = doc.documentElement
  return directChildren(root, 'CharacterStyleRange')
}

// ─── PathPointArray patching (taille des formes) ────────────────────────────

function applyGeoBoundsUpdate(
  se: { xml: string; modified: boolean },
  selfId: string,
  newDisplayW: number,
  newDisplayH: number,
  origDisplayW: number,
  origDisplayH: number,
  localCx: number,
  localCy: number,
): boolean {
  if (Math.abs(newDisplayW - origDisplayW) <= 0.5 && Math.abs(newDisplayH - origDisplayH) <= 0.5) return false

  const selfIdx = se.xml.indexOf(`Self="${selfId}"`)
  if (selfIdx < 0) return false

  const paStart = se.xml.indexOf('<PathPointArray>', selfIdx)
  if (paStart < 0) return false
  const paEnd = se.xml.indexOf('</PathPointArray>', paStart)
  if (paEnd < 0) return false

  const nextSelf = se.xml.indexOf('Self="', selfIdx + 6)
  if (nextSelf > 0 && paStart > nextSelf) return false

  const paFull = se.xml.slice(paStart, paEnd + '</PathPointArray>'.length)
  const scaleX = origDisplayW > 0.001 ? newDisplayW / origDisplayW : 1
  const scaleY = origDisplayH > 0.001 ? newDisplayH / origDisplayH : 1

  const updated = paFull.replace(
    /(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)/g,
    (_, xs, ys) => {
      const nx = localCx + (parseFloat(xs) - localCx) * scaleX
      const ny = localCy + (parseFloat(ys) - localCy) * scaleY
      return `${nx.toFixed(8)} ${ny.toFixed(8)}`
    },
  )

  if (updated === paFull) return false

  se.xml = se.xml.slice(0, paStart) + updated + se.xml.slice(paEnd + '</PathPointArray>'.length)
  se.modified = true
  return true
}

function scaleImageChildTransform(
  se: { xml: string; modified: boolean },
  frameId: string,
  scaleX: number,
  scaleY: number,
  localCx: number,
  localCy: number,
): void {
  const selfIdx = se.xml.indexOf(`Self="${frameId}"`)
  if (selfIdx < 0) return

  let rectStart = selfIdx
  while (rectStart > 0 && se.xml[rectStart] !== '<') rectStart--

  const rectEnd = se.xml.indexOf('</Rectangle>', rectStart)
  if (rectEnd < 0) return

  const rectClose = rectEnd + '</Rectangle>'.length
  const rectXml = se.xml.slice(rectStart, rectClose)
  const patchedRect = rectXml.replace(
    /<Image\b([^>]*?)\bItemTransform="([^"]+)"([^>]*)>/,
    (_full, before, transformValue, after) => {
      const parts = transformValue.trim().split(/\s+/).map(Number)
      if (parts.length !== 6 || parts.some((n) => Number.isNaN(n))) {
        return `<Image${before}ItemTransform="${transformValue}"${after}>`
      }
      const a = parts[0] * scaleX
      const b = parts[1]
      const c = parts[2]
      const d = parts[3] * scaleY
      const tx = localCx + (parts[4] - localCx) * scaleX
      const ty = localCy + (parts[5] - localCy) * scaleY
      const nextTransform = [a, b, c, d, tx, ty].map((n) => Number(n.toFixed(6))).join(' ')
      return `<Image${before}ItemTransform="${nextTransform}"${after}>`
    },
  )

  if (patchedRect === rectXml) return
  se.xml = se.xml.slice(0, rectStart) + patchedRect + se.xml.slice(rectClose)
  se.modified = true
}

// ─── Fabric per-line styles ─────────────────────────────────────────────────

function extractPerLineFabricStyles(
  fabricObj: FabricObject,
  fabricText: string,
): PerLineStyle[] {
  const lines = fabricText.split('\n')
  const textObj = fabricObj as FabricObject & {
    styles?: Record<number, Record<number, Record<string, unknown>>>
    fontSize?: number
    fill?: unknown
  }

  const baseFontSize = typeof textObj.fontSize === 'number' ? textObj.fontSize : null
  const baseFill = normalizeHexColor(textObj.fill)
  const styles = textObj.styles ?? {}

  return lines.map((lineText, lineIndex) => {
    const lineStyles = styles[lineIndex] ?? {}
    const explicitEntries = Object.entries(lineStyles)
      .map(([key, value]) => [Number(key), value] as const)
      .filter(([idx, value]) => Number.isInteger(idx) && idx >= 0 && idx < lineText.length && !!value)

    if (explicitEntries.length === 0 || lineText.length === 0) {
      return { absoluteFontSize: null, fillHex: null }
    }

    const resolvedPerChar: ResolvedStyle[] = []
    for (let charIndex = 0; charIndex < lineText.length; charIndex++) {
      const style = lineStyles[charIndex] ?? {}
      const absoluteFontSize =
        typeof style.fontSize === 'number'
          ? style.fontSize
          : baseFontSize
      const fillHex =
        normalizeHexColor(style.fill) ??
        baseFill

      resolvedPerChar.push({ absoluteFontSize, fillHex })
    }

    const first = resolvedPerChar[0]
    const isUniform = resolvedPerChar.every((style) => sameResolvedStyle(style, first))
    if (isUniform) {
      return {
        absoluteFontSize: first.absoluteFontSize,
        fillHex: first.fillHex,
      }
    }

    const segments: StyleSegment[] = []
    let segStart = 0

    for (let i = 1; i <= resolvedPerChar.length; i++) {
      const isBoundary =
        i === resolvedPerChar.length ||
        !sameResolvedStyle(resolvedPerChar[i - 1], resolvedPerChar[i])

      if (!isBoundary) continue

      const style = resolvedPerChar[i - 1]
      segments.push({
        startChar: segStart,
        endChar: i - 1,
        absoluteFontSize: style.absoluteFontSize,
        fillHex: style.fillHex,
      })
      segStart = i
    }

    return {
      absoluteFontSize: null,
      fillHex: null,
      segments,
    }
  })
}

// ─── Story text extraction ──────────────────────────────────────────────────

function extractStoryStructure(storyEl: Element): PsrInfo[] {
  const result: PsrInfo[] = []
  const psrList = directChildren(storyEl, 'ParagraphStyleRange')

  for (const psr of psrList) {
    const csrs: CsrInfo[] = []
    let rawText = ''
    let totalBrCount = 0

    for (const csrEl of directChildren(psr, 'CharacterStyleRange')) {
      let csrText = ''
      let csrCharCount = 0

      for (let n = 0; n < csrEl.childNodes.length; n++) {
        const child = csrEl.childNodes[n]
        if (child.nodeType !== 1) continue

        const tag = (child as Element).tagName
        if (tag === 'Content') {
          const t = child.textContent ?? ''
          csrText += t
          csrCharCount += t.length
        } else if (tag === 'Br') {
          csrText += '\n'
          totalBrCount++
        }
      }

      csrs.push({ element: csrEl, text: csrText, charCount: csrCharCount })
      rawText += csrText
    }

    const hasTrailingBr = rawText.endsWith('\n')
    const text = hasTrailingBr ? rawText.slice(0, -1) : rawText
    const internalNewlines = hasTrailingBr ? totalBrCount - 1 : totalBrCount

    result.push({ element: psr, text, csrs, internalNewlines, hasTrailingBr })
  }

  return result
}

// ─── CSR content replacement ─────────────────────────────────────────────────

function extractCsrRawText(csr: Element): string {
  let text = ''

  for (let i = 0; i < csr.childNodes.length; i++) {
    const child = csr.childNodes[i]
    if (child.nodeType !== 1) continue

    const tag = (child as Element).tagName
    if (tag === 'Content') text += child.textContent ?? ''
    else if (tag === 'Br') text += '\n'
  }

  return text
}

function clearCsrTextNodes(csr: Element): void {
  const toRemove: Node[] = []

  for (let i = 0; i < csr.childNodes.length; i++) {
    const child = csr.childNodes[i]
    if (child.nodeType !== 1) continue

    const tag = (child as Element).tagName
    if (tag === 'Content' || tag === 'Br') toRemove.push(child)
  }

  for (const node of toRemove) csr.removeChild(node)
}

function replaceCsrContent(doc: Document, csr: Element, newText: string): void {
  clearCsrTextNodes(csr)

  const parts = newText.split('\n')
  for (let i = 0; i < parts.length; i++) {
    if (i > 0) csr.appendChild(doc.createElement('Br'))
    const content = doc.createElement('Content')
    content.textContent = parts[i]
    csr.appendChild(content)
  }
}

function applyResolvedStyleToCsr(csr: Element, style: ResolvedStyle): void {
  if (style.absoluteFontSize != null) {
    csr.setAttribute('PointSize', String(style.absoluteFontSize))
  }
  if (style.fillHex) {
    csr.setAttribute('FillColor', colorSwatchSelf(style.fillHex))
  }
}

function cloneStyledCsr(
  doc: Document,
  source: Element,
  text: string,
  style: ResolvedStyle,
): Element {
  const clone = source.cloneNode(true) as Element
  replaceCsrContent(doc, clone, text)
  applyResolvedStyleToCsr(clone, style)
  return clone
}

// ─── PSR text update ─────────────────────────────────────────────────────────

function updatePsrText(doc: Document, psr: PsrInfo, newText: string): void {
  if (psr.csrs.length === 0) return

  if (psr.csrs.length === 1) {
    replaceCsrContent(doc, psr.csrs[0].element, psr.hasTrailingBr ? newText + '\n' : newText)
    return
  }

  const blocks: number[][] = []
  const brOnlyIndices: number[] = []
  let currentBlock: number[] = []

  for (let i = 0; i < psr.csrs.length; i++) {
    const csr = psr.csrs[i]
    if (csr.charCount === 0 && csr.text === '\n') {
      if (currentBlock.length > 0) {
        blocks.push(currentBlock)
        currentBlock = []
      }
      brOnlyIndices.push(i)
    } else {
      currentBlock.push(i)
    }
  }

  if (currentBlock.length > 0) blocks.push(currentBlock)

  if (brOnlyIndices.length === 0) {
    const textWithTrailing = psr.hasTrailingBr ? newText + '\n' : newText
    const oldRawLen = psr.csrs.reduce((sum, c) => sum + c.text.length, 0)

    if (oldRawLen === textWithTrailing.length) {
      let offset = 0
      for (const csr of psr.csrs) {
        replaceCsrContent(
          doc,
          csr.element,
          textWithTrailing.substring(offset, offset + csr.text.length),
        )
        offset += csr.text.length
      }
    } else {
      replaceCsrContent(doc, psr.csrs[0].element, textWithTrailing)
      for (let i = 1; i < psr.csrs.length; i++) {
        replaceCsrContent(doc, psr.csrs[i].element, '')
      }
    }

    return
  }

  const blockInternalNl = blocks.map((block) => {
    let count = 0
    for (const idx of block) {
      for (const ch of psr.csrs[idx].text) {
        if (ch === '\n') count++
      }
    }
    return count
  })

  const newLines = newText.split('\n')
  let lineIdx = 0

  for (let b = 0; b < blocks.length; b++) {
    const linesNeeded = blockInternalNl[b] + 1
    let blockText: string

    if (lineIdx + linesNeeded <= newLines.length) {
      blockText = newLines.slice(lineIdx, lineIdx + linesNeeded).join('\n')
      lineIdx += linesNeeded
    } else if (lineIdx < newLines.length) {
      blockText = newLines.slice(lineIdx).join('\n')
      lineIdx = newLines.length
    } else {
      blockText = ''
    }

    if (b === blocks.length - 1 && lineIdx < newLines.length) {
      blockText += '\n' + newLines.slice(lineIdx).join('\n')
      lineIdx = newLines.length
    }

    const csrIndices = blocks[b]
    if (csrIndices.length === 1) {
      replaceCsrContent(doc, psr.csrs[csrIndices[0]].element, blockText)
      continue
    }

    const totalOldLen = csrIndices.reduce((sum, idx) => sum + psr.csrs[idx].charCount, 0)
    if (blockText.length === totalOldLen) {
      let offset = 0
      for (const idx of csrIndices) {
        replaceCsrContent(
          doc,
          psr.csrs[idx].element,
          blockText.substring(offset, offset + psr.csrs[idx].charCount),
        )
        offset += psr.csrs[idx].charCount
      }
    } else {
      replaceCsrContent(doc, psr.csrs[csrIndices[0]].element, blockText)
      for (let i = 1; i < csrIndices.length; i++) {
        replaceCsrContent(doc, psr.csrs[csrIndices[i]].element, '')
      }
    }
  }
}

// ─── Distribution du texte entre PSRs ───────────────────────────────────────

function splitTextByPsrStructure(psrs: PsrInfo[], fabricText: string): string[] {
  if (psrs.length === 1) return [fabricText]

  const lines = fabricText.split('\n')
  let lineIdx = 0
  const result: string[] = []

  for (const psr of psrs) {
    const linesNeeded = psr.internalNewlines + 1
    if (lineIdx + linesNeeded <= lines.length) {
      result.push(lines.slice(lineIdx, lineIdx + linesNeeded).join('\n'))
      lineIdx += linesNeeded
    } else if (lineIdx < lines.length) {
      result.push(lines.slice(lineIdx).join('\n'))
      lineIdx = lines.length
    } else {
      result.push('')
    }
  }

  if (lineIdx < lines.length) {
    const extra = lines.slice(lineIdx).join('\n')
    if (result.length > 0) result[result.length - 1] += '\n' + extra
    else result.push(extra)
  }

  while (result.length < psrs.length) result.push('')
  return result
}

// ─── Story style helpers ────────────────────────────────────────────────────

function buildLineStartPositions(lines: string[]): number[] {
  const starts: number[] = []
  let pos = 0

  for (let i = 0; i < lines.length; i++) {
    starts.push(pos)
    pos += lines[i].length
    if (i < lines.length - 1) pos += 1
  }

  return starts
}

function findLineIndexForAbsPos(lineStarts: number[], lines: string[], absPos: number): number {
  for (let i = lineStarts.length - 1; i >= 0; i--) {
    if (absPos >= lineStarts[i]) return i
  }
  return 0
}

function hasLineStyleData(lineStyle: PerLineStyle | undefined): boolean {
  if (!lineStyle) return false
  return (
    lineStyle.absoluteFontSize != null ||
    lineStyle.fillHex != null ||
    (lineStyle.segments?.length ?? 0) > 0
  )
}

function resolveStyleAtPosition(
  lineStyles: PerLineStyle[],
  lineStarts: number[],
  lines: string[],
  absPos: number,
  ch: string,
): ResolvedStyle | null {
  if (ch === '\n') return null

  const lineIndex = findLineIndexForAbsPos(lineStarts, lines, absPos)
  const lineStart = lineStarts[lineIndex] ?? 0
  const lineText = lines[lineIndex] ?? ''
  const charIndex = absPos - lineStart

  if (charIndex < 0 || charIndex >= lineText.length) return null

  const lineStyle = lineStyles[lineIndex]
  if (!lineStyle) return null

  if (lineStyle.segments?.length) {
    for (const segment of lineStyle.segments) {
      if (charIndex >= segment.startChar && charIndex <= segment.endChar) {
        return {
          absoluteFontSize: segment.absoluteFontSize,
          fillHex: segment.fillHex,
        }
      }
    }
    return null
  }

  if (lineStyle.absoluteFontSize == null && lineStyle.fillHex == null) {
    return null
  }

  return {
    absoluteFontSize: lineStyle.absoluteFontSize,
    fillHex: lineStyle.fillHex,
  }
}

function splitCsrBySegments(
  csrXml: string,
  segments: StyleSegment[],
  bomStart: boolean,
  bomEnd: boolean,
): string {
  if (segments.length === 0) return csrXml

  const doc = parseXml(`<Root>${csrXml}</Root>`)
  const csr = directChildren(doc.documentElement, 'CharacterStyleRange')[0]
  if (!csr) return csrXml

  const rawText = extractCsrRawText(csr)
  const coreText = rawText.slice(bomStart ? 1 : 0, bomEnd ? -1 : undefined)
  const maxSegEnd = Math.max(...segments.map((segment) => segment.endChar))
  if (maxSegEnd >= coreText.length) return csrXml

  const serializer = new XMLSerializer()
  const clones: string[] = []

  segments.forEach((segment, index) => {
    const textStart = segment.startChar
    const textEnd = segment.endChar + 1
    let text = coreText.slice(textStart, textEnd)
    if (bomStart && index === 0) text = '\ufeff' + text
    if (bomEnd && index === segments.length - 1) text += '\ufeff'

    const clone = csr.cloneNode(true) as Element
    replaceCsrContent(doc, clone, text)
    applyResolvedStyleToCsr(clone, {
      absoluteFontSize: segment.absoluteFontSize,
      fillHex: segment.fillHex,
    })
    clones.push(serializer.serializeToString(clone))
  })

  return clones.join('')
}

function buildStyleRunsForCoreText(
  coreText: string,
  storyStartPos: number,
  lineStarts: number[],
  lines: string[],
  lineStyles: PerLineStyle[],
): StyleRun[] {
  const runs: StyleRun[] = []

  for (let i = 0; i < coreText.length; i++) {
    const ch = coreText[i]
    const style = resolveStyleAtPosition(lineStyles, lineStarts, lines, storyStartPos + i, ch)
    const nextStyle = style ?? { absoluteFontSize: null, fillHex: null }

    const prev = runs[runs.length - 1]
    if (
      prev &&
      prev.absoluteFontSize === nextStyle.absoluteFontSize &&
      prev.fillHex === nextStyle.fillHex
    ) {
      prev.text += ch
    } else {
      runs.push({
        text: ch,
        absoluteFontSize: nextStyle.absoluteFontSize,
        fillHex: nextStyle.fillHex,
      })
    }
  }

  return runs
}

function splitCsrElementWithStyles(
  doc: Document,
  csr: Element,
  storyStartPos: number,
  lineStarts: number[],
  lines: string[],
  lineStyles: PerLineStyle[],
): Element[] {
  const rawText = extractCsrRawText(csr)
  if (!rawText) return [csr]

  const bomStart = rawText.startsWith('\ufeff')
  const bomEnd = rawText.endsWith('\ufeff')
  const coreText = rawText.slice(bomStart ? 1 : 0, bomEnd ? -1 : undefined)
  if (!coreText) return [csr]

  const startLine = findLineIndexForAbsPos(lineStarts, lines, storyStartPos)
  const endLine = findLineIndexForAbsPos(
    lineStarts,
    lines,
    storyStartPos + Math.max(0, coreText.length - 1),
  )

  if (
    startLine === endLine &&
    storyStartPos === (lineStarts[startLine] ?? 0) &&
    coreText.length === (lines[startLine] ?? '').length &&
    lineStyles[startLine]?.segments?.length
  ) {
    const splitXml = splitCsrBySegments(
      serializeNode(csr),
      lineStyles[startLine].segments ?? [],
      bomStart,
      bomEnd,
    )
    const fragmentNodes = parseCsrFragment(splitXml)
    if (fragmentNodes.length > 0) {
      return fragmentNodes.map((node) => doc.importNode(node, true) as Element)
    }
  }

  const runs = buildStyleRunsForCoreText(coreText, storyStartPos, lineStarts, lines, lineStyles)
  if (runs.length === 0) return [csr]

  const hasAnyStyle = runs.some(
    (run) => run.absoluteFontSize != null || run.fillHex != null,
  )
  if (!hasAnyStyle) return [csr]

  const clones = runs.map((run, index) => {
    let text = run.text
    if (bomStart && index === 0) text = '\ufeff' + text
    if (bomEnd && index === runs.length - 1) text += '\ufeff'
    return cloneStyledCsr(doc, csr, text, run)
  })

  return clones
}

function applyStylesToStory(
  doc: Document,
  storyEl: Element,
  fabricText: string,
  lineStyles: PerLineStyle[],
): void {
  const lines = fabricText.split('\n')
  const lineStartPos = buildLineStartPositions(lines)
  const psrs = directChildren(storyEl, 'ParagraphStyleRange')
  let storyPos = 0

  for (const psr of psrs) {
    const csrs = directChildren(psr, 'CharacterStyleRange')

    for (const csr of csrs) {
      const rawText = extractCsrRawText(csr)
      if (!rawText) continue

      const bomStart = rawText.startsWith('\ufeff')
      const bomEnd = rawText.endsWith('\ufeff')
      const coreText = rawText.slice(bomStart ? 1 : 0, bomEnd ? -1 : undefined)
      const coreLength = coreText.length
      if (coreLength === 0) continue

      const csrStartPos = storyPos
      const csrEndPos = storyPos + coreLength
      const startLine = findLineIndexForAbsPos(lineStartPos, lines, csrStartPos)
      const endLine = findLineIndexForAbsPos(lineStartPos, lines, Math.max(csrStartPos, csrEndPos - 1))

      let shouldApply = false
      for (let lineIndex = startLine; lineIndex <= endLine; lineIndex++) {
        if (hasLineStyleData(lineStyles[lineIndex])) {
          shouldApply = true
          break
        }
      }

      if (shouldApply) {
        const replacementNodes = splitCsrElementWithStyles(
          doc,
          csr,
          csrStartPos,
          lineStartPos,
          lines,
          lineStyles,
        )
        if (replacementNodes.length > 1 || replacementNodes[0] !== csr) {
          replaceElementWithNodes(csr, replacementNodes)
        } else if (replacementNodes[0] === csr) {
          const lineStyle = lineStyles[startLine]
          if (
            startLine === endLine &&
            lineStyle &&
            !lineStyle.segments?.length &&
            (lineStyle.absoluteFontSize != null || lineStyle.fillHex != null)
          ) {
            applyResolvedStyleToCsr(csr, lineStyle)
          }
        }
      }

      storyPos += coreLength
    }
  }
}

// ─── Patch d'une Story ──────────────────────────────────────────────────────

function patchStory(
  storyXml: string,
  fabricText: string,
  opts: StoryPatchOpts = {},
): string {
  const doc = parseXml(storyXml)
  const storyEl = doc.getElementsByTagName('Story')[0]
  if (!storyEl) return storyXml

  const psrs = extractStoryStructure(storyEl)
  if (psrs.length === 0) return storyXml

  const fullOriginal = psrs.map((psr) => psr.text).join('\n')
  const lineStyles = opts.lineStyles ?? []
  const hasAnyLineStyle = lineStyles.some(
    (lineStyle) =>
      lineStyle.absoluteFontSize != null ||
      lineStyle.fillHex != null ||
      (lineStyle.segments?.length ?? 0) > 0,
  )

  if (cleanText(fullOriginal) !== cleanText(fabricText)) {
    const newPsrTexts = splitTextByPsrStructure(psrs, fabricText)
    for (let i = 0; i < psrs.length; i++) {
      const newText = i < newPsrTexts.length ? newPsrTexts[i] : ''
      if (cleanText(psrs[i].text) !== cleanText(newText)) {
        updatePsrText(doc, psrs[i], newText)
      }
    }
  } else if (!hasAnyLineStyle) {
    return storyXml
  }

  if (hasAnyLineStyle) {
    const lines = fabricText.split('\n')
    const lineStartPos = buildLineStartPositions(lines)
    void lineStartPos
    for (let i = 0; i < lineStyles.length; i++) {
      const lineStyle = lineStyles[i]
      if (!lineStyle) continue

      const segmentInfo = lineStyle.segments?.length
        ? `, segments=${lineStyle.segments.length}`
        : ''
      void segmentInfo
    }

    const updatedStoryEl = doc.getElementsByTagName('Story')[0]
    if (updatedStoryEl) {
      applyStylesToStory(doc, updatedStoryEl, fabricText, lineStyles)
    }
  }

  return serializeXml(doc, storyXml)
}

// ─── Export principal ────────────────────────────────────────────────────────

export interface FillImageFile {
  name: string
  bytes: Uint8Array
}

export async function exportIdmlModified(
  rawBuffer: ArrayBuffer,
  fabricObjects: FabricObject[],
): Promise<{ idmlBlob: Blob; fillImages: FillImageFile[] }> {
  const fillImageFiles: FillImageFile[] = []
  const zip = await JSZip.loadAsync(rawBuffer)

  const textboxMap = new Map<string, FabricObject>()
  const imageMap = new Map<string, FabricObject>()
  const patchableObjects: PatchableObj[] = []

  for (const obj of fabricObjects) {
    const fab = obj as FabricObject & {
      data?: FabricData
      type?: string
      left?: number
      top?: number
      angle?: number
      width?: number
      height?: number
      scaleX?: number
      scaleY?: number
      fill?: string
    }

    const id = fab.data?.id
    if (!id) continue

    if ((fab.type === 'textbox' || fab.type === 'i-text') && fab.data?.type === 'text') {
      textboxMap.set(id, obj)
      continue
    }

    if (fab.type === 'image' && fab.data?.type === 'image' && fab.data.name) {
      imageMap.set(id, obj)
      continue
    }

    if (!fab.data?.type || fab.data.type === 'text' || fab.data.type === 'image') continue

    const rawFill = fab.fill
    // Pattern/Gradient fills are not exportable as IDML color — treat as unchanged
    const currentFill = typeof rawFill === 'string' ? rawFill : null
    const origFill = fab.data.originalFillColor
    const fillChanged = Boolean(
      currentFill &&
      origFill !== undefined &&
      currentFill !== origFill &&
      currentFill !== 'transparent' &&
      currentFill !== '',
    )

    const idmlCx = fab.data.idmlCx
    const idmlCy = fab.data.idmlCy
    const center = fab.getCenterPoint()
    const newLeft = center.x
    const newTop = center.y
    const posChanged =
      idmlCx != null &&
      idmlCy != null &&
      (Math.abs(newLeft - idmlCx) > 0.5 || Math.abs(newTop - idmlCy) > 0.5)

    const newDisplayW = (fab.width ?? 0) * (fab.scaleX ?? 1)
    const newDisplayH = (fab.height ?? 0) * (fab.scaleY ?? 1)
    const origDisplayW = fab.data.idmlW ?? newDisplayW
    const origDisplayH = fab.data.idmlH ?? newDisplayH
    const localCx = fab.data.localCx ?? null
    const localCy = fab.data.localCy ?? null
    const sizeChanged =
      fab.data.idmlW != null &&
      fab.data.idmlH != null &&
      localCx != null &&
      localCy != null &&
      (
        Math.abs(newDisplayW - fab.data.idmlW) > 0.5 ||
        Math.abs(newDisplayH - fab.data.idmlH) > 0.5
      )

    if (fillChanged || posChanged || sizeChanged) {
      patchableObjects.push({
        id,
        fillChanged,
        newFill: currentFill ?? '',
        posChanged,
        newLeft,
        newTop,
        newAngle: fab.angle ?? 0,
        idmlCx: idmlCx ?? 0,
        idmlCy: idmlCy ?? 0,
        sizeChanged,
        newDisplayW,
        newDisplayH,
        origDisplayW,
        origDisplayH,
        localCx,
        localCy,
      })
    }
  }

  for (const fabObj of fabricObjects) {
    const fab = fabObj as FabricObject & { data?: FabricData }
    if (!fab.data?.id) continue

    if ((fab.data.type === 'text' || fab.data.type === 'image') && fab.data.idmlCx == null) {
      console.warn(
        `[IDML Export] Objet ${fab.data.id} (${fab.data.type}) : idmlCx manquant → delta position ignoré`,
      )
    }
  }

  const spreadEntries: { path: string; xml: string; modified: boolean }[] = []
  for (const [path, entry] of Object.entries(zip.files)) {
    if (entry.dir) continue

    const lowerPath = path.toLowerCase()
    if (!lowerPath.startsWith('spreads/') && !lowerPath.startsWith('masterspreads/')) continue

    spreadEntries.push({
      path,
      xml: await entry.async('text'),
      modified: false,
    })
  }

  const idToSpread = new Map<string, { path: string; xml: string; modified: boolean }>()
  for (const spreadEntry of spreadEntries) {
    for (const match of spreadEntry.xml.matchAll(/\bSelf="([^"]+)"/g)) {
      idToSpread.set(match[1], spreadEntry)
    }
  }

  const textFrameToStory = new Map<string, string>()
  const tfRegex1 = /<TextFrame[^>]*?\bSelf="([^"]+)"[^>]*?\bParentStory="([^"]+)"/g
  const tfRegex2 = /<TextFrame[^>]*?\bParentStory="([^"]+)"[^>]*?\bSelf="([^"]+)"/g

  for (const spreadEntry of spreadEntries) {
    let match: RegExpExecArray | null

    tfRegex1.lastIndex = 0
    while ((match = tfRegex1.exec(spreadEntry.xml)) !== null) {
      if (match[2] !== 'n') textFrameToStory.set(match[1], match[2])
    }

    tfRegex2.lastIndex = 0
    while ((match = tfRegex2.exec(spreadEntry.xml)) !== null) {
      if (match[1] !== 'n' && !textFrameToStory.has(match[2])) {
        textFrameToStory.set(match[2], match[1])
      }
    }
  }

  const storyIdToPath = new Map<string, string>()
  for (const [path, entry] of Object.entries(zip.files)) {
    if (entry.dir || !path.toLowerCase().startsWith('stories/')) continue

    const xml = await entry.async('text')
    const match = xml.match(/<Story[^>]*\bSelf="([^"]+)"/)
    if (match) storyIdToPath.set(match[1], path)
  }

  const graphicPath = Object.keys(zip.files).find(
    (path) => path.toLowerCase() === 'resources/graphic.xml',
  )
  let graphicXml = graphicPath ? await zip.files[graphicPath].async('text') : null
  let graphicModified = false

  let storyPatchCount = 0
  for (const [fabricId, fabObj] of textboxMap) {
    const storyId = textFrameToStory.get(fabricId)
    if (!storyId) continue

    const storyPath = storyIdToPath.get(storyId)
    if (!storyPath) continue

    const storyEntry = zip.files[storyPath]
    if (!storyEntry) continue

    const textObj = fabObj as FabricObject & {
      text?: string
      fontSize?: number
      fill?: unknown
      data?: FabricData
    }

    const currentText = textObj.text ?? ''
    const storyXml = await storyEntry.async('text')
    const lineStyles = extractPerLineFabricStyles(fabObj, currentText)
    const propagatedFontSize =
      typeof textObj.fontSize === 'number'
        ? textObj.fontSize
        : textObj.data?.idmlOrigFontSize ?? null
    const propagatedFill =
      normalizeHexColor(textObj.fill) ??
      normalizeHexColor(textObj.data?.originalTextColor ?? null)

    for (const lineStyle of lineStyles) {
      if (lineStyle.segments?.length) continue
      if (lineStyle.absoluteFontSize == null) lineStyle.absoluteFontSize = propagatedFontSize
      if (lineStyle.fillHex == null) lineStyle.fillHex = propagatedFill
    }

    if (graphicXml) {
      const allNewFills = lineStyles.flatMap((lineStyle) => {
        const fills: string[] = []
        if (lineStyle.fillHex) fills.push(lineStyle.fillHex)
        if (lineStyle.segments?.length) {
          for (const segment of lineStyle.segments) {
            if (segment.fillHex) fills.push(segment.fillHex)
          }
        }
        return fills
      })

      for (const fill of allNewFills) {
        const [nextGraphicXml, wasModified] = addColorSwatchToGraphic(graphicXml, fill)
        graphicXml = nextGraphicXml
        graphicModified = graphicModified || wasModified
      }
    }

    const patchedXml = patchStory(storyXml, currentText, { lineStyles })
    if (patchedXml !== storyXml) {
      zip.file(storyPath, patchedXml)
      storyPatchCount++
    }
  }

  let imageReplaceCount = 0
  for (const [, fabObj] of imageMap) {
    const fab = fabObj as FabricObject & { data?: FabricData }
    const originalName = fab.data?.name
    if (!originalName) continue

    const imgBytes = await getImageBytesFromFabric(fabObj)
    if (!imgBytes) {
      console.warn(`[IDML Export] Pixels inaccessibles pour "${originalName}"`)
      continue
    }

    const lowerName = originalName.toLowerCase()
    const existingPath = Object.keys(zip.files).find(
      (p) => p.toLowerCase() === `links/${lowerName}` || p.toLowerCase().endsWith(`/${lowerName}`),
    )

    const targetPath = existingPath ?? `Links/${originalName}`
    zip.file(targetPath, imgBytes)
    imageReplaceCount++

    // Corriger LinkResourceURI : remonter d'un niveau si le fichier est dans un sous-dossier
    // Ex: file:/path/Folder/SubFolder/Links/img.png → file:/path/Folder/Links/img.png
    const escapedName = originalName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    for (const se of spreadEntries) {
      const origUriMatch = se.xml.match(new RegExp(`LinkResourceURI="([^"]*${escapedName}[^"]*)"`)
      )
      if (!origUriMatch) continue

      const origUri = origUriMatch[1]
      const fixedUri = origUri.replace(/\/[^\/]+\/Links\/([^\/]+)$/, '/Links/$1')
      const newUri = fixedUri !== origUri ? fixedUri : origUri

      const linkPattern = new RegExp(`(LinkResourceURI=")[^"]*${escapedName}[^"]*(")`,'g')
      se.xml = se.xml.replace(linkPattern, `$1${newUri}$2`)
      se.modified = true
    }
  }

  let colorPatchCount = 0
  let posPatchCount = 0
  // IDs déjà patchés en position dans 7a — éviter le double-patch dans 7b/7c
  const patchedPositionIds = new Set<string>()

  const applyPosDelta = (
    fabricId: string,
    fab: FabricObject & { data?: FabricData },
  ) => {
    if (patchedPositionIds.has(fabricId)) return

    const se = idToSpread.get(fabricId)
    if (!se) return
    const origTf = extractItemTransformFromXml(se.xml, fabricId)
    if (!origTf) return

    const center = fab.getCenterPoint()
    const newLeft = center.x
    const newTop  = center.y

    let refCx = fab.data?.idmlCx
    let refCy = fab.data?.idmlCy

    if (refCx == null || refCy == null) {
      // Fallback : reconstruire depuis idmlPageOffsetX si disponible
      const pageOffX = (fab.data as any)?.idmlPageOffsetX as number | undefined
      const pageOffY = (fab.data as any)?.idmlPageOffsetY as number | undefined
      if (pageOffX == null || pageOffY == null) return
      refCx = origTf[4] - pageOffX
      refCy = origTf[5] - pageOffY
    }

    if (Math.abs(newLeft - refCx) <= 0.5 && Math.abs(newTop - refCy) <= 0.5) return

    const dx = parseFloat((newLeft - refCx).toFixed(3))
    const dy = parseFloat((newTop  - refCy).toFixed(3))
    const newTx = parseFloat((origTf[4] + dx).toFixed(3))
    const newTy = parseFloat((origTf[5] + dy).toFixed(3))
    const transform = `${origTf[0]} ${origTf[1]} ${origTf[2]} ${origTf[3]} ${newTx} ${newTy}`
    const before = se.xml
    se.xml = patchElementAttribute(se.xml, fabricId, 'ItemTransform', transform)
    if (se.xml !== before) { se.modified = true; posPatchCount++ }
  }

  for (const patch of patchableObjects) {
    const spreadEntry = idToSpread.get(patch.id)
    if (!spreadEntry) continue

    if (patch.fillChanged) {
      if (graphicXml) {
        const [nextGraphicXml, wasModified] = addColorSwatchToGraphic(graphicXml, patch.newFill)
        graphicXml = nextGraphicXml
        graphicModified = graphicModified || wasModified
      }

      const before = spreadEntry.xml
      spreadEntry.xml = patchElementAttribute(
        spreadEntry.xml,
        patch.id,
        'FillColor',
        colorSwatchSelf(patch.newFill),
      )
      if (spreadEntry.xml !== before) {
        spreadEntry.modified = true
        colorPatchCount++
      }
    }

    if (patch.posChanged) {
      const origTf = extractItemTransformFromXml(spreadEntry.xml, patch.id)
      if (origTf) {
        const dx = parseFloat((patch.newLeft - patch.idmlCx).toFixed(3))
        const dy = parseFloat((patch.newTop  - patch.idmlCy).toFixed(3))
        const newTx = parseFloat((origTf[4] + dx).toFixed(3))
        const newTy = parseFloat((origTf[5] + dy).toFixed(3))
        const transform = `${origTf[0]} ${origTf[1]} ${origTf[2]} ${origTf[3]} ${newTx} ${newTy}`
        const before = spreadEntry.xml
        spreadEntry.xml = patchElementAttribute(spreadEntry.xml, patch.id, 'ItemTransform', transform)
        if (spreadEntry.xml !== before) {
          spreadEntry.modified = true
          posPatchCount++
          patchedPositionIds.add(patch.id)
        }
      }
    }

    if (patch.sizeChanged && patch.localCx != null && patch.localCy != null) {
      applyGeoBoundsUpdate(
        spreadEntry,
        patch.id,
        patch.newDisplayW, patch.newDisplayH,
        patch.origDisplayW, patch.origDisplayH,
        patch.localCx, patch.localCy,
      )
    }
  }

  for (const [fabricId, fabObj] of textboxMap) {
    applyPosDelta(fabricId, fabObj as FabricObject & { data?: FabricData })
  }

  for (const [fabricId, fabObj] of imageMap) {
    const imageObj = fabObj as FabricObject & {
      data?: FabricData
      width?: number
      height?: number
      scaleX?: number
      scaleY?: number
    }

    applyPosDelta(fabricId, imageObj)

    const spreadEntry = idToSpread.get(fabricId)
    if (!spreadEntry) continue

    const origDisplayW = imageObj.data?.idmlW
    const origDisplayH = imageObj.data?.idmlH
    const localCx = imageObj.data?.localCx
    const localCy = imageObj.data?.localCy
    const newDisplayW = (imageObj.width ?? 0) * (imageObj.scaleX ?? 1)
    const newDisplayH = (imageObj.height ?? 0) * (imageObj.scaleY ?? 1)

    const sizeChanged =
      origDisplayW != null &&
      origDisplayH != null &&
      localCx != null &&
      localCy != null &&
      (
        Math.abs(newDisplayW - origDisplayW) > 0.5 ||
        Math.abs(newDisplayH - origDisplayH) > 0.5
      )

    if (!sizeChanged) continue

    const patched = applyGeoBoundsUpdate(
      spreadEntry, fabricId,
      newDisplayW, newDisplayH,
      origDisplayW!, origDisplayH!,
      localCx!, localCy!,
    )
    if (patched) {
      const scaleX = origDisplayW! > 0.001 ? newDisplayW / origDisplayW! : 1
      const scaleY = origDisplayH! > 0.001 ? newDisplayH / origDisplayH! : 1
      scaleImageChildTransform(spreadEntry, fabricId, scaleX, scaleY, localCx!, localCy!)
    }
  }

  // ── 8. Formes avec remplissage image (fillImage) ──────────────────────────
  let fillImageCount = 0
  for (const obj of fabricObjects) {
    const fab = obj as FabricObject & {
      data?: FabricData & { fillImage?: string; fillImageName?: string; fillType?: string }
      width?: number
      height?: number
      scaleX?: number
      scaleY?: number
    }
    const id = fab.data?.id
    const fillImageUrl = fab.data?.fillImage
    if (!id || !fillImageUrl) continue
    if (fab.data?.type === 'image' || fab.data?.type === 'text') continue

    const se = idToSpread.get(id)
    if (!se) continue

    // Extract image bytes — ALWAYS re-encode via canvas to guarantee valid JPEG.
    // Raw fetch could return PNG/WebP bytes that would break a .jpg filename.
    let imgBytes: Uint8Array | null = null

    // Helper: render an image element to JPEG via canvas
    const renderToJpeg = async (source: HTMLImageElement | HTMLCanvasElement): Promise<Uint8Array | null> => {
      const w = (source as HTMLImageElement).naturalWidth || source.width
      const h = (source as HTMLImageElement).naturalHeight || source.height
      if (w < 2 || h < 2) return null
      const tmpCanvas = document.createElement('canvas')
      tmpCanvas.width = w
      tmpCanvas.height = h
      const ctx = tmpCanvas.getContext('2d')
      if (!ctx) return null
      ctx.drawImage(source as HTMLImageElement, 0, 0, w, h)
      const blob = await new Promise<Blob | null>((resolve) =>
        tmpCanvas.toBlob(resolve, 'image/jpeg', 0.92),
      )
      if (!blob || blob.size < 100) return null
      return new Uint8Array(await blob.arrayBuffer())
    }

    // Strategy 1: Use Pattern source element already in memory (fastest, no network)
    const fillObj0 = (fab as any).fill
    const patternSource = fillObj0?.source as HTMLImageElement | HTMLCanvasElement | undefined
    if (patternSource) {
      try {
        imgBytes = await renderToJpeg(patternSource)
      } catch (e) {
        console.warn('[IDML Export] S1 Pattern source failed:', e)
      }
    }

    // Strategy 2: Load fresh image element from URL and render to JPEG
    if (!imgBytes) {
      try {
        imgBytes = await new Promise<Uint8Array | null>((resolve) => {
          const img = new window.Image()
          img.crossOrigin = 'anonymous'
          img.onload = () => renderToJpeg(img).then(resolve).catch(() => resolve(null))
          img.onerror = () => resolve(null)
          img.src = fillImageUrl
        })
      } catch (e) {
        console.warn('[IDML Export] S2 img load failed:', e)
      }
    }

    if (!imgBytes) {
      console.warn(`[IDML Export] ❌ Impossible d'extraire l'image fill pour "${id}"`)
      continue
    }
    console.log(`[IDML Export] Fill image "${id}": ${imgBytes.byteLength} bytes`)

    // Use original filename if available, otherwise generate one
    const originalName = fab.data?.fillImageName
    const imgName = originalName
      ? originalName.replace(/\.[^.]+$/, '.jpg')  // keep original name, force .jpg extension
      : `fill_${id.replace(/[^a-zA-Z0-9_]/g, '_')}.jpg`
    const ext = 'jpg'

    // Find the actual Links folder path in the zip (case may vary)
    const linksFolder = Object.keys(zip.files).find(
      (p) => /^links\//i.test(p),
    )?.split('/')[0] ?? 'Links'
    const linkPath = `${linksFolder}/${imgName}`
    zip.file(linkPath, imgBytes)
    fillImageFiles.push({ name: imgName, bytes: imgBytes })

    // Get native image dimensions from Pattern source (already extracted above as patternSource)
    const patSrc = patternSource as HTMLImageElement | undefined
    const natW = patSrc?.naturalWidth || patSrc?.width || 800
    const natH = patSrc?.naturalHeight || patSrc?.height || 600
    // Find the Rectangle/Polygon element in spread XML and inject <Image> child
    const selfIdx = se.xml.indexOf(`Self="${id}"`)
    if (selfIdx < 0) continue

    // Find the element tag start
    let tagStart = selfIdx
    while (tagStart > 0 && se.xml[tagStart] !== '<') tagStart--

    // Find the closing tag (Rectangle, Polygon, Oval)
    const tagNameMatch = se.xml.slice(tagStart).match(/^<(\w+)\b/)
    if (!tagNameMatch) continue
    const tagName = tagNameMatch[1]

    const closeTag = `</${tagName}>`
    const closeIdx = se.xml.indexOf(closeTag, tagStart)
    if (closeIdx < 0) continue

    // Skip if already has an Image/EPS/PDF child
    const blockXml = se.xml.slice(tagStart, closeIdx)
    if (/<(Image|EPS|PDF)\b/.test(blockXml)) continue

    // Extract frame bounds from PathPointArray to get local coordinate system
    const anchors = [...blockXml.matchAll(/Anchor="([^ "]+) ([^ "]+)"/g)]
    let frameLeft = 0, frameTop = 0, frameRight = 0, frameBottom = 0
    if (anchors.length >= 2) {
      const xs = anchors.map(m => parseFloat(m[1]))
      const ys = anchors.map(m => parseFloat(m[2]))
      frameLeft = Math.min(...xs)
      frameTop = Math.min(...ys)
      frameRight = Math.max(...xs)
      frameBottom = Math.max(...ys)
    } else {
      // Fallback: use Fabric dimensions centered at origin
      const displayW = (fab.width ?? 100) * (fab.scaleX ?? 1)
      const displayH = (fab.height ?? 100) * (fab.scaleY ?? 1)
      frameLeft = -displayW / 2; frameTop = -displayH / 2
      frameRight = displayW / 2; frameBottom = displayH / 2
    }
    const frameW = frameRight - frameLeft
    const frameH = frameBottom - frameTop

    // Calculate scale to cover the frame (like CSS background-size: cover)
    const scaleToFit = Math.max(frameW / natW, frameH / natH)
    // Offset to center the image in the frame
    const scaledW = natW * scaleToFit
    const scaledH = natH * scaleToFit
    const tx = frameLeft - (scaledW - frameW) / 2
    const ty = frameTop - (scaledH - frameH) / 2

    // Build Image element matching real InDesign structure
    // Self IDs must follow InDesign format: 'u' + hex digits
    const idHash = Array.from(id).reduce((h, c) => ((h << 5) - h + c.charCodeAt(0)) >>> 0, 0)
    const imageId = `u${(idHash + 0xA000).toString(16)}`
    const linkId = `u${(idHash + 0xB000).toString(16)}`
    const sizeHex = `0~${imgBytes.byteLength.toString(16)}`
    const now = new Date().toISOString().replace(/\.\d+Z$/, '')

    // Relative URI — InDesign will search in Links/ folder next to the .idml file
    const linkUri = `file:Links/${imgName}`

    // Determine image type string
    const imgTypeStr = ext === 'png' ? '$ID/Portable Network Graphics (PNG)'
      : ext === 'gif' ? '$ID/GIF' : '$ID/JPEG'
    const imgFmtStr = ext === 'png' ? '$ID/Portable Network Graphics (PNG)'
      : ext === 'gif' ? '$ID/GIF' : '$ID/JPEG'

    // Build LinkImportStamp matching InDesign format: "file <FILETIME> <size>"
    const stampSize = imgBytes.byteLength
    // Windows FILETIME: 100-nanosecond intervals since 1601-01-01
    const FILETIME_EPOCH_DIFF = 116444736000000000n
    const winFileTime = BigInt(Date.now()) * 10000n + FILETIME_EPOCH_DIFF
    const linkImportStamp = `file ${winFileTime} ${stampSize}`

    const imageXml =
      `<Image Self="${imageId}" ` +
        `Space="$ID/#Links_RGB" ` +
        `ActualPpi="72 72" EffectivePpi="72 72" ` +
        `ImageRenderingIntent="UseColorSettings" ` +
        `LocalDisplaySetting="Default" ` +
        `OverriddenPageItemProps="" ` +
        `FlexItemWidthMode="FlexFixed" FlexItemHeightMode="FlexFixed" ` +
        `ECPaginationPageItemData="1 0" ` +
        `ImageTypeName="${imgTypeStr}" ` +
        `AppliedObjectStyle="ObjectStyle/$ID/[None]" ` +
        `ItemTransform="${scaleToFit} 0 0 ${scaleToFit} ${tx} ${ty}" ` +
        `GradientFillStart="0 0" GradientFillLength="0" GradientFillAngle="0" ` +
        `GradientStrokeStart="0 0" GradientStrokeLength="0" GradientStrokeAngle="0" ` +
        `HorizontalLayoutConstraints="FlexibleDimension FixedDimension FlexibleDimension" ` +
        `VerticalLayoutConstraints="FlexibleDimension FixedDimension FlexibleDimension" ` +
        `Visible="true" Name="$ID/">` +
        `<Properties>` +
          `<Profile type="string">$ID/Embedded</Profile>` +
          `<GraphicBounds Left="0" Top="0" Right="${natW}" Bottom="${natH}"/>` +
        `</Properties>` +
        `<ClippingPathSettings ClippingType="None" InvertPath="false" IncludeInsideEdges="false" RestrictToFrame="false" UseHighResolutionImage="true" Threshold="25" Tolerance="2" InsetFrame="0" AppliedPathName="$ID/" Index="-1"/>` +
        `<ImageIOPreference ApplyPhotoshopClippingPath="true" AllowAutoEmbedding="true" AlphaChannelName="$ID/"/>` +
        `<TextWrapPreference Inverse="false" ApplyToMasterPageOnly="false" TextWrapSide="BothSides" TextWrapMode="None">` +
          `<Properties><TextWrapOffset Top="0" Left="0" Bottom="0" Right="0"/></Properties>` +
        `</TextWrapPreference>` +
        `<Link Self="${linkId}" ` +
          `AssetURL="$ID/" AssetID="$ID/" ` +
          `LinkResourceURI="${linkUri}" ` +
          `LinkResourceFormat="${imgFmtStr}" ` +
          `StoredState="Embedded" ` +
          `LinkClassID="35906" ` +
          `LinkClientID="257" ` +
          `LinkResourceModified="false" ` +
          `LinkObjectModified="false" ` +
          `ShowInUI="true" ` +
          `CanEmbed="true" CanUnembed="true" CanPackage="true" ` +
          `ImportPolicy="NoAutoImport" ExportPolicy="NoAutoExport" ` +
          `LinkImportStamp="${linkImportStamp}" ` +
          `LinkImportModificationTime="${now}" ` +
          `LinkImportTime="${now}" ` +
          `LinkResourceSize="${sizeHex}" ` +
          `RenditionData="Actual" PDFIdentifier="0"/>` +
      `</Image>`
    se.xml = se.xml.slice(0, closeIdx) + imageXml + se.xml.slice(closeIdx)

    // Set ContentType="GraphicType" on parent Rectangle — replace existing value or add
    const tagOpenEnd = se.xml.indexOf('>', tagStart)
    if (tagOpenEnd > tagStart) {
      const tagOpenStr = se.xml.slice(tagStart, tagOpenEnd)
      if (tagOpenStr.includes('ContentType=')) {
        // Replace existing ContentType value (e.g. "Unassigned" → "GraphicType")
        se.xml = se.xml.slice(0, tagStart) +
          tagOpenStr.replace(/ContentType="[^"]*"/, 'ContentType="GraphicType"') +
          se.xml.slice(tagOpenEnd)
      } else {
        se.xml = se.xml.slice(0, tagOpenEnd) + ' ContentType="GraphicType"' + se.xml.slice(tagOpenEnd)
      }
    }

    se.modified = true
    fillImageCount++
  }

  for (const spreadEntry of spreadEntries) {
    if (spreadEntry.modified) {
      zip.file(spreadEntry.path, spreadEntry.xml)
    }
  }

  if (graphicPath && graphicXml && graphicModified) {
    zip.file(graphicPath, graphicXml)
  }

  console.log(`[IDML Export] ${storyPatchCount} story(ies) patchée(s), ${fillImageCount} fill image(s)`)

  void colorPatchCount
  void posPatchCount

  const idmlBlob = await zip.generateAsync({
    type: 'blob',
    mimeType: 'application/vnd.adobe.indesign-idml-package',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  })

  return { idmlBlob, fillImages: fillImageFiles }
}
