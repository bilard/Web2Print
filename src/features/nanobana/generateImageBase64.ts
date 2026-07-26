// Appel BRUT à l'Image IA (Gemini, cascade de modèles) : renvoie l'image générée en
// base64, SANS upload. Extrait de useImageGeneration pour être réutilisable par des
// modules qui n'ont pas de projet éditeur ouvert (uploadToGallery exige
// useEditorStore.projectId) — ex. la couverture d'un catalogue (/catalog/:id).
import { llmPostWithFallback } from '@/lib/llmProxyClient'
import type { GenerationRequest } from './types'

// Image IA, fallback to other live image models if not available
const NANO_BANANA_MODELS = [
  'gemini-2.5-flash-image',
  'gemini-3.1-flash-image-preview',
  'gemini-3-pro-image-preview',
  'nano-banana-pro-preview',
] as const

export interface GeneratedImageBase64 { mimeType: string; base64: string }

/** Map target dimensions to the best Image IA imageSize */
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

/**
 * Appelle l'Image IA (cascade `models`/NANO_BANANA_MODELS) et renvoie l'image
 * générée en base64. Lève une Error au message français exploitable directement
 * en toast si tous les modèles échouent, si le contenu est bloqué, ou si l'API
 * ne renvoie aucune image.
 */
export async function generateImageBase64(request: GenerationRequest): Promise<GeneratedImageBase64> {
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

  // Image IA imageConfig
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

  // Try each model until one succeeds — via le proxy serveur (clé Firestore +
  // budget bloquant), fallback direct standard.
  let response: Awaited<ReturnType<typeof llmPostWithFallback>> | null = null
  let lastError = ''
  for (const model of request.models ?? NANO_BANANA_MODELS) {
    response = await llmPostWithFallback('gemini', model, requestBody, 90_000)
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

  const mimeType: string = inlineData.mime_type ?? inlineData.mimeType
  const base64: string = inlineData.data
  return { mimeType, base64 }
}
