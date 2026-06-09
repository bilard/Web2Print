/**
 * Convertit un PDF en SVG éditable — miroir de `imageToSvg.ts`, mais la source est
 * la PREMIÈRE page du PDF rasterisée en image (PDF promo flatten = pas de calque
 * texte exploitable, on passe donc par la même décomposition Vision que les images).
 *
 * Pipeline :
 *  - Rasterisation de la page 1 via pdfjs-dist sur un `<canvas>` (DPI calculé pour
 *    une bonne qualité OCR : côté le plus long visé ~2000 px, scale borné [1, 4]).
 *  - Le canvas → PNG → upload Firebase Storage (référence URL HTTPS dans le SVG,
 *    embed base64 rejeté car Firestore plafonne à 1 MiB/document).
 *  - SVG dimensionné aux pixels rasterisés, avec le calque `image-bg-locked` IDENTIQUE
 *    à celui d'`imageToSvg.ts` → `useImageToSvgDecompose` décompose sans modification.
 */

import * as pdfjsLib from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import { ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage'
import { storage, auth } from '@/lib/firebase/config'

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl

/** Côté le plus long visé pour la rasterisation (compromis qualité OCR / coût Vision). */
const TARGET_MAX_PX = 2000

export interface PdfToSvgResult {
  /** Blob SVG prêt à être passé à parseSvg / loadSVGFromString */
  file: File
  /** Dimensions de la page rasterisée (= dimensions du SVG / du canvas projet) */
  width: number
  height: number
  /** URL publique Firebase Storage du PNG rasterisé */
  imageUrl: string
  /** Chemin Storage (pour suppression éventuelle ultérieure) */
  storagePath: string
  /** true = le PDF avait un calque texte natif → <text> SVG exacts, OCR inutile */
  hasTextLayer: boolean
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))

const escapeXml = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

const slugifyFileName = (name: string): string =>
  name
    .toLowerCase()
    .replace(/\.[^.]+$/, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'pdf'

/** Uint8Array → base64 (chunké : btoa ne digère pas les gros buffers d'un coup). */
function uint8ToBase64(bytes: Uint8Array): string {
  let binary = ''
  const CHUNK = 0x8000
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK))
  }
  return btoa(binary)
}

/**
 * Ré-encode les images du PDF en PNG RGB via MuPDF lui-même. mutool embarque
 * les flux JPEG d'ORIGINE dans le SVG — or les JPEG CMYK Adobe (InDesign) sont
 * mal décodés par les navigateurs (photo noire/inversée). MuPDF, lui, gère
 * CMYK/ICC correctement : on intercepte chaque image via un Device JS et on
 * remplace les data-URI du SVG dans l'ordre du flux de contenu.
 */
function reencodeMupdfImages(
  mupdfMod: typeof import('mupdf'),
  page: { run(device: unknown, matrix: unknown): void },
  svg: string,
): string {
  const pngs: string[] = []
  try {
    const dev = new mupdfMod.Device({
      fillImage(image: { toPixmap(): { asPNG(): Uint8Array; destroy?: () => void } }) {
        try {
          const pix = image.toPixmap()
          pngs.push(`data:image/png;base64,${uint8ToBase64(pix.asPNG())}`)
          pix.destroy?.()
        } catch {
          pngs.push('')
        }
      },
      fillImageMask() {},
      clipImageMask() {},
    } as unknown as ConstructorParameters<typeof mupdfMod.Device>[0])
    page.run(dev, mupdfMod.Matrix.identity)
  } catch (err) {
    console.warn('[pdfToSvg] interception images MuPDF partielle:', err)
  }
  if (pngs.length === 0) return svg
  let idx = 0
  return svg.replace(/(<image\b[^>]*?(?:xlink:)?href=")data:image\/[^"]+(")/g, (full, pre: string, post: string) => {
    const rep = pngs[idx++]
    return rep ? pre + rep + post : full
  })
}

/**
 * Nettoie les polices en sous-ensembles PDF (« WRZTFA+ArialNarrow-Bold ») :
 * retire le préfixe de subset, déduit la graisse du nom, mappe vers des
 * familles installées avec fallback sans-serif.
 */
