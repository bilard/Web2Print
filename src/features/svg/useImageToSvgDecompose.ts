/**
 * Hook orchestrant la décomposition d'un projet image-to-svg via Google Vision API.
 *
 * 3 règles strictes issues du diagnostic Vision sur l'image Heineken Carrefour :
 *
 *  1. **Filtre géométrique** : tout paragraph dont le centre tombe dans la zone
 *     centrale de l'image (x∈[20%,80%] ET y∈[10%,90%]) est SKIPPÉ — c'est la
 *     zone où le packaging photographié est typiquement placé sur une créa retail.
 *     Les textes éditoriaux (bandeaux promo, descriptions) sont sur les bords
 *     gauche/droit/haut/bas.
 *
 *  2. **Détection multi-ligne** : Vision merge parfois plusieurs lignes visuelles
 *     en un seul paragraph (ex : "Bière blonde \"Format Spécial\"" + "HEINEKEN"
 *     en bbox h=81px). On regroupe les `words` par y similaire (clustering vertical)
 *     pour compter le nombre de lignes, et on divise `fontSize` par ce nombre.
 *
 *  3. **PAS de masques automatiques** : on crée uniquement les Textbox éditables.
 *     L'utilisateur édite → la nouvelle valeur recouvre visuellement le texte
 *     raster d'origine. Si tu veux masquer complètement, utilise les outils Rect
 *     manuels de la toolbar. Plus de "blocs blancs fantômes" possibles.
 *
 *  + lock automatique du calque bg-image-locked (selectable+evented=false) pour
 *    laisser passer les clics aux Textbox au-dessus.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { FabricImage, Group, Rect, Textbox } from 'fabric'
import type { Canvas, FabricObject } from 'fabric'
import { toast } from 'sonner'
import { globalFabricCanvas } from '@/features/editor/CanvasContainer'
import { syncToStore as _syncToStore } from '@/features/editor/useAddObject'
import { useEditorStore } from '@/stores/editor.store'
import { decomposeWithGoogleVision } from './googleVisionDecompose'
import type { VisionParagraph, VisionWord, VisionDecomposeResult } from './googleVisionDecompose'
import { detectPriceClusters, cropToDataUri, readPriceFromImage, parsePriceParts, classifyLogoTexts } from './refinePrices'
import { semanticLayout, type LayoutBlock } from './semanticLayout'

// ─────────────────────────────────────────────────────────────────────────────
// Bypass de la synchronisation Zustand pour les usages hors-éditeur (workflow).
// Les algorithmes (decomposeHeuristic / decomposeSemantic) appellent syncToStore
// au fil de leurs passes. Quand decomposeOnCanvas est invoqué sur un canvas
// offscreen (node workflow), on désactive ces syncs pour ne pas écraser l'état
// éditeur. Le flag est rétabli en finally (thread single-call, pas de concurrence).
// ─────────────────────────────────────────────────────────────────────────────
let _skipStoreSync = false
function syncToStore(canvas: NonNullable<typeof globalFabricCanvas>): void {
  if (!_skipStoreSync) _syncToStore(canvas)
}

interface DecomposeState {
  canDecompose: boolean
  isRunning: boolean
  hasDecomposition: boolean
}

// ─────────────────────────────────────────────────────────────────────────────
// Détection / lock du calque bg
// ─────────────────────────────────────────────────────────────────────────────

const isBgLockedMarker = (obj: FabricObject): boolean => {
  const data = (obj as FabricObject & { data?: Record<string, unknown> }).data
  return data?.role === 'image-bg-locked' || data?.name === 'image-bg-locked'
}

const firstImageIn = (g: Group): FabricImage | null => {
  for (const child of (g as unknown as { _objects?: unknown[] })._objects ?? []) {
    if (child instanceof FabricImage) return child
    if (child instanceof Group) {
      const nested = firstImageIn(child)
      if (nested) return nested
    }
  }
  return null
}

const findBgImage = (): FabricImage | null => {
  const canvas = globalFabricCanvas
  if (!canvas) return null
  const root = canvas.getObjects().find(isBgLockedMarker)
  if (!root) return null
  if (root instanceof FabricImage) return root
  if (root instanceof Group) return firstImageIn(root)
  return null
}

const findBgImageIn = (canvas: Canvas): FabricImage | null => {
  const root = canvas.getObjects().find(isBgLockedMarker)
  if (!root) return null
  if (root instanceof FabricImage) return root
  if (root instanceof Group) return firstImageIn(root)
  return null
}

function lockBgRoot(root: FabricObject): void {
  // Ne touche PAS à `visible` : c'est géré séparément par run()/undoDecompose pour
  // cacher l'image bg après décomposition (template propre sans superposition).
  root.set({
    selectable: false,
    evented: false,
    lockMovementX: true,
    lockMovementY: true,
    lockScalingX: true,
    lockScalingY: true,
    lockRotation: true,
    hasControls: false,
    hoverCursor: 'default',
  })
  if (root instanceof Group) {
    for (const child of (root as unknown as { _objects?: FabricObject[] })._objects ?? []) {
      child.set({ selectable: false, evented: false, hasControls: false, hoverCursor: 'default' })
      if (child instanceof Group) lockBgRoot(child)
    }
  }
}

const isDecomposeOverlay = (obj: FabricObject): boolean => {
  const role = (obj as FabricObject & { data?: Record<string, unknown> }).data?.role
  return role === 'image-decompose-text' || role === 'image-decompose-mask'
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers image source
// ─────────────────────────────────────────────────────────────────────────────

const getImageSrc = (img: FabricImage): string | null => {
  const a = img as unknown as { getSrc?: () => string; _element?: HTMLImageElement; _originalElement?: HTMLImageElement }
  return a.getSrc?.() ?? a._originalElement?.src ?? a._element?.src ?? null
}

async function fetchUrlAsDataUri(url: string): Promise<string> {
  const r = await fetch(url, { mode: 'cors' })
  if (!r.ok) throw new Error(`Téléchargement image source échoué (${r.status})`)
  const blob = await r.blob()
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(reader.error ?? new Error('FileReader error'))
    reader.readAsDataURL(blob)
  })
}

const loadHtmlImage = (dataUri: string): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('HTMLImage load failed'))
    img.src = dataUri
  })

// ─────────────────────────────────────────────────────────────────────────────
// Filtre géométrique : skip textes du centre de l'image (zone produit)
// ─────────────────────────────────────────────────────────────────────────────

function isInProductZone(bbox: VisionParagraph['bbox'], imgW: number, imgH: number): boolean {
  const cx = bbox.left + bbox.width / 2
  const cy = bbox.top + bbox.height / 2
  const xRatio = cx / imgW
  const yRatio = cy / imgH
  // Zone produit centrale : 20-80% horizontal, 10-82% vertical. Le bas (y > 82%)
  // est réservé à la description produit/mentions légales qu'on veut garder.
  if (xRatio >= 0.2 && xRatio <= 0.8 && yRatio >= 0.1 && yRatio <= 0.82) return true
  // Texte vertical : presque toujours sur un emballage produit (mention "ORIGINAL"
  // côté pack Heineken, code-barre etc.). Le ratio 2× est large pour ne pas
  // attraper de simples "j" / "y" isolés.
  if (bbox.height > bbox.width * 2) return true
  return false
}

// ─────────────────────────────────────────────────────────────────────────────
// Détection multi-ligne : regroupe les words par y similaire
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Compte le nombre de lignes visuelles dans un paragraph en regroupant les words
 * dont le centre y est dans une fenêtre similaire (< 50% de la médiane des hauteurs
 * de words). Retourne au minimum 1.
 */
function countLines(words: VisionWord[]): number {
  if (words.length <= 1) return 1
  const wHeights = words.map((w) => w.bbox.height).sort((a, b) => a - b)
  const medianH = wHeights[Math.floor(wHeights.length / 2)]
  const yCenters = words.map((w) => w.bbox.top + w.bbox.height / 2)
  // Cluster simple : trie les centers y, compte les "gaps" > medianH × 0.6
  const sorted = [...yCenters].sort((a, b) => a - b)
  let lines = 1
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i] - sorted[i - 1] > medianH * 0.6) lines++
  }
  return lines
}

/**
 * Détecte l'alignement d'un paragraphe multi-ligne (fer à gauche / centré / fer à
 * droite) en comparant la DISPERSION des bords de ligne relativement à la bbox :
 *  - bords GAUCHE quasi constants  → fer à gauche
 *  - bords DROITE quasi constants  → fer à droite
 *  - CENTRES quasi constants       → centré
 * On retient la dispersion la plus faible (gauche en cas d'égalité = défaut courant).
 * Mono-ligne → `null` (indétectable) : l'appelant lui assigne l'alignement DOMINANT
 * de la composition (sinon un bloc mono-ligne d'une compo centrée serait fer à gauche
 * et son centre ne tomberait pas sur l'axe commun).
 */
function detectTextAlign(words: VisionWord[], box: { left: number; width: number }): 'left' | 'center' | 'right' | null {
  if (words.length <= 1) return null
  const wHeights = words.map((w) => w.bbox.height).sort((a, b) => a - b)
  const medianH = wHeights[Math.floor(wHeights.length / 2)]
  const yc = (w: VisionWord) => w.bbox.top + w.bbox.height / 2
  const sorted = [...words].sort((a, b) => yc(a) - yc(b))
  const lines: VisionWord[][] = [[sorted[0]]]
  for (let i = 1; i < sorted.length; i++) {
    if (yc(sorted[i]) - yc(sorted[i - 1]) > medianH * 0.6) lines.push([sorted[i]])
    else lines[lines.length - 1].push(sorted[i])
  }
  if (lines.length <= 1) return null
  const boxRight = box.left + box.width
  const boxCenter = box.left + box.width / 2
  const lefts: number[] = []
  const rights: number[] = []
  const centers: number[] = []
  for (const ln of lines) {
    const l = Math.min(...ln.map((w) => w.bbox.left))
    const r = Math.max(...ln.map((w) => w.bbox.left + w.bbox.width))
    lefts.push(l - box.left)
    rights.push(boxRight - r)
    centers.push((l + r) / 2 - boxCenter)
  }
  const spread = (arr: number[]) => Math.max(...arr) - Math.min(...arr)
  const sL = spread(lefts)
  const sR = spread(rights)
  const sC = spread(centers)
  if (sL <= sR && sL <= sC) return 'left'
  if (sR <= sC) return 'right'
  return 'center'
}

