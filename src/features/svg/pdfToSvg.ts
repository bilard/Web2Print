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
  const textLayer = hasTextLayer
    ? `  <g id="pdf-text-layer" data-role="pdf-text-layer">\n${textRuns
        .map((r) => {
          const style = [
            `font-size:${r.fontSize.toFixed(1)}px`,
            `font-family:${escapeXml(r.fontFamily)}`,
            r.bold ? 'font-weight:bold' : '',
            r.italic ? 'font-style:italic' : '',
            `fill:${r.fill}`,
          ].filter(Boolean).join(';')
          return `    <text x="${r.x.toFixed(1)}" y="${r.yBaseline.toFixed(1)}" style="${style}" textLength="${r.width.toFixed(1)}">${escapeXml(r.text)}</text>`
        })
        .join('\n')}\n  </g>\n`
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