function cleanSubsetFontFamilies(svg: string): string {
  const dom = new DOMParser().parseFromString(svg, 'image/svg+xml')
  if (dom.querySelector('parsererror')) return svg
  for (const t of Array.from(dom.querySelectorAll('text'))) {
    const raw = t.getAttribute('font-family') ?? ''
    if (!raw) continue
    let family = raw.replace(/^[A-Z]{6}\+/, '')
    if (/bold|black|heavy/i.test(family) && !t.getAttribute('font-weight')) {
      t.setAttribute('font-weight', 'bold')
    }
    if (/italic|oblique/i.test(family) && !t.getAttribute('font-style')) {
      t.setAttribute('font-style', 'italic')
    }
    // « ArialNarrow-Bold » → « Arial Narrow » ; retire le suffixe de style.
    family = family.replace(/[-_](Bold|Black|Heavy|Italic|Oblique|Regular|Light|Medium|Condensed)+$/i, '')
    const spaced = family.replace(/([a-z])([A-Z])/g, '$1 $2')
    t.setAttribute('font-family', `${spaced}, Arial, sans-serif`)
  }
  return new XMLSerializer().serializeToString(dom)
}

/**
 * Aplatis les <text transform="matrix(a b c d e f)"><tspan y x="x0 x1 …"> de
 * MuPDF en <text x y> simples compréhensibles par l'importeur Fabric. Les
 * matrices diagonales (échelle uniforme, pas de rotation) sont absorbées dans
 * x/y/font-size ; les autres (texte rotaté) sont laissées telles quelles.
 */
function flattenMupdfTextTransforms(svg: string): string {
  const dom = new DOMParser().parseFromString(svg, 'image/svg+xml')
  if (dom.querySelector('parsererror')) return svg
  for (const t of Array.from(dom.querySelectorAll('text'))) {
    const tr = t.getAttribute('transform') ?? ''
    const m = tr.match(/matrix\(\s*([-\d.e]+)[ ,]+([-\d.e]+)[ ,]+([-\d.e]+)[ ,]+([-\d.e]+)[ ,]+([-\d.e]+)[ ,]+([-\d.e]+)\s*\)/i)
    const [a, b, c, d, e, f] = m ? m.slice(1).map(Number) : [1, 0, 0, 1, 0, 0]
    // Rotation / cisaillement / échelle non uniforme → on ne touche pas.
    if (Math.abs(b) > 0.001 || Math.abs(c) > 0.001 || Math.abs(a - d) > 0.001 || a <= 0) continue
    const tspan = t.querySelector('tspan')
    const holder = tspan ?? t
    const xs = (holder.getAttribute('x') ?? '0').trim().split(/\s+/).map(Number)
    const y = Number(holder.getAttribute('y') ?? '0')
    const content = holder.textContent ?? ''
    const fontSize = Number(t.getAttribute('font-size') ?? '12')
    t.removeAttribute('transform')
    t.setAttribute('x', (xs[0] * a + e).toFixed(2))
    t.setAttribute('y', (y * d + f).toFixed(2))
    t.setAttribute('font-size', (fontSize * a).toFixed(2))
    t.textContent = content
  }
  return new XMLSerializer().serializeToString(dom)
}

/**
 * Conversion VECTORIELLE via MuPDF (WASM, moteur de mutool) : le PDF devient un
 * vrai SVG — paths exacts, images embarquées, et TEXTE RÉEL (`text=text`) avec
 * positions par glyphe, couleur, taille et graisse natives. Fidélité totale,
 * zéro OCR. Retourne null si la conversion échoue (→ fallback raster+OCR).
 * Chargé dynamiquement : le WASM (~8 Mo) n'est tiré qu'au premier import PDF.
 */
