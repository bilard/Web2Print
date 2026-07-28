// Visuel de couverture via Image IA (Gemini). Ne passe PAS par useImageGeneration
// (dont l'upload final vers la galerie exige useEditorStore.projectId — toujours
// null sur /catalog/:id, aucun projet éditeur n'y est ouvert → échec systématique).
// On appelle directement generateImageBase64 (même cascade de modèles/erreurs) puis
// on uploade en Firebase Storage users/{uid}/catalogCovers/ (bucket CORS déjà ouvert
// pour la capture html2canvas, cf. cors.json) avant de stocker l'URL dans le doc.
import { useState } from 'react'
import { toast } from 'sonner'
import { ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage'
import { auth, storage } from '@/lib/firebase/config'
import { generateImageBase64 } from '@/features/nanobana/generateImageBase64'
import { removeBackground } from '@/features/imaging/removeBackground'
import { useCatalogStore } from '@/stores/catalog.store'
import { pagePx } from './components/pages/catalogCss'

function base64ToBlob(base64: string, mimeType: string): Blob {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return new Blob([bytes], { type: mimeType })
}

/**
 * Brief d'EMBLÈME de marque. Nano Banana est un modèle INSTRUIT : il suit une
 * consigne de design formulée en phrases, là où un empilement de mots-clés
 * (style Midjourney) le fait dériver. On lui donne donc un cahier des charges
 * de graphiste — dont la contrainte qui compte vraiment en print : rester
 * lisible à 10 mm. Jamais de lettrage : le nom est composé typographiquement
 * (un modèle d'image l'orthographierait mal).
 */
export function emblemPrompt(name: string, accent: string): string {
  return `Design a brand emblem for a professional tools and hardware retailer called "${name}".\n`
    + `It must be ONE single simple geometric mark with a strong silhouette — the kind of icon that stays perfectly readable when printed at 10 mm wide.\n`
    + `Style: flat vector, solid fills, even confident strokes, balanced geometry, generous empty margin all around, perfectly centred.\n`
    + `Colours: only two — ${accent} and a dark neutral. Nothing else.\n`
    + `Background: plain pure white, completely uniform.\n`
    + `Do not add: text, letters, numbers, words, monograms, gradients, shadows, bevels, 3D, reflections, photorealism, mascots, or a second competing symbol.`
}

/**
 * Brief de COUVERTURE : le sujet vient du plan IA, la RÉALISATION est imposée
 * ici. Formulé en consignes de brief photo (cadrage, mise au point, lumière,
 * fond, interdits) plutôt qu'en liste de mots-clés — c'est ce que Nano Banana
 * exécute le mieux. Les deux ratés observés sont explicitement bannis : sujet
 * noyé dans le flou, et marques inventées sur les outils.
 */
function coverPrompt(subject: string): string {
  return `Front cover photograph for a printed professional trade catalogue.\n`
    + `Subject: ${subject.trim().replace(/[.\s]+$/, '')}.\n`
    + `Framing: vertical portrait. The hero products sit in the lower half, shot from a natural three-quarter working angle, close enough to fill the frame with confidence.\n`
    + `Focus: the hero products are TACK SHARP, clean and instantly recognisable, with fine detail on materials and edges. Only the far background falls off softly — never blur or hide the main subject.\n`
    + `Light: professional studio lighting, soft key light with controlled specular highlights, gentle fill, no harsh shadow, no colour cast.\n`
    + `Background: calm and tidy — a plain seamless backdrop or an uncluttered work surface — so headline text can sit in the upper area without fighting the image.\n`
    + `Rendering: honest high-end commercial product photography, natural accurate colours, medium contrast, fine texture. No HDR, no heavy filter, no illustration, no 3D render look.\n`
    + `Do not include: any text, letters, numbers, brand names or logos on the objects; watermarks; people or hands; office desks, computers or window views; messy piles; empty flat white areas.`
}

/** Cibles d'un visuel de catalogue : couverture, 4e, ou LOGO de marque. */
export type CoverTarget = 'cover' | 'back' | 'logo'

/** Le sujet du plan IA passe par le brief photo ; l'emblème a le sien. */
function finalPrompt(prompt: string, target: CoverTarget): string {
  return target === 'logo' ? prompt : coverPrompt(prompt)
}

/** Détoure l'emblème (rembg → PNG alpha recadré au sujet). Échec = image intacte. */
async function cutout(blob: Blob, mimeType: string): Promise<{ blob: Blob; mimeType: string }> {
  const src = URL.createObjectURL(blob)
  try {
    const { url } = await removeBackground(src)
    const png = await (await fetch(url)).blob()
    URL.revokeObjectURL(url)
    return { blob: png, mimeType: 'image/png' }
  } catch (e) {
    console.warn('[catalogue] détourage de l’emblème indisponible, fond conservé :', e)
    return { blob, mimeType }
  } finally {
    URL.revokeObjectURL(src)
  }
}

export function useCoverImage() {
  const [generating, setGenerating] = useState(false)

  /** Range un blob dans le bucket à CORS ouvert et renvoie son URL publique. */
  const uploadToCovers = async (uid: string, blob: Blob, mimeType: string, target: CoverTarget): Promise<string> => {
    const ext = mimeType === 'image/png' ? 'png' : mimeType === 'image/svg+xml' ? 'svg' : 'jpg'
    const fileRef = storageRef(storage, `users/${uid}/catalogCovers/${Date.now()}_${target}.${ext}`)
    await uploadBytes(fileRef, blob, { contentType: mimeType })
    return getDownloadURL(fileRef)
  }

  const apply = (target: CoverTarget, url: string) => {
    const s = useCatalogStore.getState()
    if (target === 'cover') s.setCoverImageUrl(url)
    else if (target === 'back') s.setBackCoverImageUrl(url)
    else s.setLogoUrl(url)
  }

  const generateCover = async (prompt: string, target: CoverTarget) => {
    if (!prompt.trim()) { toast.error('Renseignez d’abord le prompt image (plan IA ou saisie manuelle)'); return }
    const uid = auth.currentUser?.uid
    if (!uid) { toast.error('Connexion requise pour générer un visuel'); return }
    setGenerating(true)
    try {
      const s = useCatalogStore.getState()
      // Un logo est CARRÉ (emblème), pas au format de la page.
      const { w, h } = target === 'logo' ? { w: 512, h: 512 } : pagePx(s.format)
      const { mimeType, base64 } = await generateImageBase64({ prompt: finalPrompt(prompt, target), targetWidth: w, targetHeight: h })
      // L'EMBLÈME est détouré : Nano Banana ne sait pas produire d'alpha, et son
      // fond blanc formait un cartouche disgracieux sur les bandeaux colorés.
      // Échec du détourage → on garde l'image pleine (jamais de blocage).
      const shaped = target === 'logo'
        ? await cutout(base64ToBlob(base64, mimeType), mimeType)
        : { blob: base64ToBlob(base64, mimeType), mimeType }
      apply(target, await uploadToCovers(uid, shaped.blob, shaped.mimeType, target))
      toast.success(target === 'logo' ? 'Emblème généré' : 'Visuel de couverture généré')
    } catch (e) {
      toast.error(`Génération du visuel échouée — ${target === 'logo' ? 'logo typographique conservé' : 'couverture typographique conservée'} (${e instanceof Error ? e.message : 'erreur'})`)
    } finally {
      setGenerating(false)
    }
  }

  /** Visuel FOURNI par l'utilisateur (son vrai logo) — même bucket, donc même
   *  garantie CORS à l'export que les visuels générés. */
  const uploadImage = async (file: File, target: CoverTarget) => {
    const uid = auth.currentUser?.uid
    if (!uid) { toast.error('Connexion requise pour charger un visuel'); return }
    setGenerating(true)
    try {
      apply(target, await uploadToCovers(uid, file, file.type || 'image/png', target))
      toast.success('Visuel chargé')
    } catch (e) {
      toast.error(`Chargement impossible (${e instanceof Error ? e.message : 'erreur'})`)
    } finally {
      setGenerating(false)
    }
  }

  return { generating, generateCover, uploadImage }
}
