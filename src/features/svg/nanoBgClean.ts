/**
 * Nettoyage du fond via Nano Banana (Gemini Image) : efface les textes PROMO de
 * l'image rasterisée (prix, badges, labels d'offre, placeholders {{…}}, footer)
 * en conservant photo produit, formes, couleurs et textes du packaging.
 *
 * Utilisé par la décomposition ÉDITEUR : le fond nettoyé remplace le raster
 * verrouillé, les Textbox éditables se posent sur des zones vierges → plus
 * d'effet « texte en double », sans masques rectangulaires approximatifs.
 *
 * Retourne une URL Firebase Storage (PAS un data URI : le canvas est sérialisé
 * dans Firestore qui plafonne à 1 MiB/document — même contrainte que pdfToSvg).
 */

import { ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage'
import { storage, auth } from '@/lib/firebase/config'
import { generateImage } from '@/features/briefs/ai/geminiImageClient'

const CLEAN_PROMPT = `This is a retail promo card. Edit the image: ERASE all PROMOTIONAL printed text, keeping everything else pixel-identical.

Erase completely (fill with the underlying flat background color/shape):
- prices, currency codes and decimals (e.g. "22,99", "DT")
- percentage/discount badge text (e.g. "30%", "d'économie")
- offer labels and ribbons text (e.g. "OFFRE", "+55g GRATUIT")
- template placeholders in double curly braces (e.g. "{{Libelle Article}}")
- footer file name, page number and date

DO NOT modify:
- the product photo and any text printed ON the product packaging itself (brand logo, volume like "150 ml")
- shapes, bubbles, ribbons, frames, colors, crop marks, layout
- image dimensions and aspect ratio

Output the SAME image with only the promotional texts removed.`

/**
 * Génère le fond nettoyé et l'upload vers Storage. Lève si pas de session
 * Firebase, pas de clé Gemini, ou échec de génération — le caller fait
 * fallback sur les masques classiques.
 */
export async function cleanPromoTextsFromImage(dataUri: string): Promise<string> {
  const user = auth.currentUser
  if (!user) throw new Error('Connexion Firebase requise pour le nettoyage du fond.')

  const m = dataUri.match(/^data:([^;]+);base64,(.*)$/s)
  if (!m) throw new Error('Image source non base64 — nettoyage impossible.')

  const { blob } = await generateImage(
    CLEAN_PROMPT,
    [{ mimeType: m[1], data: m[2], label: 'Image à nettoyer' }],
    { outputFormat: 'images-only', imageSize: '1K' },
  )

  const path = `users/${user.uid}/pdf-to-svg-sources/${Date.now()}-bg-cleaned.png`
  const ref = storageRef(storage, path)
  await uploadBytes(ref, blob, {
    contentType: blob.type || 'image/png',
    cacheControl: 'public, max-age=31536000',
  })
  return getDownloadURL(ref)
}