async function convertWithMupdf(
  pdfFile: File,
): Promise<{ svg: string; width: number; height: number; textCount: number } | null> {
  try {
    const mupdf = await import('mupdf')
    const data = new Uint8Array(await pdfFile.arrayBuffer())
    const doc = mupdf.Document.openDocument(data, 'application/pdf')
    try {
      const buf = new mupdf.Buffer()
      const writer = new mupdf.DocumentWriter(buf, 'svg', 'text=text')
      const page = doc.loadPage(0)
      const device = writer.beginPage(page.getBounds())
      page.run(device, mupdf.Matrix.identity)
      writer.endPage()
      writer.close()
      let svg = buf.asString()

      // Polices de substitution MuPDF → équivalents installés navigateur.
      svg = svg
        .replace(/font-family="Nimbus Sans[^"]*"/g, 'font-family="Arial, Helvetica, sans-serif"')
        .replace(/font-family="Nimbus Roman[^"]*"/g, 'font-family="\'Times New Roman\', serif"')
        .replace(/font-family="Nimbus Mono[^"]*"/g, 'font-family="\'Courier New\', monospace"')

      // Aplatis les <text> MuPDF (transform matrix + tspan avec x PAR GLYPHE)
      // en <text x y> simples : l'importeur SVG Fabric ne gère ni l'un ni
      // l'autre (tous les textes atterrissaient empilés en 0,0). Seuls les
      // textes horizontaux non déformés sont aplatis ; les rares rotatés
      // gardent leur transform (rendus par Fabric tel quel).
      svg = flattenMupdfTextTransforms(svg)
      // JPEG CMYK Adobe → PNG RGB décodés par MuPDF (photo noire sinon).
      svg = reencodeMupdfImages(mupdf, page, svg)
      // Polices en sous-ensembles (WRZTFA+ArialNarrow-Bold) → familles propres.
      svg = cleanSubsetFontFamilies(svg)

      const wm = svg.match(/width="([\d.]+)"/)
      const hm = svg.match(/height="([\d.]+)"/)
      const width = wm ? Math.round(parseFloat(wm[1])) : 0
      const height = hm ? Math.round(parseFloat(hm[1])) : 0
      const textCount = (svg.match(/<text[\s>]/g) ?? []).length
      // Marqueur pdf-text-layer (attribut) : EditorPage saute l'auto-décompo OCR.
      svg = svg.replace('<svg ', '<svg data-pipeline="pdf-to-svg-mupdf" data-text-layer="pdf-text-layer" ')
      return { svg, width, height, textCount }
    } finally {
      doc.destroy()
    }
  } catch (err) {
    console.warn('[pdfToSvg] conversion vectorielle MuPDF échouée — fallback raster:', err)
    return null
  }
}

/** Run de texte NATIF extrait du PDF (calque texte pdf.js, pas d'OCR). */
interface PdfTextRun {
  text: string
  /** Coordonnées pixels raster (x = gauche, yBaseline = ligne de base SVG) */
  x: number
  yBaseline: number
  width: number
  fontSize: number
  fontFamily: string
  bold: boolean
  italic: boolean
  /** Couleur échantillonnée sur le raster (le calque texte pdf.js n'a pas la couleur) */
  fill: string
}

/** Échantillonne la couleur du TEXTE d'un run : pixels de la bbox les plus
 *  éloignés de la couleur de fond (anneau de bordure). Fallback noir. */
function sampleRunColor(
  ctx: CanvasRenderingContext2D,
  box: { left: number; top: number; width: number; height: number },
  imgW: number,
  imgH: number,
): { fill: string; bgUniform: boolean; bgColor: [number, number, number] } {
  const x0 = Math.max(0, Math.floor(box.left) - 3)
  const y0 = Math.max(0, Math.floor(box.top) - 3)
  const w = Math.min(imgW - x0, Math.ceil(box.width) + 6)
  const h = Math.min(imgH - y0, Math.ceil(box.height) + 6)
  if (w <= 2 || h <= 2) return { fill: '#000000', bgUniform: false, bgColor: [255, 255, 255] }
  const data = ctx.getImageData(x0, y0, w, h).data
  // Fond = moyenne de l'anneau de bordure ; uniformité = écart max sur l'anneau.
  let br = 0, bg = 0, bb = 0, bn = 0
  let maxDev = 0
  const border: number[] = []
  for (let x = 0; x < w; x++) { border.push((0 * w + x) * 4, ((h - 1) * w + x) * 4) }
  for (let y = 0; y < h; y++) { border.push((y * w + 0) * 4, (y * w + (w - 1)) * 4) }
  for (const i of border) { br += data[i]; bg += data[i + 1]; bb += data[i + 2]; bn++ }
  br /= bn; bg /= bn; bb /= bn
  for (const i of border) {
    const d = Math.abs(data[i] - br) + Math.abs(data[i + 1] - bg) + Math.abs(data[i + 2] - bb)
    if (d > maxDev) maxDev = d
  }
  // Texte = moyenne des pixels intérieurs nettement distincts du fond.
  let tr = 0, tg = 0, tb = 0, tn = 0
  for (let i = 0; i < data.length; i += 4) {
    const d = Math.abs(data[i] - br) + Math.abs(data[i + 1] - bg) + Math.abs(data[i + 2] - bb)
    if (d > 120) { tr += data[i]; tg += data[i + 1]; tb += data[i + 2]; tn++ }
  }
  const hex = (v: number) => Math.round(v).toString(16).padStart(2, '0')
  const fill = tn > 4 ? `#${hex(tr / tn)}${hex(tg / tn)}${hex(tb / tn)}` : '#000000'
  return { fill, bgUniform: maxDev < 70, bgColor: [br, bg, bb] }
}

