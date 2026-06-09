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

/** Prompt SÉLECTIF : n'efface QUE les textes listés (champs variables rendus
 *  éditables par la décomposition) — tout le reste du graphisme d'origine
 *  (badges, rubans, labels, photo, packaging) reste pixel-identique. */
function buildCleanPrompt(textsToErase: string[]): string {
  const list = textsToErase.map((t) => `- "${t.replace(/\s+/g, ' ').trim()}"`).join('\n')
  return `This is a retail promo card. Edit the image: ERASE ONLY the following exact printed texts, filling each erased area with the underlying flat background color/shape so the area looks blank:

${list}

DO NOT modify ANYTHING else. Keep pixel-identical:
- every other text, label, badge and ribbon (do NOT erase them)
- the product photo and any text printed on the product packaging
- shapes, bubbles, frames, colors, crop marks, layout
- image dimensions and aspect ratio

Output the SAME image with only the listed texts removed.`
}

/**
 * Génère le fond nettoyé (textes listés effacés) et l'upload vers Storage.
 * Lève si pas de session Firebase, pas de clé Gemini, ou échec de génération —
 * le caller fait fallback sur les masques classiques.
 */
export async function cleanPromoTextsFromImage(dataUri: string, textsToErase: string[]): Promise<string> {
  const user = auth.currentUser
  if (!user) throw new Error('Connexion Firebase requise pour le nettoyage du fond.')

  if (textsToErase.length === 0) throw new Error('Aucun texte à effacer — nettoyage inutile.')
  const m = dataUri.match(/^data:([^;]+);base64,(.*)$/s)
  if (!m) throw new Error('Image source non base64 — nettoyage impossible.')

  const { blob } = await generateImage(
    buildCleanPrompt(textsToErase),
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