interface CharStyle { fontSize: number; deltaY: number }
type TextStyles = Record<number, Record<number, CharStyle>>

/**
 * Reconstruit le texte d'un paragraph en PRÉSERVANT les retours chariots ET les
 * tailles individuelles des mots. Vision merge les lignes visuelles en une chaîne
 * espacée à taille unique ; on les re-sépare (words groupés par y, même seuil que
 * `countLines`, triés par x). Les mots COURTS (≤3 chars) nettement plus petits que
 * le plus grand mot de leur ligne (h < 0.72×) — typiquement un exposant "%", "°",
 * "®" — reçoivent un style par-caractère (fontSize proportionnelle + `deltaY` négatif
 * s'ils sont dans la moitié haute = surélevés). Index calculés inline en répliquant
 * le collage de ponctuation (pas d'espace avant `.,:;%€`) pour rester exacts.
 * Le nettoyage utilise des bornes par-caractère, jamais `\s`, pour ne PAS manger `\n`.
 */
function buildTextAndStyles(words: VisionWord[], fontSizePx: number): { text: string; styles: TextStyles } {
  if (words.length === 0) return { text: '', styles: {} }
  // NB : on ne court-circuite PAS à 1 word — le cas "-50%" en un seul word doit
  // quand même passer par l'heuristique exposant "%" en fin de fonction.
  const wHeights = words.map((w) => w.bbox.height).sort((a, b) => a - b)
  const medianH = wHeights[Math.floor(wHeights.length / 2)]
  const yCenter = (w: VisionWord) => w.bbox.top + w.bbox.height / 2
  const sorted = [...words].sort((a, b) => yCenter(a) - yCenter(b))
  const lines: VisionWord[][] = [[sorted[0]]]
  for (let i = 1; i < sorted.length; i++) {
    if (yCenter(sorted[i]) - yCenter(sorted[i - 1]) > medianH * 0.6) lines.push([sorted[i]])
    else lines[lines.length - 1].push(sorted[i])
  }
  const styles: TextStyles = {}
  const lineTexts: string[] = []
  lines.forEach((line, lineIdx) => {
    const ws = [...line].sort((a, b) => a.bbox.left - b.bbox.left)
    const lineMaxH = Math.max(...ws.map((w) => w.bbox.height))
    const lineTop = Math.min(...ws.map((w) => w.bbox.top))
    const lineBottom = Math.max(...ws.map((w) => w.bbox.top + w.bbox.height))
    const lineCenter = (lineTop + lineBottom) / 2
    const lineStyle: Record<number, CharStyle> = {}
    let str = ''
    ws.forEach((w, wi) => {
      if (wi > 0 && !/^[.,:;%€]/.test(w.text)) str += ' ' // pas d'espace avant ponctuation collante
      const start = str.length
      str += w.text
      const isSmall = w.text.trim().length <= 3 && w.bbox.height < lineMaxH * 0.72
      if (isSmall) {
        const styledFs = Math.max(Math.round(fontSizePx * (w.bbox.height / lineMaxH)), 8)
        const raised = yCenter(w) < lineCenter ? -Math.round((fontSizePx - styledFs) * 0.6) : 0
        for (let i = start; i < str.length; i++) lineStyle[i] = { fontSize: styledFs, deltaY: raised }
      }
    })
    if (Object.keys(lineStyle).length > 0) styles[lineIdx] = lineStyle
    lineTexts.push(str)
  })

  // Heuristique exposant "%": un libellé promo type "-50%" / "50%" (chiffres + %,
  // rien d'autre) → le "%" est un exposant réduit, même si Vision a mergé tout le
  // libellé en un seul word (donc non détecté par la taille de bbox ci-dessus).
  // Sûr car distinct de "5% vol., 15 x 25 cl." (du texte suit le %, ne matche pas).
  lineTexts.forEach((str, lineIdx) => {
    if (!/^[\s\-–−]*\d{1,3}\s*%\s*$/.test(str)) return
    const pctIdx = str.indexOf('%')
    if (pctIdx < 0) return
    const lineStyle = styles[lineIdx] ?? (styles[lineIdx] = {})
    if (lineStyle[pctIdx]) return // déjà stylé par la détection par-mot
    const styledFs = Math.max(Math.round(fontSizePx * 0.55), 8)
    // deltaY = −(corps − petit)×0.72 → le HAUT du "%" s'aligne sur le haut des chiffres
    // (0.72 = ratio capitale ; à 0.6 le "%" restait trop bas / décalé).
    lineStyle[pctIdx] = { fontSize: styledFs, deltaY: -Math.round((fontSizePx - styledFs) * 0.72) }
  })

  // Heuristique exposant ORDINAUX : un suffixe ordinal français collé à un chiffre
  // ("2ÈME", "2ème", "1er", "2nd"…) s'écrit en exposant réduit. Vision rend "2ÈME"
  // comme un seul word → la détection par-taille ne le voit pas. On repère `chiffre +
  // suffixe` et on réduit/surélève les lettres du suffixe. Les unités (cl, ml, kg…)
  // ne sont PAS dans l'ensemble ordinal → non touchées.
  const ORDINALS = new Set(['eme', 'er', 'ere', 're', 'nd', 'nde'])
  const deaccent = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  lineTexts.forEach((str, lineIdx) => {
    const re = /(\d)([A-Za-zÀ-ÿ]{1,4})/g
    const styledFs = Math.max(Math.round(fontSizePx * 0.55), 8)
    const deltaY = -Math.round((fontSizePx - styledFs) * 0.6)
    let m: RegExpExecArray | null
    let touched = false
    const lineStyle = styles[lineIdx] ?? {}
    while ((m = re.exec(str)) !== null) {
      if (!ORDINALS.has(deaccent(m[2]))) continue
      const start = m.index + 1 // juste après le chiffre
      for (let i = start; i < start + m[2].length; i++) {
        if (!lineStyle[i]) { lineStyle[i] = { fontSize: styledFs, deltaY }; touched = true }
      }
    }
    if (touched) styles[lineIdx] = lineStyle
  })

  return { text: lineTexts.join('\n'), styles }
}

// ─────────────────────────────────────────────────────────────────────────────
// Échantillonnage couleur texte (pixel le plus contrasté dans la bbox)
// ─────────────────────────────────────────────────────────────────────────────

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))
const toHex = (r: number, g: number, b: number): string =>
  '#' + [r, g, b].map((c) => clamp(Math.round(c), 0, 255).toString(16).padStart(2, '0')).join('')

/**
 * Échantillonne la couleur de fond AUTOUR de la bbox + mesure la variance entre
 * les samples. Variance basse = fond uniforme (bandeau promo) → on retourne la
 * couleur médiane. Variance haute = fond texturé → on retourne null (pas de masque).
 */
function sampleBackground(
  ctx: CanvasRenderingContext2D,
  box: VisionParagraph['bbox'],
  imgW: number,
  imgH: number,
): { hex: string; uniform: boolean } {
  const margin = 6
  const points: Array<[number, number]> = []
  const xMids = [box.left + box.width * 0.2, box.left + box.width * 0.5, box.left + box.width * 0.8]
  const yMids = [box.top + box.height * 0.2, box.top + box.height * 0.5, box.top + box.height * 0.8]
  for (const x of xMids) {
    points.push([x, box.top - margin])
    points.push([x, box.top + box.height + margin])
  }
  for (const y of yMids) {
    points.push([box.left - margin, y])
    points.push([box.left + box.width + margin, y])
  }
  const rs: number[] = []
  const gs: number[] = []
  const bs: number[] = []
  for (const [x, y] of points) {
    const px = Math.round(clamp(x, 0, imgW - 1))
    const py = Math.round(clamp(y, 0, imgH - 1))
    try {
      const d = ctx.getImageData(px, py, 1, 1).data
      rs.push(d[0]); gs.push(d[1]); bs.push(d[2])
    } catch {/* ignore */}
  }
  if (rs.length === 0) return { hex: '#ffffff', uniform: false }
  const median = (vals: number[]): number => {
    const s = [...vals].sort((a, b) => a - b)
    return s[Math.floor(s.length / 2)]
  }
  const variance = (Math.max(...rs) - Math.min(...rs)) + (Math.max(...gs) - Math.min(...gs)) + (Math.max(...bs) - Math.min(...bs))
  // Variance L1 < 60 = fond uniforme (bandeau promo solide)
  return { hex: toHex(median(rs), median(gs), median(bs)), uniform: variance < 60 }
}

/**
 * Échantillonne la couleur du texte = pixel à l'intérieur de la bbox dont la
 * distance colorimétrique au fond échantillonné est MAXIMALE. Approche fiable
 * que la précédente "groupe minoritaire par luminance" qui se trompait sur les
 * gros textes (où le texte couvre + de pixels que le fond inter-caractère).
 */
function sampleTextColor(
  ctx: CanvasRenderingContext2D,
  box: VisionParagraph['bbox'],
  bgHex: string,
  imgW: number,
  imgH: number,
): string {
  const bgR = parseInt(bgHex.slice(1, 3), 16)
  const bgG = parseInt(bgHex.slice(3, 5), 16)
  const bgB = parseInt(bgHex.slice(5, 7), 16)

  // Lit l'intérieur inset 10% (évite les bords où le fond domine)
  const inset = 0.1
  const x0 = Math.round(clamp(box.left + box.width * inset, 0, imgW - 1))
  const y0 = Math.round(clamp(box.top + box.height * inset, 0, imgH - 1))
  const x1 = Math.round(clamp(box.left + box.width * (1 - inset), 0, imgW - 1))
  const y1 = Math.round(clamp(box.top + box.height * (1 - inset), 0, imgH - 1))
  const w = Math.max(1, x1 - x0)
  const h = Math.max(1, y1 - y0)
  let data: Uint8ClampedArray
  try { data = ctx.getImageData(x0, y0, w, h).data } catch { return '#000000' }

  // Sample 1 pixel sur N pour limiter le coût
  const step = Math.max(1, Math.floor(Math.sqrt((w * h) / 500)))

  // Collecte les pixels "loin du fond" (distance > seuil) puis prend leur couleur
  // médiane — robuste à un pixel exceptionnel.
  const candidates: Array<[number, number, number]> = []
  let maxDist = 0
  let absoluteMax: [number, number, number] = [0, 0, 0]
  for (let i = 0; i < data.length; i += step * 4) {
    const r = data[i], g = data[i + 1], b = data[i + 2]
    const d = Math.abs(r - bgR) + Math.abs(g - bgG) + Math.abs(b - bgB)
    if (d > maxDist) { maxDist = d; absoluteMax = [r, g, b] }
    if (d > 80) candidates.push([r, g, b])
  }

  // Contraste faible : fallback noir/blanc selon luminance du fond
  if (maxDist < 50) {
    const bgLum = bgR * 0.299 + bgG * 0.587 + bgB * 0.114
    return bgLum > 128 ? '#000000' : '#ffffff'
  }

  // Si on a des candidats clairement contrastés, prendre la médiane.
  if (candidates.length >= 3) {
    const median = (vals: number[]): number => {
      const s = [...vals].sort((a, b) => a - b)
      return s[Math.floor(s.length / 2)]
    }
    return toHex(
      median(candidates.map((c) => c[0])),
      median(candidates.map((c) => c[1])),
      median(candidates.map((c) => c[2])),
    )
  }
  // Sinon prendre directement le pixel le plus éloigné
  return toHex(absoluteMax[0], absoluteMax[1], absoluteMax[2])
}

