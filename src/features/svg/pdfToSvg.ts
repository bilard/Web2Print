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

/**
 * Rasterise la 1re page d'un PDF en blob PNG + retourne ses dimensions pixels.
 */
async function rasterizeFirstPage(pdfFile: File): Promise<{ blob: Blob; width: number; height: number }> {
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
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Canvas 2D context indisponible')
    // Fond blanc : certains PDF ont un fond transparent, on veut un visuel imprimé opaque.
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)

    // pdfjs v5 : `canvas` est requis dans RenderParameters (en plus du context).
    await page.render({ canvas, canvasContext: ctx, viewport }).promise

    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Rasterisation PNG échouée'))), 'image/png')
    })
    return { blob, width: canvas.width, height: canvas.height }
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

  const { blob, width, height } = await rasterizeFirstPage(pdfFile)

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

  // Calque `image-bg-locked` IDENTIQUE à imageToSvg.ts (data-role sur le <g> ET le
  // <image>) → useImageToSvgDecompose lit ce marker et décompose sans modification.
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" data-source-name="${safeName}" data-pipeline="pdf-to-svg-mvp">
  <g id="image-bg-locked" data-role="image-bg-locked">
    <image href="${safeUrl}" x="0" y="0" width="${width}" height="${height}" preserveAspectRatio="xMidYMid slice" data-role="image-bg-locked"/>
  </g>
  <!-- Overlays vectoriels éditables : ajoutés ensuite via "Décomposer" ou manuellement -->
</svg>
`

  const baseName = pdfFile.name.replace(/\.[^.]+$/, '') || 'pdf'
  const svgFile = new File([svg], `${baseName}.svg`, { type: 'image/svg+xml' })

  return { file: svgFile, width, height, imageUrl, storagePath }
}