/**
 * Rasterise la 1re page d'un PDF en blob PNG + extrait le calque TEXTE NATIF
 * (pdf.js getTextContent : positions/tailles exactes, pas d'OCR). Les runs de
 * texte horizontaux sont ÉFFACÉS du raster quand leur fond est uniforme
 * (rect couleur de fond) — le SVG les réécrit en <text> éditables par-dessus.
 */
async function rasterizeFirstPage(pdfFile: File): Promise<{ blob: Blob; width: number; height: number; textRuns: PdfTextRun[] }> {
  const buffer = await pdfFile.arrayBuffer()
  const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(buffer) }).promise
  try {
    const page = await pdf.getPage(1)
    const base = page.getViewport({ scale: 1 })
    const scale = clamp(TARGET_MAX_PX / Math.max(base.width, base.height), 1, 4)
    const viewport = page.getViewport({ scale })

    const canvas = document.createElement('canvas')
    canvas.width = Math.round(viewport.width)
    canvas.height = Math.round(viewport.height)
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    if (!ctx) throw new Error('Canvas 2D context indisponible')
    // Fond blanc : certains PDF ont un fond transparent, on veut un visuel imprimé opaque.
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)

    // pdfjs v5 : `canvas` est requis dans RenderParameters (en plus du context).
    await page.render({ canvas, canvasContext: ctx, viewport }).promise

    // ── Calque texte natif ──────────────────────────────────────────────────
    const textRuns: PdfTextRun[] = []
    try {
      const tc = await page.getTextContent()
      const styles = tc.styles as Record<string, { fontFamily?: string }>
      for (const item of tc.items) {
        if (!('str' in item)) continue
        const str = item.str
        if (!str || !str.trim()) continue
        const tx = pdfjsLib.Util.transform(viewport.transform, item.transform)
        // Texte non horizontal (ruban vertical…) : laissé en raster, fidélité d'abord.
        if (Math.abs(tx[1]) > 0.01 || Math.abs(tx[2]) > 0.01) continue
        const fontSize = Math.hypot(tx[2], tx[3])
        if (fontSize < 4) continue
        const x = tx[4]
        const yBaseline = tx[5]
        const wRun = item.width * scale
        if (wRun <= 0) continue
        const box = { left: x, top: yBaseline - fontSize, width: wRun, height: fontSize * 1.2 }
        const { fill, bgUniform, bgColor } = sampleRunColor(ctx, box, canvas.width, canvas.height)
        const styleFamily = styles[item.fontName]?.fontFamily ?? 'sans-serif'
        const rawFont = `${item.fontName} ${styleFamily}`
        textRuns.push({
          text: str,
          x, yBaseline, width: wRun, fontSize,
          fontFamily: styleFamily,
          bold: /bold|black|heavy/i.test(rawFont),
          italic: /italic|oblique/i.test(rawFont),
          fill,
        })
        // Efface le run du raster si le fond est uniforme (sinon on garderait
        // un doublon sous le <text> éditable). Fond non uniforme (photo) :
        // on laisse le raster, le <text> exactement superposé le recouvre.
        if (bgUniform) {
          ctx.fillStyle = `rgb(${Math.round(bgColor[0])},${Math.round(bgColor[1])},${Math.round(bgColor[2])})`
          ctx.fillRect(box.left - 2, box.top - 2, box.width + 4, box.height + 4)
        }
      }
    } catch (err) {
      console.warn('[pdfToSvg] extraction du calque texte échouée — fallback OCR:', err)
    }

    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Rasterisation PNG échouée'))), 'image/png')
    })
    return { blob, width: canvas.width, height: canvas.height, textRuns }
  } finally {
    void pdf.destroy()
  }
}

/**
 * Construit un SVG éditable à partir d'un fichier PDF (page 1 rasterisée).
 * Upload le PNG vers Firebase Storage et l'utilise dans le `<image>` du SVG.
 */