// ─────────────────────────────────────────────────────────────────────────────
// Construction Textbox
// ─────────────────────────────────────────────────────────────────────────────

function buildMaskRect(box: VisionParagraph['bbox'], fill: string, padX: number, padY: number = padX): Rect {
  const r = new Rect({
    originX: 'left',
    originY: 'top',
    left: box.left - padX,
    top: box.top - padY,
    width: box.width + padX * 2,
    height: box.height + padY * 2,
    fill,
    strokeWidth: 0,
    selectable: true,
    evented: true,
    objectCaching: true,
  })
  ;(r as FabricObject & { data?: Record<string, unknown> }).data = {
    role: 'image-decompose-mask',
    name: '',
    type: 'rect',
  }
  return r
}

/**
 * Détecte les FILETS de séparation horizontaux de la créa (ex. le trait entre deux
 * blocs de prix). Vision ne les voit pas (pas du texte) → ils disparaîtraient. On
 * scanne l'image source : un filet = un long run CONTINU de pixels sombres, fin,
 * bordé de clair au-dessus ET en-dessous. Le texte, lui, a des trous entre lettres
 * → run court (filtré par minRun). Universel, aucune coordonnée en dur.
 */
function detectSeparatorRects(ctx: CanvasRenderingContext2D, width: number, height: number): Rect[] {
  let data: Uint8ClampedArray
  try { data = ctx.getImageData(0, 0, width, height).data } catch { return [] }
  const lum = (x: number, y: number): number => {
    const i = (y * width + x) * 4
    return 0.3 * data[i] + 0.59 * data[i + 1] + 0.11 * data[i + 2]
  }
  const DARK = 150   // pixel du filet
  const LIGHT = 195  // fond clair (blanc/jaune) au-dessus et en-dessous
  const GAP = 3      // distance verticale d'échantillonnage du fond
  const minRun = Math.max(Math.round(width * 0.06), 40)
  const rects: Rect[] = []
  const used = new Set<number>()
  for (let y = GAP; y < height - GAP; y++) {
    if (used.has(y)) continue
    let start = -1, bStart = -1, bLen = 0
    for (let x = 0; x < width; x++) {
      const isLine = lum(x, y) < DARK && lum(x, y - GAP) > LIGHT && lum(x, y + GAP) > LIGHT
      if (isLine) {
        if (start < 0) start = x
        const len = x - start + 1
        if (len > bLen) { bLen = len; bStart = start }
      } else start = -1
    }
    if (bLen < minRun) continue
    if (isInProductZone({ left: bStart, top: y, width: bLen, height: 2 }, width, height)) continue
    const midX = bStart + (bLen >> 1)
    let t = 1
    while (y + t < height && lum(midX, y + t) < DARK) t++ // épaisseur réelle du filet
    const i = (y * width + midX) * 4
    const hex = '#' + [data[i], data[i + 1], data[i + 2]].map((v) => v.toString(16).padStart(2, '0')).join('')
    const rect = new Rect({
      originX: 'left', originY: 'top', left: bStart, top: y, width: bLen, height: Math.max(t, 2),
      fill: hex, strokeWidth: 0, selectable: true, evented: true, objectCaching: true,
    })
    ;(rect as FabricObject & { data?: Record<string, unknown> }).data = { role: 'image-decompose-mask', name: '', type: 'rect' }
    rects.push(rect)
    for (let k = 0; k <= t + GAP; k++) used.add(y + k)
  }
  return rects
}

function buildTextbox(text: string, box: VisionParagraph['bbox'], fontSizePx: number, color: string, fontWeight: number = 400, styles?: TextStyles, align: 'left' | 'center' | 'right' = 'left', lineHeightOverride?: number): Textbox {
  // Width minimum basé sur la ligne la PLUS LONGUE (le texte peut contenir des
  // `\n` reconstruits) — pas le total des caractères, sinon une Textbox 2 lignes
  // serait dimensionnée pour les 2 lignes bout à bout.
  // Headline promo "-50%" (chiffres + %, pas de minuscule) : la bbox Vision ≈ hauteur
  // de capitale, mais Arial Black rend la capitale à ~0.72× du corps → trop petit avec
  // fontSizePx (=0.95×bbox). On agrandit (÷0.72/0.95 ≈ ×1.46) pour que la capitale
  // remplisse la bbox comme l'original, et on ancre au CENTRE vertical de la bbox +
  // interligne serré (0.9) → le gros glyphe reste dans la zone source sans déborder
  // sur l'élément du dessous.
  const headline = /%/.test(text) && !/[a-zà-ÿ]/.test(text)
  const BOOST = 1.46
  const fontSize = headline ? fontSizePx * BOOST : fontSizePx
  // Les styles par-caractère (ex : "%" exposant) ont été calculés sur la taille NON
  // boostée → on les scale du même BOOST pour un headline, sinon le "%" est sous-
  // dimensionné et sous-remonté (décalé) par rapport aux gros chiffres boostés.
  let finalStyles = styles
  if (headline && styles) {
    finalStyles = {}
    for (const [line, chars] of Object.entries(styles)) {
      const scaledChars: Record<number, CharStyle> = {}
      for (const [ci, st] of Object.entries(chars)) {
        scaledChars[Number(ci)] = { fontSize: Math.round(st.fontSize * BOOST), deltaY: Math.round(st.deltaY * BOOST) }
      }
      finalStyles[Number(line)] = scaledChars
    }
  }
  const longestLineLen = text.split('\n').reduce((m, l) => Math.max(m, l.length), 0)
  // Facteur de largeur par caractère : 0.62 (les capitales grasses/Arial Black sont
  // larges — 0.55 sous-estimait et faisait passer "SUR LE 2ÈME" à la ligne).
  const minWidth = Math.max(box.width, longestLineLen * fontSize * 0.62 * 1.1)
  // Centré / fer à droite : la largeur de la textbox DOIT être exactement la bbox
  // Vision (le texte y tient déjà — la fontSize a été bornée à cette largeur en amont).
  // Toute sur-largeur décalerait le centre vers la droite (la textbox est ancrée à
  // gauche), désalignant le bloc des autres (cas « Panachage… » : estimation 830 vs
  // bbox 609 → centre décalé de +110 px).
  const finalWidth = align === 'left' ? minWidth : box.width
  // Pour les graisses très lourdes, Arial Black donne un rendu plus fidèle aux
  // créas retail (où -50%, gros prix utilisent typiquement Arial Black / Heavy).
  const fontFamily = fontWeight >= 900 ? 'Arial Black' : 'Arial'
  const tb = new Textbox(text, {
    originX: 'left',
    originY: headline ? 'center' : 'top',
    left: box.left,
    top: headline ? box.top + box.height / 2 : box.top,
    width: finalWidth,
    fontSize,
    fontFamily,
    fontWeight,
    fill: color,
    textAlign: align,
    ...(lineHeightOverride != null ? { lineHeight: lineHeightOverride } : headline ? { lineHeight: 0.9 } : {}),
    editable: true,
    selectable: true,
    evented: true,
    objectCaching: true,
    scaleX: 1,
    scaleY: 1,
    ...(finalStyles && Object.keys(finalStyles).length > 0 ? { styles: finalStyles } : {}),
  })
  ;(tb as FabricObject & { data?: Record<string, unknown> }).data = {
    role: 'image-decompose-text',
    name: '',
    type: 'text',
  }
  return tb
}

function buildStackedPrice(
  canvas: Canvas,
  priceValue: string,
  bbox: VisionParagraph['bbox'],
  fontFamily: string,
  fontWeight: number | string,
  fill: string,
): void {
  const parts = parsePriceParts(priceValue)
  if (!parts) {
    const fs = Math.max(bbox.height * 0.95, 10)
    const tb = buildTextbox(priceValue, bbox, fs, fill, typeof fontWeight === 'number' ? fontWeight : 900)
    canvas.add(tb)
    return
  }
  // Mise en page d'après la géométrie réelle (mesurée sur les mots Vision) : l'entier
  // remplit la hauteur du prix, le « € » est en HAUT (sommet de l'entier) et les
  // décimales en BAS, base alignée sur celle de l'entier. € et décimales sont étalés
  // (≈ exposant / indice), PAS empilés serré. 3 Textbox liés par priceGroupId.
  const leftX = bbox.left
  const topY = bbox.top
  const bigFs = Math.max(Math.round(bbox.height), 10)
  const intWidth = parts.integer.length * bigFs * 0.6
  const smallFs = Math.max(Math.round(bigFs * 0.42), 10) // € et décimales ≈ 0.42× l'entier (mesuré)
  const rightX = leftX + intWidth + Math.round(bigFs * 0.04)
  const baselineY = topY + Math.round(bigFs * 0.92) // ≈ ligne de base de l'entier
  const gid = `price-${Date.now().toString(36)}-${Math.round(Math.random() * 1e6).toString(36)}`
  const tag = (o: Textbox) => {
    ;(o as FabricObject & { data?: Record<string, unknown> }).data = {
      role: 'image-decompose-text', name: '', type: 'text', priceGroupId: gid,
    }
  }
  const common = { fontFamily, fontWeight, fill, lineHeight: 0.9, textAlign: 'left' as const, editable: true, selectable: true, evented: true, objectCaching: true }

  // Entier (grand, aligné en haut)
  const intTb = new Textbox(parts.integer, { originX: 'left', originY: 'top', left: leftX, top: topY, width: intWidth, fontSize: bigFs, ...common })
  tag(intTb)
  canvas.add(intTb)

  // « € » en HAUT, à droite de l'entier
  const curTb = new Textbox(parts.currency, { originX: 'left', originY: 'top', left: rightX, top: topY, width: smallFs * 1.6, fontSize: smallFs, ...common })
  tag(curTb)
  canvas.add(curTb)

  // Décimales en BAS, base alignée sur l'entier
  if (parts.decimals) {
    const decTb = new Textbox(parts.decimals, { originX: 'left', originY: 'bottom', left: rightX, top: baselineY, width: smallFs * 1.8, fontSize: smallFs, ...common })
    tag(decTb)
    canvas.add(decTb)
  }
}

