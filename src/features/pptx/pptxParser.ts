/**
 * PPTX Parser — Extrait les éléments d'une slide PowerPoint
 * Unités source : EMU (English Metric Units), 1 EMU = 1/914400 pouce
 * Transformations identiques à l'IDML : couleurs, texte, images, formes
 */
import JSZip from 'jszip'

// ─── Types intermédiaires ─────────────────────────────────────────────────────

export interface PptxColor {
  hex: string   // #RRGGBB
  alpha: number // 0–1 (1 = opaque)
}

export interface PptxGradientStop {
  position: number  // 0–1
  color: PptxColor
}

export interface PptxGradient {
  type: 'linear' | 'radial'
  angle: number  // degrés (0° = droite, 90° = bas)
  stops: PptxGradientStop[]
}

export interface PptxShadow {
  color: PptxColor
  blurRad: number   // EMU
  offsetX: number   // EMU
  offsetY: number   // EMU
}

export interface PptxTransform {
  x: number    // EMU depuis le coin haut-gauche de la slide
  y: number
  cx: number   // largeur EMU
  cy: number   // hauteur EMU
  rot: number  // degrés (déjà converti depuis 1/60000 degrés PPTX)
  flipH: boolean
  flipV: boolean
}

export interface PptxRun {
  text: string
  bold: boolean
  italic: boolean
  underline: boolean
  strike: boolean
  sz: number       // taille en points (déjà converti depuis sz/100)
  fontFamily: string
  color: PptxColor | null
}

export interface PptxParagraph {
  align: 'left' | 'center' | 'right' | 'justify'
  runs: PptxRun[]
  spaceBefore: number  // EMU
  spaceAfter: number   // EMU
}

export interface PptxTextBody {
  paragraphs: PptxParagraph[]
  anchor: 'top' | 'middle' | 'bottom'
  insets: { l: number; r: number; t: number; b: number }  // EMU
}

export interface PptxShape {
  kind: 'shape'
  geom: 'rect' | 'ellipse' | 'roundRect' | 'line' | 'triangle' | 'other'
  tf: PptxTransform
  fill: PptxColor | null
  fillGradient?: PptxGradient
  stroke: PptxColor | null
  strokeWidth: number  // EMU
  /** Valeur adj pour roundRect : 0–50000 (fraction /100000 × min(w,h)) */
  cornerAdj: number
  shadow?: PptxShadow
  textBody?: PptxTextBody
}

export interface PptxPicture {
  kind: 'picture'
  tf: PptxTransform
  dataUrl: string  // base64 data URL extrait du ZIP
}

export type PptxElement = PptxShape | PptxPicture

export interface PptxSlide {
  widthEmu: number
  heightEmu: number
  background: PptxColor | null
  backgroundGradient?: PptxGradient
  elements: PptxElement[]
}

// ─── Helpers XML ──────────────────────────────────────────────────────────────

function tag(el: Element | Document, name: string): Element | null {
  return el.getElementsByTagName(name)[0] ?? null
}

function tags(el: Element | Document, name: string): Element[] {
  return Array.from(el.getElementsByTagName(name))
}

function n(el: Element | null | undefined, attr: string): number {
  const v = el?.getAttribute(attr)
  return v ? parseInt(v, 10) : 0
}

function parseXml(text: string): Document {
  return new DOMParser().parseFromString(text, 'application/xml')
}

/** Convertit un Uint8Array en base64 sans stack overflow (chunk par chunk) */
function uint8ToBase64(buf: Uint8Array): string {
  let binary = ''
  const chunk = 8192
  for (let i = 0; i < buf.length; i += chunk) {
    binary += String.fromCharCode(...buf.subarray(i, i + chunk))
  }
  return btoa(binary)
}

/**
 * Recherche un attribut dans le XML brut en cas d'échec du DOMParser
 * (fallback pour les namespaces non résolus)
 */
function attrFromRaw(xml: string, tagName: string, attr: string): number {
  const re = new RegExp(`<[^>]*:?${tagName}[^>]*\\s${attr}="(\\d+)"`)
  const m = xml.match(re)
  return m ? parseInt(m[1], 10) : 0
}

// ─── Couleurs ─────────────────────────────────────────────────────────────────

const PRESET_COLORS: Record<string, string> = {
  white: 'ffffff', black: '000000', red: 'ff0000', green: '008000',
  blue: '0000ff', yellow: 'ffff00', cyan: '00ffff', magenta: 'ff00ff',
  orange: 'ffa500', gray: '808080', grey: '808080', silver: 'c0c0c0',
}

