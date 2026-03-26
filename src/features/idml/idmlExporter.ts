/**
 * IDML Exporter V4 — Patch complet du fichier IDML original.
 *
 * Modifications prises en charge :
 * 1. Texte modifié        → patch des fichiers Story (DOMParser sur les Stories uniquement)
 * 2. Image remplacée      → remplacement du fichier dans Links/
 * 3. Couleur de fond      → patch FillColor dans les Spreads + swatch dans Graphic.xml
 * 4. Position modifiée    → patch ItemTransform dans les Spreads
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
  idmlCx?: number
  idmlCy?: number
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
  /** Canvas center X au moment de l'import (pour calculer le delta) */
  idmlCx: number
  /** Canvas center Y au moment de l'import (pour calculer le delta) */
  idmlCy: number
}

// ─── Image helpers ───────────────────────────────────────────────────────────

/**
 * Extrait les pixels d'un FabricImage via un canvas temporaire (JPEG qualité 0.92).
 * Utilise les dimensions naturelles de l'élément pour préserver la résolution originale.
 */
async function getImageBytesFromFabric(obj: FabricObject): Promise<Uint8Array | null> {
  try {
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

// ─── Color helpers ─────────────────────────────────────────────────────────────

/** Convertit un hex (#rrggbb) en composantes RGB 0–255 */
function hexToRgb(hex: string): [number, number, number] | null {
  const m = hex.replace('#', '').match(/^([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i)
  if (!m) return null
  return [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)]
}

/** Self ID du swatch (format IDML interne : "Color/Web2Print_rrggbb") */
function colorSwatchSelf(hex: string): string {
  return `Color/Web2Print_${hex.replace('#', '').toLowerCase()}`
}

/**
 * Ajoute un swatch RGB dans Graphic.xml s'il n'existe pas déjà.
 * Retourne [xmlModifié, wasModified].
 */
function addColorSwatchToGraphic(graphicXml: string, hex: string): [string, boolean] {
  const self = colorSwatchSelf(hex)
  if (graphicXml.includes(`Self="${self}"`)) return [graphicXml, false]

  const rgb = hexToRgb(hex)
  if (!rgb) return [graphicXml, false]

  const name = `Web2Print_${hex.replace('#', '').toLowerCase()}`
  const swatchXml = `\n  <Color Self="${self}" Model="RGB" ColorValue="${rgb[0]} ${rgb[1]} ${rgb[2]}" Space="RGB" Name="${name}" />`

  const closingTag = '</idPkg:Graphic>'
  const insertPos = graphicXml.lastIndexOf(closingTag)
  if (insertPos === -1) return [graphicXml, false]

  return [graphicXml.slice(0, insertPos) + swatchXml + '\n' + graphicXml.slice(insertPos), true]
}

// ─── Spread patching ──────────────────────────────────────────────────────────

/** Localise le tag d'ouverture de l'élément Self="id" dans le XML et retourne ses bornes. */
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
  tagEnd++ // inclure le '>'

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
  if (parts.length !== 6 || parts.some(isNaN)) return null
  return parts as [number, number, number, number, number, number]
}

/**
 * Remplace ou ajoute un attribut XML dans le tag d'ouverture de l'élément Self="id".
 * Stratégie string (pas de DOMParser) pour ne pas corrompre le XML IDML.
 */
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
    // Attribut absent : insérer avant '>' ou '/>'
    const closePos = block.lastIndexOf('>')
    const isSelfClosing = closePos > 0 && block[closePos - 1] === '/'
    const insertAt = isSelfClosing ? closePos - 1 : closePos
    patched = block.slice(0, insertAt) + ` ${attrName}="${newValue}"` + block.slice(insertAt)
  }

  return xml.substring(0, tagStart) + patched + xml.substring(tagEnd)
}

// ─── XML helpers (pour Stories uniquement) ────────────────────────────────────

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

// ─── Story text extraction ────────────────────────────────────────────────────

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

// ─── CSR content replacement ──────────────────────────────────────────────────

function replaceCsrContent(doc: Document, csr: Element, newText: string): void {
  const toRemove: Node[] = []
  for (let i = 0; i < csr.childNodes.length; i++) {
    const child = csr.childNodes[i]
    if (child.nodeType === 1) {
      const tag = (child as Element).tagName
      if (tag === 'Content' || tag === 'Br') toRemove.push(child)
    }
  }
  for (const n of toRemove) csr.removeChild(n)

  const parts = newText.split('\n')
  for (let i = 0; i < parts.length; i++) {
    if (i > 0) csr.appendChild(doc.createElement('Br'))
    const content = doc.createElement('Content')
    content.textContent = parts[i]
    csr.appendChild(content)
  }
}