/**
 * Détecte la graisse du texte en mesurant la DENSITÉ de pixels foreground
 * (proches de la couleur texte) dans la bbox. BOLD → 2-3× plus de pixels que
 * NORMAL pour la même taille.
 *
 * Empirique sur Heineken Carrefour :
 *  - "-50%" Arial Black (900) → densité ~0.35
 *  - "SUR LE 2ÈME" Arial Bold (700) → densité ~0.22
 *  - "Vendu seul" Arial Regular (400) → densité ~0.08
 *  - "9€59" Arial Black (900) → densité ~0.30
 */
function detectFontWeight(
  ctx: CanvasRenderingContext2D,
  box: VisionParagraph['bbox'],
  textHex: string,
  imgW: number,
  imgH: number,
): number {
  const textR = parseInt(textHex.slice(1, 3), 16)
  const textG = parseInt(textHex.slice(3, 5), 16)
  const textB = parseInt(textHex.slice(5, 7), 16)
  const inset = 0.08
  const x0 = Math.round(clamp(box.left + box.width * inset, 0, imgW - 1))
  const y0 = Math.round(clamp(box.top + box.height * inset, 0, imgH - 1))
  const x1 = Math.round(clamp(box.left + box.width * (1 - inset), 0, imgW - 1))
  const y1 = Math.round(clamp(box.top + box.height * (1 - inset), 0, imgH - 1))
  const w = Math.max(1, x1 - x0)
  const h = Math.max(1, y1 - y0)
  let data: Uint8ClampedArray
  try { data = ctx.getImageData(x0, y0, w, h).data } catch { return 400 }
  // Sample 1 pixel sur N pour coût raisonnable (~1000 pixels max par bbox)
  const step = Math.max(1, Math.floor(Math.sqrt((w * h) / 1000)))
  let textPixels = 0
  let total = 0
  for (let i = 0; i < data.length; i += step * 4) {
    const r = data[i], g = data[i + 1], b = data[i + 2]
    const dist = Math.abs(r - textR) + Math.abs(g - textG) + Math.abs(b - textB)
    if (dist < 90) textPixels++
    total++
  }
  if (total === 0) return 400
  const density = textPixels / total
  if (density > 0.28) return 900  // Ultra-bold / Black (titres énormes -50%, prix)
  if (density > 0.20) return 700  // Bold (sous-titres SUR LE 2ÈME, Bière blonde, Soit le L)
  return 400                       // Regular (Vendu seul, Le pack, 5% vol., Le 2ème produit)
}

// ─────────────────────────────────────────────────────────────────────────────
// Regroupement par zone : fusionne les textes adjacents avec couleur fond similaire
// ─────────────────────────────────────────────────────────────────────────────

interface ZoneItem {
  para: VisionParagraph
  color: string
  fontSize: number
  fontWeight: number
}

interface Zone {
  bbox: VisionParagraph['bbox']
  bgHex: string
  uniform: boolean
  items: ZoneItem[]
}

function hexToRgb(hex: string): [number, number, number] {
  return [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ]
}

function colorDistL1(a: string, b: string): number {
  const [r1, g1, b1] = hexToRgb(a)
  const [r2, g2, b2] = hexToRgb(b)
  return Math.abs(r1 - r2) + Math.abs(g1 - g2) + Math.abs(b1 - b2)
}

/**
 * Fond vert saturé = packaging produit (étiquette bouteille Heineken, etc.),
 * jamais un bandeau éditorial retail (toujours rouge / jaune / blanc). On filtre
 * ces textes : ils ne font pas partie du contenu promo éditable (cas "A GER"
 * résiduel lu sur l'emballage). Seuil pensé pour attraper le vert saturé sans
 * toucher au jaune (r ET g hauts), au rouge (g bas) ni au blanc/gris (r≈g≈b).
 */
function isGreenBackground(hex: string): boolean {
  const [r, g, b] = hexToRgb(hex)
  return g > r + 40 && g > b + 40 && g > 60
}

/**
 * Fond (quasi) blanc : aucun masque à créer. Le canvas est déjà blanc après
 * décomposition (image bg cachée), donc un rectangle blanc est inutile — pire,
 * la croissance couleur le ferait déborder sur toute la zone claire de la créa.
 * Les textes de description restent simplement posés sur le blanc du canvas.
 */
function isNearWhite(hex: string): boolean {
  const [r, g, b] = hexToRgb(hex)
  return r > 235 && g > 235 && b > 235
}

function mergeBbox(a: VisionParagraph['bbox'], b: VisionParagraph['bbox']): VisionParagraph['bbox'] {
  const left = Math.min(a.left, b.left)
  const top = Math.min(a.top, b.top)
  const right = Math.max(a.left + a.width, b.left + b.width)
  const bottom = Math.max(a.top + a.height, b.top + b.height)
  return { left, top, width: right - left, height: bottom - top }
}

/** Distance rectangle-rectangle (0 si overlap). */
function rectDistance(a: VisionParagraph['bbox'], b: VisionParagraph['bbox']): number {
  const dx = Math.max(0, Math.max(a.left, b.left) - Math.min(a.left + a.width, b.left + b.width))
  const dy = Math.max(0, Math.max(a.top, b.top) - Math.min(a.top + a.height, b.top + b.height))
  return Math.max(dx, dy)
}

type Bbox = VisionParagraph['bbox']
function unionBbox(boxes: Bbox[]): Bbox {
  let l = Infinity, t = Infinity, r = -Infinity, b = -Infinity
  for (const x of boxes) {
    l = Math.min(l, x.left); t = Math.min(t, x.top)
    r = Math.max(r, x.left + x.width); b = Math.max(b, x.top + x.height)
  }
  return { left: l, top: t, width: r - l, height: b - t }
}

/**
 * Groupe les items en zones : 2 items fusionnent si
 *  - leurs fonds sont uniformes ET de couleur similaire (L1 < 50)
 *  - leur distance rect-rect est < 80 px
 * Items avec fond non-uniforme restent en zones individuelles (uniform: false →
 * pas de masque créé pour eux).
 */
function groupItemsByZone(items: Array<{ para: VisionParagraph; bgHex: string; bgUniform: boolean; color: string; fontSize: number; fontWeight: number }>): Zone[] {
  const zones: Zone[] = []
  const COLOR_THRESHOLD = 60
  const SPATIAL_DISTANCE = 100

  // Passe 1 : items au fond uniforme — créent et étendent les zones "bandeaux"
  for (const it of items) {
    if (!it.bgUniform) continue
    const member: ZoneItem = { para: it.para, color: it.color, fontSize: it.fontSize, fontWeight: it.fontWeight }
    let matched: Zone | null = null
    for (const z of zones) {
      if (!z.uniform) continue
      if (colorDistL1(z.bgHex, it.bgHex) > COLOR_THRESHOLD) continue
      if (rectDistance(z.bbox, it.para.bbox) > SPATIAL_DISTANCE) continue
      matched = z
      break
    }
    if (matched) {
      matched.bbox = mergeBbox(matched.bbox, it.para.bbox)
      matched.items.push(member)
    } else {
      zones.push({ bbox: it.para.bbox, bgHex: it.bgHex, uniform: true, items: [member] })
    }
  }

  // Passe 2 : items au fond non-uniforme — fusionnent dans une zone existante
  // si même couleur (cas typique : Textbox sur la bordure du bandeau, son fond
  // local mélange bandeau + blanc → variance haute MAIS la couleur médiane reste
  // celle du bandeau). Sinon créent leur propre zone sans masque.
  for (const it of items) {
    if (it.bgUniform) continue
    const member: ZoneItem = { para: it.para, color: it.color, fontSize: it.fontSize, fontWeight: it.fontWeight }
    let matched: Zone | null = null
    for (const z of zones) {
      if (!z.uniform) continue
      if (colorDistL1(z.bgHex, it.bgHex) > COLOR_THRESHOLD) continue
      if (rectDistance(z.bbox, it.para.bbox) > SPATIAL_DISTANCE) continue
      matched = z
      break
    }
    if (matched) {
      matched.bbox = mergeBbox(matched.bbox, it.para.bbox)
      matched.items.push(member)
    } else {
      zones.push({ bbox: it.para.bbox, bgHex: it.bgHex, uniform: false, items: [member] })
    }
  }
  return zones
}

/**
 * Étend une bbox masque jusqu'aux limites RÉELLES de l'aplat de couleur `bgHex`
 * dans l'image source. Les bandeaux promo (rouge "-50%", jaune prix) débordent
 * largement sous/au-dessus du texte qu'ils contiennent : la bbox issue des textes
 * ne couvre pas tout l'aplat (cas du jaune qui doit descendre jusqu'au bord bas).
 * On marche vers l'extérieur sur chaque bord tant que la MAJORITÉ des points
 * échantillonnés sur ce bord restent proches de `bgHex` (L1 < TOL). Ne fait
 * qu'étendre — s'arrête net à la transition rouge↔jaune ou aplat↔bord, donc la
 * contiguïté inter-zones déjà calculée est préservée.
 */
