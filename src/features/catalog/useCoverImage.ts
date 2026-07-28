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
import { useCatalogStore } from '@/stores/catalog.store'
import { pagePx } from './components/pages/catalogCss'

function base64ToBlob(base64: string, mimeType: string): Blob {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return new Blob([bytes], { type: mimeType })
}

/**
 * Brief d'EMBLÈME de marque : un SYMBOLE, jamais de lettrage — le nom reste
 * composé typographiquement (un modèle d'image l'orthographierait mal).
 */
export function emblemPrompt(name: string, accent: string): string {
  return `Minimal flat vector brand emblem for a professional retail tools catalogue named "${name}". `
    + `Simple geometric symbol only, NO text, NO letters, NO words. `
    + `Solid ${accent} accent with dark neutral tones, plain pure white background, crisp edges, no gradient, no photorealism, centered, generous margins.`
}

/** Cibles d'un visuel de catalogue : couverture, 4e, ou LOGO de marque. */
export type CoverTarget = 'cover' | 'back' | 'logo'

/**
 * DIRECTION ARTISTIQUE imposée aux couvertures, en plus du sujet demandé.
 * Sans elle, le modèle rendait des scènes d'intérieur banales (bureau, fenêtre,
 * fouillis) : correctes mais indignes d'une couverture de catalogue. On exige
 * donc le vocabulaire du shooting publicitaire — et de la PLACE pour les textes,
 * qui viennent se poser par-dessus.
 */
function withArtDirection(prompt: string, target: CoverTarget): string {
  if (target === 'logo') return prompt
  return `${prompt.trim().replace(/[.\s]+$/, '')}. `
    + `Award-winning commercial advertising photography for a premium retail catalogue cover. `
    + `Studio-grade controlled lighting, crisp specular highlights, shallow depth of field, hero product staging. `
    // « generous empty negative space » produisait un APLAT BLANC sur la moitié
    // de l'image : on demande une zone CALME (flou, dégradé), pas du vide.
    + `Uncluttered composition that keeps one side calmer and less busy for headline text — softly defocused or gently graded background there, never a flat empty white block. `
    + `Rich contrast, colour-graded, ultra sharp focus, high-end editorial quality, shot on medium format. `
    + `No text, no letters, no logo, no watermark, no people, no office interior, no window view, no clutter, no messy background.`
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
      const { mimeType, base64 } = await generateImageBase64({ prompt: withArtDirection(prompt, target), targetWidth: w, targetHeight: h })
      apply(target, await uploadToCovers(uid, base64ToBlob(base64, mimeType), mimeType, target))
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