const SCHEME_COLORS: Record<string, string> = {
  dk1: '000000', lt1: 'ffffff', dk2: '1F497D', lt2: 'EEECE1',
  accent1: '4F81BD', accent2: 'C0504D', accent3: '9BBB59',
  accent4: '8064A2', accent5: '4BACC6', accent6: 'F79646',
  hlink: '0000FF', folHlink: '800080',
  // Alias PowerPoint : tx1/tx2 → dk1/dk2, bg1/bg2 → lt1/lt2
  tx1: '000000', tx2: '1F497D', bg1: 'ffffff', bg2: 'EEECE1',
}

/**
 * Applique lumMod / lumOff sur une couleur hex (espace HLS OOXML)
 * lumMod multiplie la luminosité, lumOff ajoute un offset (0–1)
 */
function applyLumModOff(hex: string, lumMod: number, lumOff: number): string {
  if (lumMod === 1 && lumOff === 0) return hex

  const h6 = hex.replace('#', '').padStart(6, '0')
  const r = parseInt(h6.slice(0, 2), 16) / 255
  const g = parseInt(h6.slice(2, 4), 16) / 255
  const b = parseInt(h6.slice(4, 6), 16) / 255

  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2
  const d = max - min

  let h = 0
  const s = d === 0 ? 0 : (l > 0.5 ? d / (2 - max - min) : d / (max + min))
  if (d !== 0) {
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break
      case g: h = ((b - r) / d + 2) / 6; break
      default: h = ((r - g) / d + 4) / 6
    }
  }

  const newL = Math.min(1, Math.max(0, l * lumMod + lumOff))

  const toHex = (v: number) =>
    Math.round(Math.min(1, Math.max(0, v)) * 255).toString(16).padStart(2, '0')

  if (s === 0) return toHex(newL) + toHex(newL) + toHex(newL)

  const q = newL < 0.5 ? newL * (1 + s) : newL + s - newL * s
  const p = 2 * newL - q
  const hue2rgb = (pp: number, qq: number, t: number) => {
    if (t < 0) t += 1
    if (t > 1) t -= 1
    if (t < 1 / 6) return pp + (qq - pp) * 6 * t
    if (t < 1 / 2) return qq
    if (t < 2 / 3) return pp + (qq - pp) * (2 / 3 - t) * 6
    return pp
  }
  return toHex(hue2rgb(p, q, h + 1 / 3)) + toHex(hue2rgb(p, q, h)) + toHex(hue2rgb(p, q, h - 1 / 3))
}

/** a:shade → multiplie chaque canal RGB (assombrir) */
function applyShade(hex: string, shade: number): string {
  if (shade >= 1) return hex
  const h6 = hex.replace('#', '').padStart(6, '0')
  const toH = (v: number) => Math.round(Math.min(255, Math.max(0, parseInt(h6.slice(v, v + 2), 16) * shade))).toString(16).padStart(2, '0')
  return toH(0) + toH(2) + toH(4)
}

/** a:tint → blend chaque canal vers le blanc (éclaircir) */
function applyTint(hex: string, tint: number): string {
  if (tint <= 0) return hex
  const h6 = hex.replace('#', '').padStart(6, '0')
  const toH = (v: number) => {
    const c = parseInt(h6.slice(v, v + 2), 16)
    return Math.round(c + (255 - c) * tint).toString(16).padStart(2, '0')
  }
  return toH(0) + toH(2) + toH(4)
}

/**
 * Résout un élément couleur direct (a:srgbClr, a:schemeClr, a:sysClr, a:prstClr)
 */