function growBoxToColorExtent(
  ctx: CanvasRenderingContext2D,
  box: VisionParagraph['bbox'],
  bgHex: string,
  imgW: number,
  imgH: number,
): VisionParagraph['bbox'] {
  const [br, bg, bb] = hexToRgb(bgHex)
  const TOL = 70
  const SAMPLES = 5
  const STEP = 3
  const isBg = (px: number, py: number): boolean => {
    try {
      const d = ctx.getImageData(clamp(px, 0, imgW - 1), clamp(py, 0, imgH - 1), 1, 1).data
      return Math.abs(d[0] - br) + Math.abs(d[1] - bg) + Math.abs(d[2] - bb) < TOL
    } catch { return false }
  }
  const rowIsBg = (y: number, left: number, right: number): boolean => {
    let hit = 0
    for (let k = 0; k < SAMPLES; k++) {
      if (isBg(Math.round(left + (right - left) * ((k + 0.5) / SAMPLES)), y)) hit++
    }
    return hit / SAMPLES > 0.5
  }
  const colIsBg = (x: number, top: number, bottom: number): boolean => {
    let hit = 0
    for (let k = 0; k < SAMPLES; k++) {
      if (isBg(x, Math.round(top + (bottom - top) * ((k + 0.5) / SAMPLES)))) hit++
    }
    return hit / SAMPLES > 0.5
  }
  let left = box.left
  let top = box.top
  let right = box.left + box.width
  let bottom = box.top + box.height
  while (bottom + STEP <= imgH && rowIsBg(bottom + STEP, left, right)) bottom += STEP
  while (top - STEP >= 0 && rowIsBg(top - STEP, left, right)) top -= STEP
  while (right + STEP <= imgW && colIsBg(right + STEP, top, bottom)) right += STEP
  while (left - STEP >= 0 && colIsBg(left - STEP, top, bottom)) left -= STEP
  return { left, top, width: right - left, height: bottom - top }
}

// ─────────────────────────────────────────────────────────────────────────────
// Regroupement post-construction : blocs logiques (exposants) & même style
// ─────────────────────────────────────────────────────────────────────────────

const decomposeTextboxes = (canvas: Canvas): Textbox[] =>
  canvas.getObjects().filter(
    (o): o is Textbox =>
      o instanceof Textbox &&
      (o as FabricObject & { data?: Record<string, unknown> }).data?.role === 'image-decompose-text',
  )

const tbColor = (tb: Textbox): string => (typeof tb.fill === 'string' ? tb.fill : '#000000')

/** Vrai si le Textbox porte des styles par-caractère (ex : "%" exposant) à préserver. */
const hasCharStyles = (tb: Textbox): boolean => {
  const s = (tb as unknown as { styles?: Record<number, Record<number, unknown>> }).styles
  return !!s && Object.keys(s).some((k) => Object.keys(s[Number(k)] ?? {}).length > 0)
}

// ── Prix : 2 Textbox liés (gros entier + pile €/décimales) qui se déplacent ───
// ensemble, SANS Group Fabric (un Group casse le clic-pour-déplacer car l'éditeur
// force `interactive`). Liés par `data.priceGroupId` ; le déplacement de l'un est
// répercuté sur l'autre via les listeners object:moving (snapshot au mouse:down).
const priceGid = (o: FabricObject): string | undefined =>
  (o as FabricObject & { data?: { priceGroupId?: string } }).data?.priceGroupId

const priceMoveBase = new WeakMap<FabricObject, { left: number; top: number }>()
let mirroringPriceMove = false

const snapshotPriceSiblings = (e: { target?: FabricObject }): void => {
  const t = e.target
  const gid = t && priceGid(t)
  const canvas = t?.canvas
  if (!t || !gid || !canvas) return
  for (const o of canvas.getObjects()) {
    if (priceGid(o) === gid) priceMoveBase.set(o, { left: o.left ?? 0, top: o.top ?? 0 })
  }
}

const mirrorPriceMove = (e: { target?: FabricObject }): void => {
  if (mirroringPriceMove) return
  const t = e.target
  const gid = t && priceGid(t)
  const canvas = t?.canvas
  if (!t || !gid || !canvas) return
  const base = priceMoveBase.get(t)
  if (!base) return
  const dx = (t.left ?? 0) - base.left
  const dy = (t.top ?? 0) - base.top
  mirroringPriceMove = true
  for (const o of canvas.getObjects()) {
    if (o === t || priceGid(o) !== gid) continue
    const ob = priceMoveBase.get(o)
    if (!ob) continue
    o.set({ left: ob.left + dx, top: ob.top + dy })
    o.setCoords()
  }
  mirroringPriceMove = false
}

/**
 * Fusionne un fragment court (ex : "ÈME", "ème", "%") avec le texte frère à sa
 * gauche sur la MÊME LIGNE (ex : "SUR LE 2") en UN SEUL Textbox ÉDITABLE : le
 * fragment reçoit une `fontSize` réduite + `deltaY` négatif (exposant) via les
 * styles par-caractère. Préférable à un Group ici → édition inline directe (pas de
 * double-clic, pas de groupe interactif). Possible car tout tient sur une seule
 * ligne (≠ prix empilé). Détection : fragment ≤ 4 chars, même couleur (L1<40),
 * overlap vertical avec le frère, à droite de lui, frère pas plus petit.
 * Index des caractères calculés sur la chaîne NFC (le projet produit parfois du NFD).
 */
function mergeSuperscriptInline(canvas: Canvas): void {
  const texts = decomposeTextboxes(canvas)
  const consumed = new Set<Textbox>()
  for (const small of texts) {
    if (consumed.has(small) || priceGid(small)) continue
    const fragText = (small.text ?? '').trim()
    if (fragText.length === 0 || fragText.length > 3) continue // fragment court uniquement (exclut "-50%")
    const sFs = small.fontSize ?? 0
    const sLeft = small.left ?? 0
    const sTop = small.top ?? 0
    const sBottom = sTop + (small.height ?? sFs)
    let best: Textbox | null = null
    let bestGap = Infinity
    for (const big of texts) {
      if (big === small || consumed.has(big) || priceGid(big)) continue
      const bFs = big.fontSize ?? 0
      if (sFs > bFs * 1.15) continue // le fragment ne doit pas être plus gros
      if (colorDistL1(tbColor(small), tbColor(big)) > 40) continue
      const bLeft = big.left ?? 0
      const bRight = bLeft + (big.width ?? 0)
      const bTop = big.top ?? 0
      const bBottom = bTop + (big.height ?? bFs)
      if (sLeft < bLeft) continue // small à droite de big
      if (Math.min(sBottom, bBottom) - Math.max(sTop, bTop) <= 0) continue // même ligne (overlap vertical)
      const gap = sLeft - bRight
      if (gap > bFs * 2) continue // proximité horizontale raisonnable
      if (gap < bestGap) { best = big; bestGap = gap } // garde le frère le plus proche
    }
    if (!best) continue
    const big = best
    const bFs = big.fontSize ?? 20
    const bigText = big.text ?? ''
    const mergedText = (bigText + fragText).normalize('NFC')
    const startIdx = bigText.normalize('NFC').length
    const fragStyle = { fontSize: Math.round(sFs > 0 ? sFs : bFs * 0.6), deltaY: -Math.round(bFs * 0.35) }
    const lineStyle: Record<number, typeof fragStyle> = {}
    for (let i = startIdx; i < mergedText.length; i++) lineStyle[i] = { ...fragStyle }
    const merged = new Textbox(mergedText, {
      originX: 'left',
      originY: 'top',
      left: big.left ?? 0,
      top: big.top ?? 0,
      width: (big.width ?? 0) + (small.width ?? sFs * fragText.length) + bFs,
      fontSize: bFs,
      fontFamily: big.fontFamily,
      fontWeight: big.fontWeight,
      fill: tbColor(big),
      textAlign: 'left',
      editable: true,
      selectable: true,
      evented: true,
      objectCaching: true,
      styles: { 0: lineStyle },
    })
    ;(merged as FabricObject & { data?: Record<string, unknown> }).data = {
      role: 'image-decompose-text',
      name: '',
      type: 'text',
    }
    consumed.add(small)
    consumed.add(big)
    canvas.remove(small)
    canvas.remove(big)
    canvas.add(merged)
  }
}

/**
 * Fusionne en UN Textbox multi-ligne les textes verticalement empilés partageant
 * les mêmes caractéristiques graphiques (couleur, graisse, taille ±15 %), alignés
 * à gauche et adjacents (gap < 0.6× fontSize). Ex : "Soit les 2 produits: 14,38€"
 * + "Soit le L: 1,92€", "Le pack" + "Le L : 2,56 €". Garde l'édition inline.
 * Les Groups (prix, exposants) ne sont pas des Textbox top-level → ignorés.
 */
