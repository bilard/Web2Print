import { useCallback } from 'react'
import { useNanoBanaStore } from '@/stores/nanobana.store'
import { useImageGallery } from './useImageGallery'
import { getApiKey } from '@/lib/apiKeys'
import type { GenerationRequest } from './types'

// Nano Banana 2, fallback to original Nano Banana if not available
const NANO_BANANA_MODELS = [
  'gemini-3.1-flash-image-preview',
  'gemini-2.0-flash-exp',
  'gemini-2.5-flash-preview-image-generation',
] as const

/** Map target dimensions to the best Nano Banana imageSize */
function pickImageSize(w?: number, h?: number): string {
  if (!w || !h) return '1K'
  const maxDim = Math.max(w, h)
  if (maxDim <= 512) return '512'
  if (maxDim <= 1024) return '1K'
  if (maxDim <= 2048) return '2K'
  return '4K'
}

/** Find the closest supported aspect ratio for given dimensions */
function pickAspectRatio(w?: number, h?: number, fallback?: string): string {
  if (!w || !h) return fallback ?? '1:1'
  const ratio = w / h
  const supported = [
    { r: 1 / 4, label: '1:4' },
    { r: 1 / 8, label: '1:8' },
    { r: 2 / 3, label: '2:3' },
    { r: 3 / 4, label: '3:4' },
    { r: 4 / 5, label: '4:5' },
    { r: 9 / 16, label: '9:16' },
    { r: 1, label: '1:1' },
    { r: 5 / 4, label: '5:4' },
    { r: 4 / 3, label: '4:3' },
    { r: 3 / 2, label: '3:2' },
    { r: 16 / 9, label: '16:9' },
    { r: 21 / 9, label: '21:9' },
    { r: 4 / 1, label: '4:1' },
    { r: 8 / 1, label: '8:1' },
  ]
  let best = supported[0]
  let bestDiff = Infinity
  for (const s of supported) {
    const diff = Math.abs(ratio - s.r)
    if (diff < bestDiff) { bestDiff = diff; best = s }
  }
  return best.label
}

export function useImageGeneration() {
  const { setGenerating, setGenerationError } = useNanoBanaStore()
  const { uploadToGallery } = useImageGallery()

  const generateImage = useCallback(
    async (request: GenerationRequest) => {
      const apiKey = getApiKey('gemini')
      if (!apiKey) {
        setGenerationError('Clé API Nano Banana manquante — configurez-la dans Paramètres')
        return null
      }

      setGenerating(true)
      setGenerationError(null)

      try {
        // Build parts: text + optional source image
        const parts: Record<string, unknown>[] = []

        if (request.sourceImageBase64 && request.sourceImageMimeType) {
          // Image-to-image editing: source image + editing instruction
          parts.push({
            inlineData: {
              mimeType: request.sourceImageMimeType,
              data: request.sourceImageBase64,
            },
          })
          parts.push({ text: `Edit this image: ${request.prompt}` })
        } else {
          parts.push({ text: `Generate an image: ${request.prompt}` })
        }

        // Nano Banana imageConfig
        const aspectRatio = pickAspectRatio(request.targetWidth, request.targetHeight, request.aspectRatio)
        const imageSize = pickImageSize(request.targetWidth, request.targetHeight)

        const requestBody = {
          contents: [{ parts }],
          generationConfig: {
            responseModalities: ['TEXT', 'IMAGE'],
            imageConfig: {
              aspectRatio,
              imageSize,
            },
          },
        }

        // Try each model until one succeeds
        let response: Response | null = null
        let lastError = ''
        for (const model of NANO_BANANA_MODELS) {
          response = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(requestBody),
            },
          )
          if (response.ok) {
            break
          }
          lastError = await response.text()
          console.warn(`[NanoBana] Model ${model} failed: ${lastError.slice(0, 200)}`)
          response = null
        }

        if (!response) {
          // Parse detailed error from the last API response
          let detail = 'Tous les modèles ont échoué'
          try {
            const errJson = JSON.parse(lastError)
            const errMsg = errJson?.error?.message ?? ''
            if (errMsg.includes('API_KEY_INVALID') || errMsg.includes('API key not valid')) {
              detail = 'Clé API Gemini invalide — vérifiez-la dans Paramètres > Clés API'
            } else if (errMsg.includes('PERMISSION_DENIED')) {
              detail = 'Accès refusé par l\'API Gemini — vérifiez les permissions de votre clé'
            } else if (errMsg.includes('QUOTA') || errMsg.includes('quota')) {
              detail = 'Quota Gemini dépassé — réessayez plus tard ou changez de clé'
            } else if (errMsg.includes('SAFETY') || errMsg.includes('safety')) {
              detail = 'Contenu bloqué par le filtre de sécurité — reformulez votre prompt'
            } else if (errMsg.includes('not found') || errMsg.includes('NOT_FOUND')) {
              detail = 'Modèle Gemini non disponible — l\'API peut être en maintenance'
            } else if (errMsg) {
              detail = errMsg.length > 150 ? errMsg.slice(0, 150) + '…' : errMsg
            }
          } catch {
            if (lastError.includes('Failed to fetch') || lastError.includes('NetworkError')) {
              detail = 'Erreur réseau — vérifiez votre connexion internet'
            }
          }
          throw new Error(detail)
        }

        const data = await response.json()

        // Check for blocked content
        const blockReason = data.candidates?.[0]?.finishReason
        if (blockReason === 'SAFETY') {
          throw new Error('Image bloquée par le filtre de sécurité — reformulez votre prompt')
        }
        if (blockReason === 'RECITATION') {
          throw new Error('Génération refusée (contenu protégé) — essayez un prompt différent')
        }

        // Extract image from response — handle both camelCase and snake_case keys
        const resParts = data.candidates?.[0]?.content?.parts ?? []
        const imagePart = resParts.find(
          (p: any) =>
            p.inline_data?.mime_type?.startsWith('image/') ||
            p.inlineData?.mimeType?.startsWith('image/'),
        )

        // Normalize: extract mimeType and data regardless of key format
        const inlineData = imagePart?.inline_data ?? imagePart?.inlineData
        if (!inlineData) {
          console.error('[NanoBana] No image in response parts:', resParts.map((p: any) => Object.keys(p)))
          throw new Error('L\'API n\'a retourné aucune image — essayez un prompt plus descriptif')
        }

        // Convert base64 to File
        const mimeType = inlineData.mime_type ?? inlineData.mimeType
        const b64 = inlineData.data
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
        console.error('Nano Banana generation error', err)
        return null
      } finally {
        setGenerating(false)
      }
    },
    [setGenerating, setGenerationError, uploadToGallery],
  )

  return { generateImage }
}