function resolveColorEl(
  colorEl: Element,
  themeMap: Record<string, string>,
): PptxColor | null {
  const name = colorEl.localName  // sans préfixe namespace
  const alphaEl = colorEl.getElementsByTagName('a:alpha')[0]
  // a:alpha val=100000 → opaque (1.0), val=0 → transparent (0.0)
  const a = alphaEl ? n(alphaEl, 'val') / 100000 : 1

  if (name === 'srgbClr') {
    return { hex: `#${colorEl.getAttribute('val') ?? '000000'}`, alpha: a }
  }
  if (name === 'sysClr') {
    return { hex: `#${colorEl.getAttribute('lastClr') ?? 'ffffff'}`, alpha: a }
  }
  if (name === 'prstClr') {
    const key = colorEl.getAttribute('val') ?? ''
    return { hex: `#${PRESET_COLORS[key] ?? '888888'}`, alpha: a }
  }
  if (name === 'schemeClr') {
    const key = colorEl.getAttribute('val') ?? ''
    // phClr = couleur héritée du layout/master → utiliser dk1 du thème comme fallback
    if (key === 'phClr') return { hex: `#${themeMap['dk1'] ?? '404040'}`, alpha: a }
    const hexBase = themeMap[key] ?? SCHEME_COLORS[key] ?? '888888'
    const lumModEl = colorEl.getElementsByTagName('a:lumMod')[0]
    const lumOffEl = colorEl.getElementsByTagName('a:lumOff')[0]
    const lumMod = lumModEl ? parseInt(lumModEl.getAttribute('val') ?? '100000', 10) / 100000 : 1
    const lumOff = lumOffEl ? parseInt(lumOffEl.getAttribute('val') ?? '0', 10) / 100000 : 0
    let hex = applyLumModOff(hexBase, lumMod, lumOff)
    // a:shade → assombrit (multiplie chaque canal RGB)
    const shadeEl = colorEl.getElementsByTagName('a:shade')[0]
    if (shadeEl) {
      const shade = parseInt(shadeEl.getAttribute('val') ?? '100000', 10) / 100000
      hex = applyShade(hex, shade)
    }
    // a:tint → éclaircit (blend vers blanc)
    const tintEl = colorEl.getElementsByTagName('a:tint')[0]
    if (tintEl) {
      const tint = parseInt(tintEl.getAttribute('val') ?? '0', 10) / 100000
      hex = applyTint(hex, tint)
    }
    return { hex: `#${hex}`, alpha: a }
  }
  return null
}

/**
 * Parse un élément gradFill PPTX en PptxGradient
 */
function parseGradient(gradEl: Element, themeMap: Record<string, string>): PptxGradient {
  const stops: PptxGradientStop[] = []
  for (const gs of Array.from(gradEl.getElementsByTagName('a:gs'))) {
    const pos = parseInt(gs.getAttribute('pos') ?? '0', 10) / 100000
    for (const child of Array.from(gs.children)) {
      const c = resolveColorEl(child, themeMap)
      if (c) { stops.push({ position: pos, color: c }); break }
    }
  }
  const lin = gradEl.getElementsByTagName('a:lin')[0]
  const angle = lin ? parseInt(lin.getAttribute('ang') ?? '0', 10) / 60000 : 90
  return { type: 'linear', angle, stops }
}

/**
 * Cherche un gradFill dans les enfants directs d'un conteneur
 * et retourne le PptxGradient correspondant, ou null si absent.
 */
function resolveGradient(container: Element, themeMap: Record<string, string>): PptxGradient | null {
  for (const child of Array.from(container.children)) {
    if (child.localName === 'gradFill') {
      return parseGradient(child, themeMap)
    }
  }
  return null
}

/**
 * Résout le remplissage d'un conteneur (spPr, a:ln, p:bgPr…)
 * Cherche UNIQUEMENT dans les enfants DIRECTS pour éviter de lire
 * le solidFill du stroke (a:ln) quand on inspecte spPr.
 * Retourne { color, explicit } :
 *   explicit=true → fill déclaré (même noFill transparent)
 *   explicit=false → aucun fill → utiliser le fallback de style
 */
function resolveFill(
  container: Element,
  themeMap: Record<string, string>,
): { color: PptxColor | null; explicit: boolean } {
  for (const child of Array.from(container.children)) {
    const name = child.localName

    // noFill → transparent explicite
    if (name === 'noFill') return { color: null, explicit: true }

    // solidFill → couleur directe
    if (name === 'solidFill') {
      for (const cc of Array.from(child.children)) {
        const c = resolveColorEl(cc, themeMap)
        if (c) return { color: c, explicit: true }
      }
      return { color: { hex: '#000000', alpha: 1 }, explicit: true }
    }

    // gradFill → première couleur du premier gradient stop
    if (name === 'gradFill') {
      const stops = child.getElementsByTagName('a:gs')
      if (stops.length > 0) {
        for (const cc of Array.from(stops[0].children)) {
          const c = resolveColorEl(cc, themeMap)
          if (c) return { color: c, explicit: true }
        }
      }
      return { color: { hex: '#888888', alpha: 1 }, explicit: true }
    }
  }

  return { color: null, explicit: false }
}

/**
 * Wrapper compatible ascendant : résout la couleur d'un conteneur
 * (utilisé pour texte, contours)
 */
