import { getApiKey } from '@/lib/apiKeys'
import { base64ToBlob } from './base64ToBlob'

const MODEL = 'gemini-3.1-flash-image-preview'
const ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`

interface GenerateImageResult {
  blob: Blob
  mimeType: string
}

interface GeminiImagePart {
  inlineData?: { mimeType: string; data: string }
  text?: string
}
interface GeminiImageResponse {
  candidates?: Array<{ content?: { parts?: GeminiImagePart[] } }>
}

/**
 * Génère une image via Gemini Nano Banana à partir d'un prompt texte.
 * Retourne le Blob et son mimeType. Throw si la clé est absente, si l'API renvoie
 * une erreur, ou si la réponse ne contient pas d'inlineData.
 */
export async function generateImage(prompt: string): Promise<GenerateImageResult> {
  const apiKey = getApiKey('gemini')
  if (!apiKey) throw new Error('Clé Gemini absente. Configurez-la dans Réglages.')

  const res = await fetch(`${ENDPOINT}?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        responseModalities: ['IMAGE'],
      },
    }),
  })

  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Gemini Image API ${res.status} : ${body.slice(0, 200)}`)
  }

  const data = (await res.json()) as GeminiImageResponse
  const parts = data.candidates?.[0]?.content?.parts ?? []
  const inline = parts.find((p) => p.inlineData)?.inlineData
  if (!inline) {
    throw new Error("Gemini Image : aucune image dans la réponse")
  }

  const blob = base64ToBlob(inline.data, inline.mimeType)
  return { blob, mimeType: inline.mimeType }
}