function mergeSameStyleStacks(canvas: Canvas): void {
  const sorted = decomposeTextboxes(canvas).sort((a, b) => (a.top ?? 0) - (b.top ?? 0))
  const consumed = new Set<Textbox>()
  for (const seed of sorted) {
    if (consumed.has(seed) || priceGid(seed) || hasCharStyles(seed)) continue
    const fs = seed.fontSize ?? 12
    const weight = seed.fontWeight
    const color = tbColor(seed)
    const left = seed.left ?? 0
    const cluster: Textbox[] = [seed]
    consumed.add(seed)
    let bottom = (seed.top ?? 0) + (seed.height ?? fs)
    let extended = true
    while (extended) {
      extended = false
      for (const cand of sorted) {
        if (consumed.has(cand) || priceGid(cand) || hasCharStyles(cand)) continue
        const cFs = cand.fontSize ?? 12
        if (cFs < fs * 0.85 || cFs > fs * 1.18) continue
        if (cand.fontWeight !== weight) continue
        if (colorDistL1(tbColor(cand), color) > 30) continue
        if (Math.abs((cand.left ?? 0) - left) > Math.max(8, fs * 0.2)) continue
        const cTop = cand.top ?? 0
        if (cTop < bottom - fs * 0.3) continue // doit être SOUS le cluster courant
        if (cTop - bottom > fs * 0.6) continue // interligne raisonnable, sinon autre bloc
        cluster.push(cand)
        consumed.add(cand)
        bottom = cTop + (cand.height ?? cFs)
        extended = true
        break
      }
    }
    if (cluster.length < 2) continue
    const ordered = cluster.sort((a, b) => (a.top ?? 0) - (b.top ?? 0))
    const merged = new Textbox(ordered.map((t) => t.text ?? '').join('\n'), {
      originX: 'left',
      originY: 'top',
      left: Math.min(...ordered.map((t) => t.left ?? 0)),
      top: Math.min(...ordered.map((t) => t.top ?? 0)),
      width: Math.max(...ordered.map((t) => t.width ?? 0)),
      fontSize: Math.max(...ordered.map((t) => t.fontSize ?? 12)),
      fontFamily: seed.fontFamily,
      fontWeight: weight,
      fill: color,
      textAlign: 'left',
      editable: true,
      selectable: true,
      evented: true,
      objectCaching: true,
    })
    ;(merged as FabricObject & { data?: Record<string, unknown> }).data = {
      role: 'image-decompose-text',
      name: '',
      type: 'text',
    }
    for (const t of ordered) canvas.remove(t)
    canvas.add(merged)
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Pipeline heuristique (Vision + échantillonnage couleur) — fallback
// ─────────────────────────────────────────────────────────────────────────────

async function decomposeHeuristic(
  canvas: Canvas, ctx: CanvasRenderingContext2D, dataUri: string,
  result: VisionDecomposeResult, width: number, height: number, toastId: string | number,
): Promise<number> {
  // PASSE 1 — Collecte des textes éditoriaux valides + leurs analyses
  interface Item {
    para: VisionParagraph
    bgHex: string
    bgUniform: boolean
    color: string
    fontSize: number
    fontWeight: number
  }
  const items: Item[] = []
  let skipped = 0

  for (const para of result.paragraphs) {
    if (isInProductZone(para.bbox, width, height)) { skipped++; continue }
    if (para.confidence < 0.5) { skipped++; continue }
    const bgSample = sampleBackground(ctx, para.bbox, width, height)
    // Texte sur fond vert = packaging produit ("A GER" sur l'emballage) → skip.
    if (isGreenBackground(bgSample.hex)) { skipped++; continue }
    const nLines = countLines(para.words)
    const singleLineH = para.bbox.height / nLines
    const fontSize = Math.max(singleLineH * 0.95, 10)
    const color = sampleTextColor(ctx, para.bbox, bgSample.hex, width, height)
    const fontWeight = detectFontWeight(ctx, para.bbox, color, width, height)
    items.push({ para, bgHex: bgSample.hex, bgUniform: bgSample.uniform, color, fontSize, fontWeight })
  }

  // PASSE 1.5 — Classification LLM (batch sémantique) : retire les textes de
  // LOGOS / PICTOS / certifications (badges qualité/origine, écussons), qui ne
  // doivent JAMAIS être extraits comme texte éditable. 1 appel, texte+positions
  // (pas de dico par-vendeur). Échec → on garde tout (comportement d'avant).
  let editorialItems = items
  if (items.length > 0) {
    toast.loading('Classification logos / éditorial…', { id: toastId })
    const logoIdx = await classifyLogoTexts(items.map((it) => ({
      text: it.para.text,
      x: ((it.para.bbox.left + it.para.bbox.width / 2) / width) * 100,
      y: ((it.para.bbox.top + it.para.bbox.height / 2) / height) * 100,
    })))
    if (logoIdx.size > 0) {
      editorialItems = items.filter((_, i) => !logoIdx.has(i))
      skipped += logoIdx.size
    }
  }

  // PASSE 2 — Regroupement par zone : textes adjacents avec couleur fond
  // similaire fusionnent en UN bandeau commun (= reproduit les bandeaux promo
  // unifiés de la créa originale au lieu de l'effet "post-it" éparpillé).
  const zones = groupItemsByZone(editorialItems)

  // PASSE 3 — Ajout au canvas : pour chaque zone à fond de COULEUR (rouge/jaune
  // Carrefour), un masque dimensionné sur l'aplat RÉEL via `growBoxToColorExtent`
  // à partir de la bbox SERRÉE des textes (pas d'une bbox pré-élargie qui rendrait
  // le masque trop large/haut). Les fonds blancs ne sont PAS masqués (canvas déjà
  // blanc → masque inutile, et la croissance déborderait sur toute la zone claire).
  // Puis tous les Textbox de la zone par-dessus.
  const addedTextboxes: Textbox[] = []
  for (const zone of zones) {
    if (zone.uniform && !isNearWhite(zone.bgHex)) {
      const maskBox = growBoxToColorExtent(ctx, zone.bbox, zone.bgHex, width, height)
      // Débord minimal (2 px) : évite un filet blanc à la jonction rouge/jaune.
      canvas.add(buildMaskRect(maskBox, zone.bgHex, 2, 2))
    }
    for (const it of zone.items) {
      const { text, styles } = buildTextAndStyles(it.para.words, it.fontSize)
      const tb = buildTextbox(text, it.para.bbox, it.fontSize, it.color, it.fontWeight, styles)
      canvas.add(tb)
      addedTextboxes.push(tb)
    }
  }
  const kept = editorialItems.length

  // PASSE 4 — Relecture prix composés via Vision LLM (résout "9999" → "9,59 €"
  // et merge les fragments "4" + "€" + "+79" → "4,79 €" sur le main Textbox).
  // Async, ne bloque pas le rendu canvas — UI loading via toast.
  const priceClusters = detectPriceClusters(addedTextboxes)
  if (priceClusters.length > 0) {
    toast.loading(`Relecture de ${priceClusters.length} prix…`, { id: toastId })
    for (const cluster of priceClusters) {
      const cropUri = cropToDataUri(ctx, cluster.unifiedBbox, width, height)
      if (!cropUri) continue
      const realPrice = await readPriceFromImage(cropUri)
      if (!realPrice) continue
      const parts = parsePriceParts(realPrice)

      // Détermine la taille détectée, les props typo, le CENTRE vertical et la
      // gauche de l'entier — pour le main existant ou l'orphelin reconstruit.
      let detFs: number
      let fontFamily: string
      let fontWeight: number | string
      let fill: string
      let centerY: number
      let leftX: number
      let existingMain: Textbox | null = null

      if (cluster.main) {
        const m = cluster.main
        detFs = m.fontSize ?? 20
        fontFamily = (m.fontFamily as string) ?? 'Arial Black'
        fontWeight = (m.fontWeight as number | string | undefined) ?? 900
        fill = (typeof m.fill === 'string' ? m.fill : '#000000')
        centerY = (m.top ?? 0) + (m.height ?? detFs) / 2 // centre vertical AVANT boost
        leftX = m.left ?? 0
        existingMain = m
        if (!parts) {
          m.set({ text: realPrice, width: realPrice.length * detFs * 0.55 * 1.1 })
          for (const frag of cluster.fragments) canvas.remove(frag)
          continue
        }
      } else if (cluster.orphanAnchor && parts) {
        const a = cluster.orphanAnchor
        const ref = cluster.fragments[0] // le « € » : on hérite sa couleur/police
        detFs = a.fontSize
        fontFamily = (ref?.fontFamily as string) ?? 'Arial Black'
        fontWeight = (ref?.fontWeight as number | string | undefined) ?? 900
        fill = (typeof ref?.fill === 'string' ? ref.fill : '#000000')
        centerY = a.top + detFs * 0.95 // plus bas : avec le BOOST 1.6, évite que l'entier/€ remonte sur l'élément du dessus
        leftX = a.left
      } else {
        for (const frag of cluster.fragments) canvas.remove(frag)
        continue
      }
      if (!parts) continue // (inatteignable — narrowing TS)

      // AGRANDISSEMENT (×1.6) : entier du prix plus grand pour que son BAS atteigne
      // le bas des décimales (entier + décimale sur la même ligne de base, comme
      // l'original). Ancré au CENTRE vertical → ne déborde pas sur l'élément du dessus.
      const BOOST = 1.6
      const bigFs = Math.round(detFs * BOOST)
      const intWidth = parts.integer.length * bigFs * 0.62
      const intOpts = {
        originX: 'left' as const,
        originY: 'center' as const,
        left: leftX,
        top: centerY,
        width: intWidth,
        fontSize: bigFs,
        fontFamily,
        fontWeight,
        fill,
        lineHeight: 0.9,
        textAlign: 'left' as const,
        editable: true,
        selectable: true,
        evented: true,
        objectCaching: true,
      }
      let intTb: Textbox
      if (existingMain) {
        existingMain.set({ ...intOpts, text: parts.integer })
        intTb = existingMain
      } else {
        intTb = new Textbox(parts.integer, intOpts)
        ;(intTb as FabricObject & { data?: Record<string, unknown> }).data = { role: 'image-decompose-text', name: '', type: 'text' }
        canvas.add(intTb)
      }

      // Pile "€"/décimales ancrée par le BAS sur le bas de la capitale de l'entier
      // (centerY + demi-cap ≈ +0.36× corps) → la décimale ("59"/"79") partage la
      // ligne de base de l'entier, et le "€" remonte au sommet. Alignement robuste.
      const stackText = parts.decimals ? `${parts.currency}\n${parts.decimals}` : parts.currency
      const stackFontSize = Math.max(Math.round(bigFs * 0.45), 10)
      const stack = new Textbox(stackText, {
        originX: 'left',
        originY: 'bottom',
        left: leftX + intWidth + Math.round(bigFs * 0.03),
        top: centerY + Math.round(bigFs * 0.46), // ↓ descend la pile : décimale alignée sur le bas de l'entier (la descente de ligne Fabric la remontait)
        width: stackFontSize * 1.8,
        fontSize: stackFontSize,
        fontFamily,
        fontWeight,
        fill,
        lineHeight: 0.85,
        textAlign: 'left',
        editable: true,
        selectable: true,
        evented: true,
        objectCaching: true,
      })
      ;(stack as FabricObject & { data?: Record<string, unknown> }).data = {
        role: 'image-decompose-text',
        name: '',
        type: 'text',
      }
      canvas.add(stack)

      // Supprime les fragments bruts du canvas (€, "+79", etc.).
      for (const frag of cluster.fragments) canvas.remove(frag)

      // Pas de Group Fabric (casserait le clic-pour-déplacer). On lie le gros
      // entier et la pile "€/décimales" par un priceGroupId partagé : ils restent
      // 2 Textbox top-level → éditables nativement au double-clic, et le listener
      // object:moving déplace l'un quand on déplace l'autre (cf. mirrorPriceMove).
      const gid = `price-${Date.now().toString(36)}-${Math.round(Math.random() * 1e6).toString(36)}`
      const intAny = intTb as FabricObject & { data?: Record<string, unknown> }
      intAny.data = { ...(intAny.data ?? {}), priceGroupId: gid }
      const stackAny = stack as FabricObject & { data?: Record<string, unknown> }
      stackAny.data = { ...(stackAny.data ?? {}), priceGroupId: gid }
    }
    canvas.requestRenderAll()
    syncToStore(canvas)
  }

  // PASSE 5 — Regroupement en blocs : exposant fusionné inline en Textbox stylé
  // éditable (ex "SUR LE 2ÈME"), puis textes de même style empilés en Textbox
  // multi-ligne. Après PASSE 4 pour ne pas perturber la détection des fragments
  // de prix (€, décimales).
  mergeSuperscriptInline(canvas)
  mergeSameStyleStacks(canvas)
  canvas.requestRenderAll()
  syncToStore(canvas)

  return kept
}

// ─────────────────────────────────────────────────────────────────────────────
// Pipeline sémantique (Gemini 3.5) — voie principale
// ─────────────────────────────────────────────────────────────────────────────

function groupBuiltByColor(
  items: { bbox: VisionParagraph['bbox']; bgHex: string }[],
): { bbox: VisionParagraph['bbox']; bgHex: string }[] {
  const zones: { bbox: VisionParagraph['bbox']; bgHex: string }[] = []
  for (const it of items) {
    const z = zones.find((z) => colorDistL1(z.bgHex, it.bgHex) <= 60 && rectDistance(z.bbox, it.bbox) <= 100)
    if (z) z.bbox = unionBbox([z.bbox, it.bbox])
    else zones.push({ bbox: { ...it.bbox }, bgHex: it.bgHex })
  }
  return zones
}

async function decomposeSemantic(
  canvas: Canvas, ctx: CanvasRenderingContext2D, dataUri: string,
  result: VisionDecomposeResult, width: number, height: number, toastId: string | number,
): Promise<number | null> {
  const texts = result.paragraphs.map((p, i) => ({
    i, text: p.text,
    xPct: ((p.bbox.left + p.bbox.width / 2) / width) * 100,
    yPct: ((p.bbox.top + p.bbox.height / 2) / height) * 100,
  }))
  toast.loading('Analyse sémantique (Gemini 3.5)…', { id: toastId })
  const blocks = await semanticLayout(dataUri, texts)
  if (blocks.length === 0) return null // → fallback

  interface Built { block: LayoutBlock; bbox: VisionParagraph['bbox']; color: string; bgHex: string; bgUniform: boolean }
  const built: Built[] = []
  for (const block of blocks) {
    const members = block.memberIndices
      .filter((i) => i >= 0 && i < result.paragraphs.length)
      .map((i) => result.paragraphs[i])
    if (members.length === 0) continue
    const bbox = unionBbox(members.map((m) => m.bbox))
    const bg = sampleBackground(ctx, bbox, width, height)
    const color = sampleTextColor(ctx, bbox, bg.hex, width, height)
    built.push({ block, bbox, color, bgHex: bg.hex, bgUniform: bg.uniform })
  }
  if (built.length === 0) return null

  // Masques : blocs sur fond couleur uniforme (non blanc) regroupés par couleur+proximité.
  // On mémorise les zones de couleur GRANDIES : elles délimitent les aplats promo
  // (rouge/jaune) où vivent les labels — sert de gate déterministe pour la complétude.
  const colored = built.filter((b) => b.bgUniform && !isNearWhite(b.bgHex))
  const maskZones = groupBuiltByColor(colored.map((b) => ({ bbox: b.bbox, bgHex: b.bgHex })))
  const coloredZones: VisionParagraph['bbox'][] = []
  for (const z of maskZones) {
    const grown = growBoxToColorExtent(ctx, z.bbox, z.bgHex, width, height)
    coloredZones.push(grown)
    canvas.add(buildMaskRect(grown, z.bgHex, 2, 2))
  }

  // Rendu. Les blocs PRIX sont composés/empilés via buildStackedPrice (sur l'union
  // bbox des paragraphes membres). Tout le reste (titre / description / mention /
  // unitprice) est rendu PAR PARAGRAPHE Vision : fusionner plusieurs paragraphes en
  // un seul Textbox via l'union bbox sur-dimensionnait fontSize (hauteur d'union ÷
  // nb de "\n" sous-compté par Gemini) ET minWidth (longueur de la chaîne jointe)
  // → débordements horizontaux/verticaux. La géométrie Vision par-paragraphe est la
  // vérité de layout ; Gemini ne sert qu'à typer les blocs (prix) et exclure les
  // logos. fontSize / couleur / poids sont ré-échantillonnés par paragraphe (cf.
  // pipeline heuristique) pour ne pas faire fuiter le style d'un membre sur l'autre.
  const consumed = new Set<number>()

  // Alignement DOMINANT de la composition : on tally les alignements détectables
  // (blocs multi-lignes) ; les blocs mono-ligne (indétectables) en hériteront → tous
  // les blocs d'une compo centrée partagent le même axe central (sinon les mono-lignes
  // resteraient fer à gauche et casseraient l'alignement vertical des blocs).
  const alignTally = { left: 0, center: 0, right: 0 }
  for (const p of result.paragraphs) {
    const a = detectTextAlign(p.words, p.bbox)
    if (a) alignTally[a]++
  }
  const dominantAlign: 'left' | 'center' | 'right' =
    alignTally.center > alignTally.left && alignTally.center >= alignTally.right ? 'center'
    : alignTally.right > alignTally.left && alignTally.right > alignTally.center ? 'right'
    : 'left'

  // Rend UN paragraphe Vision par-paragraphe (géométrie Vision = vérité de layout).
  // fontSize / couleur / poids ré-échantillonnés par paragraphe (pas de fuite de style
  // d'un membre à l'autre).
  const renderParagraph = (idx: number): void => {
    if (idx < 0 || idx >= result.paragraphs.length || consumed.has(idx)) return
    consumed.add(idx) // dédup : un paragraphe vu 2× ne se rend qu'une fois
    const para = result.paragraphs[idx]
    const bg = sampleBackground(ctx, para.bbox, width, height)
    const nLines = countLines(para.words)
    const align = detectTextAlign(para.words, para.bbox) ?? dominantAlign
    // fontSize. Mono-ligne : bbox.height ≈ hauteur de glyphe (×0.95). Multi-ligne :
    //  • fer-à-GAUCHE (corps de texte, ex. description jambon) → basée sur l'AVANCE de
    //    ligne (bbox.height/nLignes ×0.78), éprouvée, interligne par défaut ;
    //  • CENTRÉ/DROITE (bloc display, ex. « VENEZZIO… ») → basée sur la hauteur de
    //    GLYPHE réelle (médiane des mots Vision) : capitales ×1.38 (bbox mot ≈ cap ≈
    //    0.72×corps), mixte ×1.05 — puis bornée à la largeur du bloc + interligne serré.
    let fontSize: number
    if (nLines > 1 && align !== 'left') {
      const wh = para.words.map((w) => w.bbox.height).sort((a, b) => a - b)
      const medianWordH = wh.length ? wh[Math.floor(wh.length / 2)] : para.bbox.height / nLines
      const allCaps = !/[a-zà-ÿ]/.test(para.text)
      fontSize = Math.max(medianWordH * (allCaps ? 1.38 : 1.05), 10)
    } else if (nLines > 1) {
      fontSize = Math.max((para.bbox.height / nLines) * 0.78, 10)
    } else {
      fontSize = Math.max(para.bbox.height * 0.95, 10)
    }
    const color = sampleTextColor(ctx, para.bbox, bg.hex, width, height)
    const fontWeight = detectFontWeight(ctx, para.bbox, color, width, height)
    // Ajustement largeur via mesure RÉELLE (ctx.measureText). La fontSize basée sur la
    // hauteur de glyphe peut rendre le texte plus large que son emprise Vision (Arial
    // Black est plus large qu'une police condensée d'origine, ou un glyphe haut comme
    // le « 2 » de « LES 2 »). Texte CENTRÉ/DROITE (largeur = bbox serrée) : on ajuste
    // au plus juste (tolérance 1.0) sinon il passe à la ligne et déborde. Texte
    // fer-à-GAUCHE (largeur = minWidth, pas de retour) : tolérance 1.15 pour ne pas
    // rétrécir le corps de texte sur un simple écart de chasse.
    const provisional = buildTextAndStyles(para.words, fontSize)
    const lines = provisional.text.split('\n')
    ctx.save()
    ctx.font = `${fontWeight} ${Math.round(fontSize)}px ${fontWeight >= 900 ? '"Arial Black", Arial' : 'Arial'}`
    const measured = Math.max(...lines.map((l) => ctx.measureText(l).width), 1)
    ctx.restore()
    // fer-à-GAUCHE : largeur textbox = minWidth (pas de retour à la ligne) → on ne
    // réduit qu'au-delà de 15 % de débord, cible bbox.width. CENTRÉ/DROITE : largeur
    // textbox = bbox.width → on laisse 4 % de marge (Fabric mesure un peu plus large
    // que measureText et passerait à la ligne au ras), sinon le bloc se replie.
    const gate = align === 'left' ? para.bbox.width * 1.15 : para.bbox.width * 0.96
    const target = align === 'left' ? para.bbox.width : para.bbox.width * 0.96
    if (measured > gate) {
      fontSize = Math.max(fontSize * (target / measured), 10)
    }
    const { text, styles } = buildTextAndStyles(para.words, fontSize)
    // Interligne serré calé sur la bbox source UNIQUEMENT pour les blocs display
    // centrés/droite (hauteur totale = N × fontSize × lineHeight ≈ bbox.height). Le
    // corps fer-à-gauche garde l'interligne par défaut (rendu éprouvé, pas de régression).
    const lineHeight = (nLines > 1 && align !== 'left')
      ? Math.min(Math.max(para.bbox.height / (nLines * fontSize), 0.75), 1.3)
      : undefined
    canvas.add(buildTextbox(text, para.bbox, fontSize, color, fontWeight, styles, align, lineHeight))
  }

  // Blocs Gemini : PRIX composés/empilés (buildStackedPrice), le reste par-paragraphe.
  for (const b of built) {
    if (b.block.type === 'price') {
      const fontWeight = detectFontWeight(ctx, b.bbox, b.color, width, height)
      const fontFamily = fontWeight >= 900 ? 'Arial Black' : 'Arial'
      buildStackedPrice(canvas, b.block.priceValue ?? b.block.text, b.bbox, fontFamily, fontWeight, b.color)
      // On ne marque consommés que les COMPOSANTS de prix (chiffres SANS lettre —
      // tolère un « € » mal OCRisé en ₤/₽/£…), rendus via la pile. Un LABEL bundlé
      // par erreur (« Vendu seul ») contient des lettres → NON consommé → récupéré
      // en post-passe.
      b.block.memberIndices.forEach((i) => {
        const t = (result.paragraphs[i]?.text ?? '').trim()
        // Composant de prix = AUCUNE lettre (chiffres, « € » seul, décimales, symbole
        // mal OCRisé ₤/₽…). Rendu via la pile → consommé. Un label bundlé a des lettres.
        if (t.length > 0 && !/[a-zà-ÿ]/i.test(t)) consumed.add(i)
      })
      continue
    }
    // Dédup symbole isolé : Vision détecte parfois un « % » / « € » À LA FOIS comme
    // glyphe d'un autre membre (« -50% ») ET comme paragraphe isolé qui le chevauche
    // → double affichage. On saute le symbole isolé dans ce cas.
    const memberParas = b.block.memberIndices.map((i) => result.paragraphs[i]).filter(Boolean) as VisionParagraph[]
    const overlaps = (a: VisionParagraph['bbox'], c: VisionParagraph['bbox']) =>
      a.left < c.left + c.width && c.left < a.left + a.width && a.top < c.top + c.height && c.top < a.top + a.height
    for (const idx of b.block.memberIndices) {
      const para = result.paragraphs[idx]
      if (para) {
        const sym = para.text.trim()
        if (/^[%€$£°®™]{1,2}$/.test(sym) && memberParas.some((m) => m !== para && m.text.includes(sym) && overlaps(m.bbox, para.bbox))) {
          continue // doublon de symbole → ignoré
        }
      }
      renderParagraph(idx)
    }
  }

  // COMPLÉTUDE 100 % DÉTERMINISTE (anti-omission, AUCUN LLM). Gemini omet parfois des
  // paragraphes (« Vendu seul », « Le pack », « Le 2ème produit ») → textes manquants,
  // de façon aléatoire d'un run à l'autre. On rend ICI tout paragraphe Vision NON
  // consommé dont le CENTRE tombe dans un aplat de couleur promo (rouge/jaune) : c'est
  // là, par définition, que vivent les labels promotionnels. Les logos / badges
  // (ORIGINE FRANCE, LE PORC FRANÇAIS…) sont HORS de ces aplats → exclus sans appel LLM.
  // Règle géométrique pure → résultat IDENTIQUE à chaque run. (Auparavant on passait
  // par classifyLogoTexts, un LLM non-déterministe qui supprimait parfois de vrais
  // labels : c'était la cause des « textes manquants ».)
  const inColoredZone = (p: VisionParagraph): boolean => {
    const cx = p.bbox.left + p.bbox.width / 2
    const cy = p.bbox.top + p.bbox.height / 2
    return coloredZones.some(
      (z) => cx >= z.left && cx <= z.left + z.width && cy >= z.top && cy <= z.top + z.height,
    )
  }
  for (let i = 0; i < result.paragraphs.length; i++) {
    if (consumed.has(i)) continue
    const p = result.paragraphs[i]
    if (p.confidence < 0.5) continue
    if (!inColoredZone(p)) continue
    // Fragment de PRIX = AUCUNE lettre (chiffres, « € » seul, « 5 ₤ 49 » avec € mal
    // OCRisé…) : déjà rendu composé par buildStackedPrice → le re-rendre créerait un
    // DOUBLON superposé (« 9 €€ 59 », « 5 49 » brut). Les labels (« Vendu seul »,
    // « Le kg: 22,88€ ») ont des lettres → toujours rendus.
    if (!/[a-zà-ÿ]/i.test(p.text)) continue
    renderParagraph(i)
  }

  // Filets de séparation (traits horizontaux entre blocs de prix) — invisibles pour
  // Vision (pas du texte), détectés directement sur l'image.
  for (const sep of detectSeparatorRects(ctx, width, height)) canvas.add(sep)

  canvas.requestRenderAll()
  syncToStore(canvas)
  return consumed.size
}

// ─────────────────────────────────────────────────────────────────────────────
// Orchestration découplée — utilisable sur n'importe quel Canvas Fabric,
// y compris un canvas hors-écran (workflow). Ne dépend PAS de React ni de toast.
// ─────────────────────────────────────────────────────────────────────────────

export interface DecomposeOnCanvasOpts {
  /** Callback de log (info / warn / error). Si absent, les messages sont silencieux. */
  log?: (level: 'info' | 'warn' | 'error', msg: string) => void
  /**
   * Synchronise les objets Fabric vers le store Zustand de l'éditeur après la
   * décomposition. Par défaut : true (comportement historique). Passer false
   * pour les usages hors-éditeur (canvas offscreen dans un workflow) afin de ne
   * pas écraser l'état de l'éditeur ouvert.
   */
  syncStore?: boolean
}

/**
 * Orchestre la décomposition Vision sur le `canvas` fourni (peut être un canvas
 * offscreen). Trouve l'objet `image-bg-locked`, récupère son dataUri, appelle
 * Google Vision, échantillonne les couleurs, puis `decomposeSemantic` (avec
 * fallback `decomposeHeuristic`), et cache l'image bg.
 *
 * Renvoie `{ count }` : nombre de textes/formes éditables ajoutés.
 */
export async function decomposeOnCanvas(
  canvas: Canvas,
  opts: DecomposeOnCanvasOpts = {},
): Promise<{ count: number }> {
  const { log, syncStore = true } = opts

  const bg = findBgImageIn(canvas)
  if (!bg) throw new Error('Aucun calque image-bg-locked trouvé dans le canvas')

  const src = getImageSrc(bg)
  if (!src) throw new Error('Impossible de lire l\'image source (image-bg-locked)')

  const width = (bg as unknown as { width?: number }).width ?? 0
  const height = (bg as unknown as { height?: number }).height ?? 0
  if (!width || !height) throw new Error('Dimensions image source invalides (0×0)')

  log?.('info', 'Appel Google Vision API…')
  const dataUri = src.startsWith('data:image/') ? src : await fetchUrlAsDataUri(src)
  const result = await decomposeWithGoogleVision(dataUri)

  log?.('info', `Vision : ${result.paragraphs.length} paragraphes détectés`)

  // Canvas 2D offscreen pour échantillonner les couleurs (fond/texte) de l'image.
  const htmlImg = await loadHtmlImage(dataUri)
  const off2d = document.createElement('canvas')
  off2d.width = width
  off2d.height = height
  const ctx2d = off2d.getContext('2d', { willReadFrequently: true })
  if (!ctx2d) throw new Error('Canvas 2D context indisponible (sampling)')
  ctx2d.drawImage(htmlImg, 0, 0, width, height)

  // Désactive la synchro Zustand si nécessaire (canvas offscreen → ne pas clobber
  // l'état éditeur). Le flag est rétabli dans le finally.
  const prevSkip = _skipStoreSync
  if (!syncStore) _skipStoreSync = true

  let kept: number
  try {
    const toastId: string | number = 'wf'
    let keptSem = await decomposeSemantic(canvas, ctx2d, dataUri, result, width, height, toastId)
    if (keptSem === null) {
      kept = await decomposeHeuristic(canvas, ctx2d, dataUri, result, width, height, toastId)
    } else {
      kept = keptSem
    }

    // Cache l'image bg (template propre sur fond blanc, comme dans l'éditeur).
    const bgRoot = canvas.getObjects().find(isBgLockedMarker)
    if (bgRoot) bgRoot.set({ visible: false })

    canvas.requestRenderAll()
    if (syncStore) syncToStore(canvas)
  } finally {
    _skipStoreSync = prevSkip
  }

  log?.('info', `Décomposition terminée — ${kept} textes/formes éditables ajoutés`)
  return { count: kept }
}

// ─────────────────────────────────────────────────────────────────────────────
// Hook public
// ─────────────────────────────────────────────────────────────────────────────

export function useImageToSvgDecompose() {
  const [state, setState] = useState<DecomposeState>({
    canDecompose: false,
    isRunning: false,
    hasDecomposition: false,
  })

  const objectsHash = useEditorStore((s) => s.canvasObjects.length)

  // Listeners de déplacement lié des prix (mouse:down = snapshot, object:moving =
  // répercute le delta sur le sibling). Attachés une fois par instance de canvas.
  const moveCanvasRef = useRef<Canvas | null>(null)
  useEffect(() => {
    const canvas = globalFabricCanvas
    if (!canvas || moveCanvasRef.current === canvas) return
    moveCanvasRef.current?.off('mouse:down', snapshotPriceSiblings)
    moveCanvasRef.current?.off('object:moving', mirrorPriceMove)
    canvas.on('mouse:down', snapshotPriceSiblings)
    canvas.on('object:moving', mirrorPriceMove)
    moveCanvasRef.current = canvas
  }, [objectsHash])

  useEffect(() => {
    const canvas = globalFabricCanvas
    if (!canvas) return
    const root = canvas.getObjects().find(isBgLockedMarker)
    if (root) {
      lockBgRoot(root)
      canvas.requestRenderAll()
    }
    const present = root != null
    const overlays = canvas.getObjects().some(isDecomposeOverlay)
    setState((s) => (s.canDecompose === present && s.hasDecomposition === overlays
      ? s
      : { ...s, canDecompose: present, hasDecomposition: overlays }))
  }, [objectsHash])

  const run = useCallback(async () => {
    const canvas = globalFabricCanvas
    if (!canvas) { toast.error('Canvas non disponible'); return }

    setState((s) => ({ ...s, isRunning: true }))
    const toastId = toast.loading('Décomposition…', { description: 'Google Vision API analyse l\'image' })

    try {
      const { count: kept } = await decomposeOnCanvas(canvas, {
        log: (level, msg) => {
          if (level === 'error') toast.error(msg, { id: toastId })
          else if (level === 'warn') toast.loading(msg, { id: toastId })
          else toast.loading(msg, { id: toastId })
        },
        syncStore: true,
      })
      setState({ canDecompose: true, isRunning: false, hasDecomposition: kept > 0 })
      toast.success(`${kept} textes éditables ajoutés`, { id: toastId })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      setState((s) => ({ ...s, isRunning: false }))
      toast.error('Échec de la décomposition', { id: toastId, description: msg })
    }
  }, [])

  const undoDecompose = useCallback(() => {
    const canvas = globalFabricCanvas
    if (!canvas) return
    const toRemove = canvas.getObjects().filter(isDecomposeOverlay)
    if (toRemove.length === 0) return
    for (const o of toRemove) canvas.remove(o)
    // Restaure la visibilité de l'image bg cachée par run()
    const bgRoot = canvas.getObjects().find(isBgLockedMarker)
    if (bgRoot) bgRoot.set({ visible: true })
    canvas.requestRenderAll()
    syncToStore(canvas)
    setState((s) => ({ ...s, hasDecomposition: false }))
    toast.success(`${toRemove.length} overlays supprimés — image restaurée`)
  }, [])

  return { ...state, run, undoDecompose }
}
