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
  // Tout est PRESCRIT, presque rien n'est interdit : un modèle d'image exécute
  // ce qu'on lui demande de faire et ignore largement les négations. Décrire un
  // décor (« workshop ») suffisait à faire apparaître murs, fenêtre et lumière
  // du jour, quel que soit le nombre d'interdits ajoutés ensuite. On impose donc
  // un PACKSHOT STUDIO : le sujet est seul, sur un fond fabriqué.
  return `Studio packshot photograph, shot on a professional cyclorama sweep for the front cover of a printed trade catalogue.\n`
    + `Subject, filling the UPPER two thirds of the frame: ${subject.trim().replace(/[.\s]+$/, '')}.\n`
    + `The subject is the ONLY thing in the picture. It rests on a smooth seamless studio floor that curves up into a plain graduated backdrop in soft neutral grey. `
    + `The backdrop is completely empty — bare seamless paper, nothing standing on it, nothing hanging on it.\n`
    // La maquette pose ses textes (panneau accent, titres, bandeau) dans la
    // MOITIÉ BASSE : un sujet placé bas s'y faisait recouvrir intégralement.
    + `Framing: vertical portrait, eye-level three-quarter angle, subject sitting high in the frame with a clean margin around it; the BOTTOM THIRD is empty backdrop only, reserved for headline text.\n`
    + `Focus: every product edge razor sharp front to back, fine material texture visible — brushed metal, matte plastic, rubber grip.\n`
    + `Light: two-softbox studio setup, soft directional key from the upper left, gentle fill from the right, crisp controlled specular highlights, one soft contact shadow under the products.\n`
    + `Rendering: honest high-end commercial product photography, accurate neutral colours, medium contrast, no filter, no illustration, no 3D render look.\n`
    + `Keep the objects completely unbranded: bare surfaces, no text, no letters, no numbers, no logos anywhere in the image. No people, no hands.`
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
    // Repli VISIBLE : un carré blanc autour du logo doit s'expliquer, sinon il
    // se confond avec « la fonctionnalité n'est pas déployée ».
    console.warn('[catalogue] détourage de l’emblème indisponible, fond conservé :', e)
    toast.warning('Emblème généré, mais le détourage a échoué — le fond blanc est conservé', {
      description: 'Service de détourage indisponible. Relancez « Emblème IA » ou chargez un PNG transparent.',
    })
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