function resolveColor(
  el: Element | null,
  themeMap: Record<string, string>,
): PptxColor | null {
  if (!el) return null
  return resolveFill(el, themeMap).color
}

// ─── Thème ────────────────────────────────────────────────────────────────────

function parseTheme(xml: string): Record<string, string> {
  const doc = parseXml(xml)
  const map: Record<string, string> = {}
  // Les tags dans a:clrScheme utilisent a:accent1…a:accent6 (pas a:acc1)
  const colorTags = [
    'a:dk1','a:lt1','a:dk2','a:lt2',
    'a:accent1','a:accent2','a:accent3','a:accent4','a:accent5','a:accent6',
    'a:hlink','a:folHlink',
  ]
  const clrScheme = tag(doc, 'a:clrScheme')
  if (!clrScheme) return map
  for (const t of colorTags) {
    const el = tag(clrScheme, t)
    if (!el) continue
    const key = t.replace('a:', '')  // 'accent1', 'dk1', etc.
    const srgb = tag(el, 'a:srgbClr') ?? tag(el, 'a:sysClr')
    if (srgb) map[key] = srgb.getAttribute('val') ?? srgb.getAttribute('lastClr') ?? ''
  }
  return map
}

// ─── Texte ────────────────────────────────────────────────────────────────────

function parseRun(r: Element, defRPr: Element | null, themeMap: Record<string, string>): PptxRun {
  const rPr = tag(r, 'a:rPr') ?? defRPr
  const t = tag(r, 'a:t')

  const sz = rPr ? (parseInt(rPr.getAttribute('sz') ?? '1800', 10) / 100) : 18
  const bold = rPr?.getAttribute('b') === '1'
  const italic = rPr?.getAttribute('i') === '1'
  const underline = !!(rPr?.getAttribute('u') && rPr.getAttribute('u') !== 'none')
  const strike = rPr?.getAttribute('strike') === 'sngStrike'

  const latin = rPr ? tag(rPr, 'a:latin') : null
  const fontFamily = latin?.getAttribute('typeface') ?? '+mj-lt'  // fallback thème

  let color: PptxColor | null = null
  if (rPr) color = resolveColor(rPr, themeMap)

  return {
    text: t?.textContent ?? '',
    bold, italic, underline, strike,
    sz, fontFamily: fontFamily.startsWith('+') ? 'Calibri' : fontFamily,
    color,
  }
}

function parseParagraph(p: Element, themeMap: Record<string, string>): PptxParagraph {
  const pPr = tag(p, 'a:pPr')
  const alignMap: Record<string, PptxParagraph['align']> = {
    l: 'left', ctr: 'center', r: 'right', just: 'justify',
  }
  const align = alignMap[pPr?.getAttribute('algn') ?? 'l'] ?? 'left'

  const spcBef = tag(pPr ?? p, 'a:spcBef')
  const spcAft = tag(pPr ?? p, 'a:spcAft')
  const spaceBefore = spcBef ? n(tag(spcBef, 'a:spcPts'), 'val') * 127 : 0  // pts → EMU
  const spaceAfter = spcAft ? n(tag(spcAft, 'a:spcPts'), 'val') * 127 : 0

  const defRPr = tag(p, 'a:defRPr')
  const runs = tags(p, 'a:r').map((r) => parseRun(r, defRPr, themeMap))

  return { align, runs, spaceBefore, spaceAfter }
}

function parseTextBody(txBody: Element, themeMap: Record<string, string>): PptxTextBody {
  const bodyPr = tag(txBody, 'a:bodyPr')
  const anchorMap: Record<string, PptxTextBody['anchor']> = {
    t: 'top', ctr: 'middle', b: 'bottom',
  }
  const anchor = anchorMap[bodyPr?.getAttribute('anchor') ?? 't'] ?? 'top'

  // Insets en EMU (défauts PowerPoint)
  const l = bodyPr ? parseInt(bodyPr.getAttribute('lIns') ?? '91440', 10) : 91440
  const r = bodyPr ? parseInt(bodyPr.getAttribute('rIns') ?? '91440', 10) : 91440
  const t = bodyPr ? parseInt(bodyPr.getAttribute('tIns') ?? '45720', 10) : 45720
  const b = bodyPr ? parseInt(bodyPr.getAttribute('bIns') ?? '45720', 10) : 45720

  const paragraphs = tags(txBody, 'a:p').map((p) => parseParagraph(p, themeMap))

  return { paragraphs, anchor, insets: { l, r, t, b } }
}

