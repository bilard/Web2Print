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

export function useCoverImage() {
  const [generating, setGenerating] = useState(false)

  const generateCover = async (prompt: string, target: 'cover' | 'back') => {
    if (!prompt.trim()) { toast.error('Renseignez d’abord le prompt image (plan IA ou saisie manuelle)'); return }
    const uid = auth.currentUser?.uid
    if (!uid) { toast.error('Connexion requise pour générer un visuel'); return }
    setGenerating(true)
    try {
      const s = useCatalogStore.getState()
      const { w, h } = pagePx(s.format)
      const { mimeType, base64 } = await generateImageBase64({ prompt, targetWidth: w, targetHeight: h })
      const blob = base64ToBlob(base64, mimeType)
      const ext = mimeType === 'image/png' ? 'png' : 'jpg'
      const path = `users/${uid}/catalogCovers/${Date.now()}_${target}.${ext}`
      const fileRef = storageRef(storage, path)
      await uploadBytes(fileRef, blob, { contentType: mimeType })
      const url = await getDownloadURL(fileRef)
      if (target === 'cover') s.setCoverImageUrl(url)
      else s.setBackCoverImageUrl(url)
      toast.success('Visuel de couverture généré')
    } catch (e) {
      toast.error(`Génération du visuel échouée — couverture typographique conservée (${e instanceof Error ? e.message : 'erreur'})`)
    } finally {
      setGenerating(false)
    }
  }
  return { generating, generateCover }
}