// ─── PSR text update ──────────────────────────────────────────────────────────

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
      if (currentBlock.length > 0) { blocks.push(currentBlock); currentBlock = [] }
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
        replaceCsrContent(doc, csr.element, textWithTrailing.substring(offset, offset + csr.text.length))
        offset += csr.text.length
      }
    } else {
      replaceCsrContent(doc, psr.csrs[0].element, textWithTrailing)
      for (let i = 1; i < psr.csrs.length; i++) replaceCsrContent(doc, psr.csrs[i].element, '')
    }
    return
  }

  const blockInternalNl = blocks.map((block) => {
    let count = 0
    for (const idx of block) for (const ch of psr.csrs[idx].text) if (ch === '\n') count++
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
    } else {
      const totalOldLen = csrIndices.reduce((s, i) => s + psr.csrs[i].charCount, 0)
      if (blockText.length === totalOldLen) {
        let offset = 0
        for (const idx of csrIndices) {
          replaceCsrContent(doc, psr.csrs[idx].element, blockText.substring(offset, offset + psr.csrs[idx].charCount))
          offset += psr.csrs[idx].charCount
        }
      } else {
        replaceCsrContent(doc, psr.csrs[csrIndices[0]].element, blockText)
        for (let i = 1; i < csrIndices.length; i++) replaceCsrContent(doc, psr.csrs[csrIndices[i]].element, '')
      }
    }
  }
}

// ─── Distribution du texte entre PSRs ─────────────────────────────────────────

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

// ─── Patch d'une Story ────────────────────────────────────────────────────────

function patchStory(storyXml: string, fabricText: string): string {
  const doc = parseXml(storyXml)
  const storyEl = doc.getElementsByTagName('Story')[0]
  if (!storyEl) return storyXml

  const psrs = extractStoryStructure(storyEl)
  if (psrs.length === 0) return storyXml

  const fullOriginal = psrs.map((p) => p.text).join('\n')
  if (cleanText(fullOriginal) === cleanText(fabricText)) return storyXml

  console.log(`[IDML Export] Story: "${fullOriginal.slice(0, 40)}" → "${fabricText.slice(0, 40)}"`)

  const newPsrTexts = splitTextByPsrStructure(psrs, fabricText)
  for (let i = 0; i < psrs.length; i++) {
    const newText = i < newPsrTexts.length ? newPsrTexts[i] : ''
    if (cleanText(psrs[i].text) !== cleanText(newText)) {
      updatePsrText(doc, psrs[i], newText)
    }
  }

  return serializeXml(doc, storyXml)
}

// ─── Export principal ─────────────────────────────────────────────────────────