export async function convertPdfToEditableSvg(pdfFile: File): Promise<PdfToSvgResult> {
  if (pdfFile.type !== 'application/pdf' && !pdfFile.name.toLowerCase().endsWith('.pdf')) {
    throw new Error(`Type non supporté : ${pdfFile.type || 'inconnu'} — attendu un PDF.`)
  }

  const baseNameForFile = pdfFile.name.replace(/\.[^.]+$/, '') || 'pdf'

  // 1) Conversion VECTORIELLE MuPDF (fidélité totale + texte natif éditable).
  //    On ne la retient que si le PDF a du texte réel ; un PDF aplati (texte
  //    vectorisé/scanné) passe au pipeline raster + OCR qui, lui, sait rendre
  //    les textes éditables.
  const vector = await convertWithMupdf(pdfFile)
  if (vector && vector.width > 0 && vector.height > 0 && vector.textCount > 0) {
    const svgFile = new File([vector.svg], `${baseNameForFile}.svg`, { type: 'image/svg+xml' })
    return {
      file: svgFile,
      width: vector.width,
      height: vector.height,
      imageUrl: '',
      storagePath: '',
      hasTextLayer: true,
    }
  }

  // 2) Fallback : rasterisation + calque texte pdf.js (ou OCR si aplati).
  const user = auth.currentUser
  if (!user) throw new Error('Utilisateur non connecté — connexion Firebase requise pour uploader le rendu PDF.')

  const { blob, width, height, textRuns } = await rasterizeFirstPage(pdfFile)

  const slug = slugifyFileName(pdfFile.name)
  const fileName = `${Date.now()}-${slug}.png`
  // Chemin sous `users/{uid}/...` : couvert par la règle générique d'accès utilisateur
  // dans storage.rules — pas besoin d'ajouter une règle dédiée.
  const storagePath = `users/${user.uid}/pdf-to-svg-sources/${fileName}`
  const ref = storageRef(storage, storagePath)

  await uploadBytes(ref, blob, {
    contentType: 'image/png',
    cacheControl: 'public, max-age=31536000',
  })
  const imageUrl = await getDownloadURL(ref)

  const safeName = escapeXml(pdfFile.name)
  const safeUrl = escapeXml(imageUrl)

  // Calque texte NATIF : chaque run du PDF devient un <text> SVG éditable, aux
  // positions/tailles/couleurs exactes du document (zéro OCR, zéro LLM). Le run
  // a déjà été effacé du raster quand son fond était uniforme.
  const hasTextLayer = textRuns.length > 0
  // <text> à la RACINE (pas de <g> enveloppant) : chaque run devient un objet
  // Fabric individuel directement sélectionnable/éditable à l'import. Le
  // commentaire pdf-text-layer sert de marqueur (EditorPage saute l'OCR).
  const textLayer = hasTextLayer
    ? `  <!-- pdf-text-layer : calque texte natif du PDF -->\n${textRuns
        .map((r) => {
          const style = [
            `font-size:${r.fontSize.toFixed(1)}px`,
            `font-family:${escapeXml(r.fontFamily)}`,
            r.bold ? 'font-weight:bold' : '',
            r.italic ? 'font-style:italic' : '',
            `fill:${r.fill}`,
          ].filter(Boolean).join(';')
          return `  <text x="${r.x.toFixed(1)}" y="${r.yBaseline.toFixed(1)}" style="${style}">${escapeXml(r.text)}</text>`
        })
        .join('\n')}\n`
    : '  <!-- Pas de calque texte natif (PDF aplati) : overlays via "Décomposer" (OCR) -->\n'

  // Calque `image-bg-locked` IDENTIQUE à imageToSvg.ts (data-role sur le <g> ET le
  // <image>) → useImageToSvgDecompose lit ce marker et décompose sans modification.
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" data-source-name="${safeName}" data-pipeline="pdf-to-svg-${hasTextLayer ? 'textlayer' : 'mvp'}">
  <g id="image-bg-locked" data-role="image-bg-locked">
    <image href="${safeUrl}" x="0" y="0" width="${width}" height="${height}" preserveAspectRatio="xMidYMid slice" data-role="image-bg-locked"/>
  </g>
${textLayer}</svg>
`

  const baseName = pdfFile.name.replace(/\.[^.]+$/, '') || 'pdf'
  const svgFile = new File([svg], `${baseName}.svg`, { type: 'image/svg+xml' })

  return { file: svgFile, width, height, imageUrl, storagePath, hasTextLayer }
}