// ─── Éléments (formes, images) ────────────────────────────────────────────────

function parseTransform(spPr: Element): PptxTransform {
  const xfrm = tag(spPr, 'a:xfrm')
  const off = tag(spPr, 'a:off')
  const ext = tag(spPr, 'a:ext')

  const rot = xfrm ? (parseInt(xfrm.getAttribute('rot') ?? '0', 10) / 60000) : 0
  const flipH = xfrm?.getAttribute('flipH') === '1'
  const flipV = xfrm?.getAttribute('flipV') === '1'

  return {
    x: n(off, 'x'), y: n(off, 'y'),
    cx: n(ext, 'cx'), cy: n(ext, 'cy'),
    rot, flipH, flipV,
  }
}

function parseShape(sp: Element, themeMap: Record<string, string>): PptxShape {
  const spPr = tag(sp, 'p:spPr')!
  const tf = parseTransform(spPr)

  // Géométrie
  const prstGeom = tag(spPr, 'a:prstGeom')
  const prst = prstGeom?.getAttribute('prst') ?? 'rect'
  const geomMap: Record<string, PptxShape['geom']> = {
    rect: 'rect', ellipse: 'ellipse', circle: 'ellipse',
    roundRect: 'roundRect', line: 'line', straightConnector1: 'line',
    triangle: 'triangle', isoscelesTri: 'triangle', rtTriangle: 'triangle',
  }
  const geom = geomMap[prst] ?? 'other'

  // Coins arrondis : lire adj dans a:avLst > a:gd[name="adj"] (défaut 16667)
  let cornerAdj = 0
  if (geom === 'roundRect' && prstGeom) {
    const avLst = tag(prstGeom, 'a:avLst')
    if (avLst) {
      for (const gd of Array.from(avLst.getElementsByTagName('a:gd'))) {
        if (gd.getAttribute('name') === 'adj') {
          const fmla = gd.getAttribute('fmla') ?? ''
          const match = fmla.match(/val\s+(\d+)/)
          cornerAdj = match ? parseInt(match[1], 10) : 16667
          break
        }
      }
    }
    if (cornerAdj === 0) cornerAdj = 16667  // valeur PowerPoint par défaut
  }

  // Remplissage : spPr en priorité, puis p:style > a:fillRef comme fallback
  let fill: PptxColor | null = null
  let fillGradient: PptxGradient | undefined
  const spFill = resolveFill(spPr, themeMap)
  if (spFill.explicit) {
    fill = spFill.color
    // Tenter de récupérer le gradient complet si c'est un gradFill
    const grad = resolveGradient(spPr, themeMap)
    if (grad) fillGradient = grad
  } else {
    const styleEl = tag(sp, 'p:style')
    const fillRef = styleEl ? tag(styleEl, 'a:fillRef') : null
    // idx=0 → pas de remplissage de style
    if (fillRef && parseInt(fillRef.getAttribute('idx') ?? '1', 10) > 0) {
      for (const child of Array.from(fillRef.children)) {
        const c = resolveColorEl(child, themeMap)
        if (c) { fill = c; break }
      }
    }
  }

  // Contour : uniquement depuis spPr > a:ln (déclaration explicite dans la forme)
  // On n'utilise PAS lnRef comme fallback : il cause des bordures parasites sur des
  // formes qui n'en ont pas dans PowerPoint.
  const ln = tag(spPr, 'a:ln')
  let stroke: PptxColor | null = null
  let strokeWidth = 0

  if (ln) {
    const lnFill = resolveFill(ln, themeMap)
    // lnFill.explicit=false si a:ln est vide → aucune bordure
    if (lnFill.explicit && lnFill.color) {
      stroke = lnFill.color
      strokeWidth = n(ln, 'w')
    }
  }


  // Ombre extérieure
  const effectLst = tag(spPr, 'a:effectLst')
  let shadow: PptxShadow | undefined
  if (effectLst) {
    const outerShdw = tag(effectLst, 'a:outerShdw')
    if (outerShdw) {
      const blurRad = parseInt(outerShdw.getAttribute('blurRad') ?? '0', 10)
      const dist = parseInt(outerShdw.getAttribute('dist') ?? '0', 10)
      const dir = parseInt(outerShdw.getAttribute('dir') ?? '0', 10) / 60000
      const rad = dir * Math.PI / 180
      const offsetX = Math.round(dist * Math.cos(rad))
      const offsetY = Math.round(dist * Math.sin(rad))
      for (const child of Array.from(outerShdw.children)) {
        const c = resolveColorEl(child, themeMap)
        if (c) { shadow = { color: c, blurRad, offsetX, offsetY }; break }
      }
    }
  }

  // Texte
  const txBody = tag(sp, 'p:txBody')
  const textBody = txBody ? parseTextBody(txBody, themeMap) : undefined

  return { kind: 'shape', geom, tf, fill, fillGradient, stroke, strokeWidth, cornerAdj, shadow, textBody }
}