export async function exportIdmlModified(
  rawBuffer: ArrayBuffer,
  fabricObjects: FabricObject[],
): Promise<Blob> {
  const zip = await JSZip.loadAsync(rawBuffer)

  // ── 1. Indexer les objets Fabric par data.id ───────────────────────────────
  const textboxMap = new Map<string, FabricObject>()  // id → textbox
  const imageMap = new Map<string, FabricObject>()    // id → FabricImage
  const patchableObjects: PatchableObj[] = []          // blocs avec couleur/position changée

  for (const obj of fabricObjects) {
    const fab = obj as FabricObject & { data?: FabricData; type?: string; left?: number; top?: number; angle?: number }
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

    // Autres blocs IDML : vérifier couleur et position
    if (!fab.data?.type || fab.data.type === 'text' || fab.data.type === 'image') continue

    const currentFill = (fab as any).fill as string | undefined
    const origFill = fab.data?.originalFillColor
    const fillChanged = !!(
      currentFill &&
      origFill !== undefined &&
      currentFill !== origFill &&
      currentFill !== 'transparent' &&
      currentFill !== ''
    )

    const idmlCx = fab.data?.idmlCx
    const idmlCy = fab.data?.idmlCy
    // Si la référence d'origine est inconnue, on ne peut pas calculer le delta
    // (évite d'appliquer un décalage énorme erroné si data.idmlCx s'est perdu)
    const newLeft = fab.left ?? 0
    const newTop = fab.top ?? 0
    const posChanged = idmlCx != null && idmlCy != null &&
      (Math.abs(newLeft - idmlCx) > 0.5 || Math.abs(newTop - idmlCy) > 0.5)

    if (fillChanged || posChanged) {
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
      })
    }
  }

  // Diagnostic : signaler les objets IDML sans idmlCx (données d'origine manquantes)
  let missingBaselineCount = 0
  for (const fab of fabricObjects) {
    const f = fab as FabricObject & { data?: FabricData }
    if (!f.data?.id) continue
    if ((f.data.type === 'text' || f.data.type === 'image') && f.data.idmlCx == null) {
      console.warn(`[IDML Export] Objet ${f.data.id} (${f.data.type}) : idmlCx manquant → delta position ignoré`)
      missingBaselineCount++
    }
  }
  console.log(`[IDML Export] ${textboxMap.size} texte(s), ${imageMap.size} image(s), ${patchableObjects.length} bloc(s) à patcher${missingBaselineCount > 0 ? `, ${missingBaselineCount} sans référence de position (ignorés)` : ''}`)

  // ── 2. Charger tous les Spreads en mémoire (une seule fois) ───────────────
  const spreadEntries: { path: string; xml: string; modified: boolean }[] = []
  for (const [path, entry] of Object.entries(zip.files)) {
    if (entry.dir) continue
    const lp = path.toLowerCase()
    if (!lp.startsWith('spreads/') && !lp.startsWith('masterspreads/')) continue
    spreadEntries.push({ path, xml: await entry.async('text'), modified: false })
  }

  // Index Self→spreadEntry pour éviter un scan linéaire O(spreads) par élément
  const idToSpread = new Map<string, typeof spreadEntries[0]>()
  for (const se of spreadEntries) {
    for (const m of se.xml.matchAll(/\bSelf="([^"]+)"/g)) {
      idToSpread.set(m[1], se)
    }
  }

  // ── 3. Mapper TextFrame Self → ParentStory (REGEX sur les Spreads en mémoire)
  const textFrameToStory = new Map<string, string>()
  const tfRegex1 = /<TextFrame[^>]*?\bSelf="([^"]+)"[^>]*?\bParentStory="([^"]+)"/g
  const tfRegex2 = /<TextFrame[^>]*?\bParentStory="([^"]+)"[^>]*?\bSelf="([^"]+)"/g

  for (const se of spreadEntries) {
    let match: RegExpExecArray | null
    tfRegex1.lastIndex = 0
    while ((match = tfRegex1.exec(se.xml)) !== null) {
      if (match[2] !== 'n') textFrameToStory.set(match[1], match[2])
    }
    tfRegex2.lastIndex = 0
    while ((match = tfRegex2.exec(se.xml)) !== null) {
      if (match[1] !== 'n' && !textFrameToStory.has(match[2])) textFrameToStory.set(match[2], match[1])
    }
  }

  console.log(`[IDML Export] ${textFrameToStory.size} TextFrame→Story mappings`)

  // ── 4. Mapper Story Self → chemin fichier ─────────────────────────────────
  const storyIdToPath = new Map<string, string>()
  for (const [path, entry] of Object.entries(zip.files)) {
    if (entry.dir || !path.toLowerCase().startsWith('stories/')) continue
    const xml = await entry.async('text')
    const match = xml.match(/<Story[^>]*\bSelf="([^"]+)"/)
    if (match) storyIdToPath.set(match[1], path)
  }

  // ── 5. Patcher les Stories dont le texte a changé ─────────────────────────
  let storyPatchCount = 0
  for (const [fabricId, fabObj] of textboxMap) {
    const storyId = textFrameToStory.get(fabricId)
    if (!storyId) continue
    const storyPath = storyIdToPath.get(storyId)
    if (!storyPath) continue
    const storyEntry = zip.files[storyPath]
    if (!storyEntry) continue

    const currentText = (fabObj as unknown as { text?: string }).text ?? ''
    const storyXml = await storyEntry.async('text')
    const patchedXml = patchStory(storyXml, currentText)

    if (patchedXml !== storyXml) {
      zip.file(storyPath, patchedXml)
      storyPatchCount++
    }
  }

  console.log(`[IDML Export] ${storyPatchCount} story(ies) patchée(s)`)

  // ── 6. Remplacer les images dans Links/ ───────────────────────────────────
  let imageReplaceCount = 0
  for (const [, fabObj] of imageMap) {
    const fab = fabObj as FabricObject & { data?: FabricData }
    const originalName = fab.data!.name!
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
    console.log(`[IDML Export] Image remplacée: "${targetPath}" (${imgBytes.length} octets)`)
  }

  console.log(`[IDML Export] ${imageReplaceCount} image(s) remplacée(s)`)

  // ── 7. Patcher couleurs et positions dans les Spreads ─────────────────────

  // Charger Graphic.xml pour les swatches couleur
  const graphicPath = Object.keys(zip.files).find((p) =>
    p.toLowerCase() === 'resources/graphic.xml',
  )
  let graphicXml = graphicPath ? await zip.files[graphicPath].async('text') : null
  let graphicModified = false

  let colorPatchCount = 0
  let posPatchCount = 0

  /** Applique le delta de position d'un objet Fabric sur son ItemTransform IDML. */
  const applyPosDelta = (
    fabricId: string,
    fab: FabricObject & { data?: FabricData; left?: number; top?: number },
  ) => {
    const idmlCx = fab.data?.idmlCx
    const idmlCy = fab.data?.idmlCy
    // Sans référence d'origine, on ne peut calculer le delta : on préserve la position IDML
    if (idmlCx == null || idmlCy == null) return
    const newLeft = fab.left ?? 0
    const newTop  = fab.top  ?? 0
    if (Math.abs(newLeft - idmlCx) <= 0.5 && Math.abs(newTop - idmlCy) <= 0.5) return

    const se = idToSpread.get(fabricId)
    if (!se) return

    const origTf = extractItemTransformFromXml(se.xml, fabricId)
    if (!origTf) return

    const dx = parseFloat((newLeft - idmlCx).toFixed(3))
    const dy = parseFloat((newTop  - idmlCy).toFixed(3))
    const newTx = parseFloat((origTf[4] + dx).toFixed(3))
    const newTy = parseFloat((origTf[5] + dy).toFixed(3))
    console.log(`[IDML Export] Déplacement ${fabricId}: left=${newLeft.toFixed(2)} idmlCx=${idmlCx.toFixed(2)} dx=${dx} origTx=${origTf[4].toFixed(3)} → newTx=${newTx}`)
    const transform = `${origTf[0]} ${origTf[1]} ${origTf[2]} ${origTf[3]} ${newTx} ${newTy}`
    const before = se.xml
    se.xml = patchElementAttribute(se.xml, fabricId, 'ItemTransform', transform)
    if (se.xml !== before) { se.modified = true; posPatchCount++ }
  }

  // 7a. Blocs non-texte, non-image : couleur + position
  for (const patch of patchableObjects) {
    const se = idToSpread.get(patch.id)
    if (!se) continue

    if (patch.fillChanged) {
      if (graphicXml) {
        const [newXml, wasModified] = addColorSwatchToGraphic(graphicXml, patch.newFill)
        graphicXml = newXml
        graphicModified = graphicModified || wasModified
      }
      const before = se.xml
      se.xml = patchElementAttribute(se.xml, patch.id, 'FillColor', colorSwatchSelf(patch.newFill))
      if (se.xml !== before) { se.modified = true; colorPatchCount++ }
    }

    if (patch.posChanged) {
      const origTf = extractItemTransformFromXml(se.xml, patch.id)
      if (origTf) {
        const dx = parseFloat((patch.newLeft - patch.idmlCx).toFixed(3))
        const dy = parseFloat((patch.newTop  - patch.idmlCy).toFixed(3))
        const newTx = parseFloat((origTf[4] + dx).toFixed(3))
        const newTy = parseFloat((origTf[5] + dy).toFixed(3))
        const transform = `${origTf[0]} ${origTf[1]} ${origTf[2]} ${origTf[3]} ${newTx} ${newTy}`
        const before = se.xml
        se.xml = patchElementAttribute(se.xml, patch.id, 'ItemTransform', transform)
        if (se.xml !== before) { se.modified = true; posPatchCount++ }
      }
    }
  }

  // 7b. TextFrames : patch de position si déplacés
  for (const [fabricId, fabObj] of textboxMap) {
    applyPosDelta(fabricId, fabObj as FabricObject & { data?: FabricData; left?: number; top?: number })
  }

  // 7c. Cadres image : patch de position si déplacés
  for (const [fabricId, fabObj] of imageMap) {
    applyPosDelta(fabricId, fabObj as FabricObject & { data?: FabricData; left?: number; top?: number })
  }

  // Réécrire uniquement les Spreads effectivement modifiés
  for (const se of spreadEntries) {
    if (se.modified) zip.file(se.path, se.xml)
  }

  // Réécrire Graphic.xml uniquement si des swatches ont été ajoutés
  if (graphicPath && graphicXml && graphicModified) {
    zip.file(graphicPath, graphicXml)
  }

  console.log(`[IDML Export] ${colorPatchCount} couleur(s), ${posPatchCount} position(s) patchée(s)`)

  // ── 8. Générer le zip ─────────────────────────────────────────────────────
  return zip.generateAsync({
    type: 'blob',
    mimeType: 'application/vnd.adobe.indesign-idml-package',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  })
}
