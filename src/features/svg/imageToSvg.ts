/**
 * Convertit une image raster (PNG/JPG/WebP/GIF) en SVG éditable.
 *
 * Pattern Option B :
 * - Image uploadée vers Firebase Storage et référencée par URL HTTPS dans le SVG
 *   (embed base64 inline rejeté : Firestore plafonne à 1 MiB par document, ce qui
 *   exclut les images > ~750 KB en base64).
 * - SVG dimensionné aux pixels natifs de l'image
 * - Structure prête à recevoir des overlays vectoriels (texte, rectangles, formes)
 *   ajoutés ensuite par l'utilisateur dans l'éditeur — ou par le pipeline Vision auto
 *   (Phase 2 via useImageToSvgDecompose).
 *
 * Le `<image>` porte `data-role="image-bg-locked"` : c'est le marker que la Phase 2
 * lit pour identifier le calque source à passer à Claude Vision.
 */

import { ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage'
import { storage, auth } from '@/lib/firebase/config'

export interface ImageToSvgResult {
  /** Blob SVG prêt à être passé à parseSvg / loadSVGFromString */
  file: File
  /** Dimensions natives de l'image source (= dimensions du SVG / du canvas projet) */
  width: number
  height: number
  /** URL publique Firebase Storage de l'image source */
  imageUrl: string
  /** Chemin Storage (pour suppression éventuelle ultérieure) */
  storagePath: string
}

const readAsDataURL = (file: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(reader.error ?? new Error('FileReader error'))
    reader.readAsDataURL(file)
  })

const loadImageDimensions = (dataUrl: string): Promise<{ width: number; height: number }> =>
  new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight })
    img.onerror = () => reject(new Error('Image load failed'))
    img.src = dataUrl
  })

const escapeXml = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

const slugifyFileName = (name: string): string =>
  name
    .toLowerCase()
    .replace(/\.[^.]+$/, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'image'

/**
 * Construit un SVG Option B à partir d'un fichier image.
 * Upload l'image vers Firebase Storage et utilise l'URL dans le `<image>` du SVG.
 */
export async function convertImageToEditableSvg(imageFile: File): Promise<ImageToSvgResult> {
  if (!imageFile.type.startsWith('image/')) {
    throw new Error(`Type non supporté : ${imageFile.type || 'inconnu'}`)
  }
  if (imageFile.type === 'image/svg+xml') {
    throw new Error('Le fichier est déjà un SVG — utilisez l\'import SVG direct.')
  }

  const user = auth.currentUser
  if (!user) throw new Error('Utilisateur non connecté — connexion Firebase requise pour uploader l\'image.')

  // Lire les dimensions avant l'upload pour valider rapidement le fichier.
  const dataUrl = await readAsDataURL(imageFile)
  const { width, height } = await loadImageDimensions(dataUrl)

  // Upload vers Storage avec un chemin déterministe (timestamp + slug nom).
  const ext = imageFile.name.match(/\.([a-zA-Z0-9]+)$/)?.[1].toLowerCase() ?? 'bin'
  const slug = slugifyFileName(imageFile.name)
  const fileName = `${Date.now()}-${slug}.${ext}`
  // Chemin sous `users/{uid}/...` : couvert par la règle générique d'accès utilisateur
  // dans storage.rules — pas besoin d'ajouter une règle dédiée.
  const storagePath = `users/${user.uid}/image-to-svg-sources/${fileName}`
  const ref = storageRef(storage, storagePath)

  await uploadBytes(ref, imageFile, {
    contentType: imageFile.type,
    cacheControl: 'public, max-age=31536000',
  })
  const imageUrl = await getDownloadURL(ref)

  const safeName = escapeXml(imageFile.name)
  const safeUrl = escapeXml(imageUrl)

  // Le `<image>` porte `data-role="image-bg-locked"` (et pas seulement le <g>
  // englobant) pour survivre à un éventuel flatten de groupe lors du parsing Fabric.
  // C'est ce marker que useImageToSvgDecompose lit pour identifier le calque source.
  // data-role posé sur LE GROUPE ET l'image : parseSvgStructure le préserve sur le
  // Group Fabric (parent) et sur la FabricImage (enfant). Le hook decompose teste
  // les deux pour trouver le calque source quel que soit le niveau ciblé.
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" data-source-name="${safeName}" data-pipeline="image-to-svg-mvp">
  <g id="image-bg-locked" data-role="image-bg-locked">
    <image href="${safeUrl}" x="0" y="0" width="${width}" height="${height}" preserveAspectRatio="xMidYMid slice" data-role="image-bg-locked"/>
  </g>
  <!-- Overlays vectoriels éditables : ajoutez ici vos <rect>, <text>, etc. -->
</svg>
`

  const baseName = imageFile.name.replace(/\.[^.]+$/, '') || 'image'
  const svgFile = new File([svg], `${baseName}.svg`, { type: 'image/svg+xml' })

  return { file: svgFile, width, height, imageUrl, storagePath }
}
