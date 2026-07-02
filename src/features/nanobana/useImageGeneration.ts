import { useCallback } from 'react'
import { useNanoBanaStore } from '@/stores/nanobana.store'
import { useImageGallery } from './useImageGallery'
import { generateImageBase64 } from './generateImageBase64'
import type { GenerationRequest } from './types'

export function useImageGeneration() {
  const { setGenerating, setGenerationError } = useNanoBanaStore()
  const { uploadToGallery } = useImageGallery()

  const generateImage = useCallback(
    async (request: GenerationRequest) => {
      setGenerating(true)
      setGenerationError(null)

      try {
        // Appel brut (cascade de modèles + parsing) délégué à generateImageBase64,
        // partagé avec les modules sans projet éditeur ouvert (ex. useCoverImage).
        const { mimeType, base64: b64 } = await generateImageBase64(request)

        // Convert base64 to File
        const binary = atob(b64)
        const bytes = new Uint8Array(binary.length)
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
        const blob = new Blob([bytes], { type: mimeType })
        const ext = mimeType === 'image/png' ? 'png' : 'jpg'
        const tags = request.sourceImageBase64
          ? ['ai-edited', 'nano-banana']
          : ['ai-generated', 'nano-banana']
        const file = new File([blob], `nanobana_${Date.now()}.${ext}`, { type: mimeType })

        const image = await uploadToGallery(file, tags)
        if (!image) {
          throw new Error('Impossible de sauvegarder l\'image — vérifiez que le projet est bien ouvert')
        }
        return image
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        // Translate Firebase permission errors
        const finalMsg = msg.includes('Missing or insufficient permissions')
          ? 'Permissions Firestore insuffisantes — sauvegardez le projet (⌘S) puis réessayez'
          : msg.includes('permission-denied') || msg.includes('PERMISSION_DENIED')
            ? 'Accès refusé — vérifiez que vous êtes bien connecté'
            : msg
        setGenerationError(finalMsg)
        console.error('Image IA generation error', err)
        return null
      } finally {
        setGenerating(false)
      }
    },
    [setGenerating, setGenerationError, uploadToGallery],
  )

  return { generateImage }
}