// ─── Parsing principal ────────────────────────────────────────────────────────

export async function parsePptx(file: File): Promise<PptxSlide> {
  const zip = await JSZip.loadAsync(await file.arrayBuffer())

  // Thème
  let themeMap: Record<string, string> = {}
  const themeFile = zip.file('ppt/theme/theme1.xml')
  if (themeFile) {
    themeMap = parseTheme(await themeFile.async('string'))
  }

  // Dimensions de la slide (ppt/presentation.xml)
  const presXml = await zip.file('ppt/presentation.xml')?.async('string') ?? ''
  const presDoc = parseXml(presXml)
  const sldSz = tag(presDoc, 'p:sldSz')
  // Fallback regex si getElementsByTagName ne résout pas le namespace
  const widthEmu = n(sldSz, 'cx') || attrFromRaw(presXml, 'sldSz', 'cx') || 9144000
  const heightEmu = n(sldSz, 'cy') || attrFromRaw(presXml, 'sldSz', 'cy') || 6858000

  // Relations de la première slide → médias
  const relsXml = await zip.file('ppt/slides/_rels/slide1.xml.rels')?.async('string') ?? ''
  const relsDoc = parseXml(relsXml)
  const mediaMap = new Map<string, string>()  // rId → data URL

  await Promise.all(
    tags(relsDoc, 'Relationship').map(async (rel) => {
      const id = rel.getAttribute('Id') ?? ''
      const target = rel.getAttribute('Target') ?? ''
      const type = rel.getAttribute('Type') ?? ''
      if (!type.includes('image')) return

      const path = target.startsWith('../')
        ? `ppt/${target.slice(3)}`
        : `ppt/slides/${target}`
      const entry = zip.file(path)
      if (!entry) return

      const buf = await entry.async('uint8array')
      const ext = path.split('.').pop()?.toLowerCase() ?? 'png'
      const mime = ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg'
        : ext === 'gif' ? 'image/gif'
        : ext === 'svg' ? 'image/svg+xml'
        : 'image/png'
      const b64 = uint8ToBase64(buf)
      mediaMap.set(id, `data:${mime};base64,${b64}`)
    })
  )

  // Parse slide1.xml
  const slideXml = await zip.file('ppt/slides/slide1.xml')?.async('string') ?? ''
  const slideDoc = parseXml(slideXml)

  // Fond de slide (p:bg)
  let background: PptxColor | null = null
  let backgroundGradient: PptxGradient | undefined
  const bgEl = tag(slideDoc, 'p:bg')
  if (bgEl) {
    const bgPr = tag(bgEl, 'p:bgPr')
    if (bgPr) {
      background = resolveFill(bgPr, themeMap).color
      const bgGrad = resolveGradient(bgPr, themeMap)
      if (bgGrad) backgroundGradient = bgGrad
    }
  }

  const elements: PptxElement[] = []

  // Formes
  for (const sp of tags(slideDoc, 'p:sp')) {
    try {
      const shape = parseShape(sp, themeMap)
      // Ignorer les éléments sans taille visible
      if (shape.tf.cx > 0 && shape.tf.cy > 0) elements.push(shape)
    } catch { /* skip invalid shapes */ }
  }

  // Images
  for (const pic of tags(slideDoc, 'p:pic')) {
    try {
      const spPr = tag(pic, 'p:spPr')!
      const tf = parseTransform(spPr)
      const blip = tag(pic, 'a:blip')
      // r:embed peut être un attribut qualifié ou un attribut avec namespace
      const rId = blip?.getAttributeNS(
        'http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'embed',
      ) ?? blip?.getAttribute('r:embed') ?? ''
      const dataUrl = mediaMap.get(rId) ?? ''
      if (tf.cx > 0 && tf.cy > 0 && dataUrl) {
        elements.push({ kind: 'picture', tf, dataUrl })
      }
    } catch { /* skip invalid pictures */ }
  }

  return { widthEmu, heightEmu, background, backgroundGradient, elements }
}
