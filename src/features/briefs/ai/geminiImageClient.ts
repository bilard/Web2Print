import { getApiKey } from '@/lib/apiKeys'
import { base64ToBlob } from './base64ToBlob'

const MODEL = 'gemini-3.1-flash-image-preview'
const ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`

interface GenerateImageResult {
  blob: Blob
  mimeType: string
}

export interface ReferenceImage {
  mimeType: string
  /** base64 sans préfixe data: */
  data: string
  /** label optionnel injecté en texte juste avant l'image (ex: "Logo principal") */
  label?: string
}

interface GeminiImagePart {
  inlineData?: { mimeType: string; data: string }
  text?: string
}
interface GeminiImageResponse {
  candidates?: Array<{ content?: { parts?: GeminiImagePart[] } }>
}

/**
 * Génère une image via Gemini 3.1 Nano Banana 2 à partir d'un prompt texte et
 * d'images de référence optionnelles (logos, charte graphique rasterisée).
 * Les images de référence sont injectées en inlineData parts avant le prompt
 * pour que le modèle les utilise comme guide stylistique et d'identité.
 */
export async function generateImage(
  prompt: string,
  referenceImages: ReferenceImage[] = [],
): Promise<GenerateImageResult> {
  const apiKey = getApiKey('gemini')
  if (!apiKey) throw new Error('Clé Gemini absente. Configurez-la dans Réglages.')

  const parts: GeminiImagePart[] = []
  for (const ref of referenceImages) {
    if (ref.label) parts.push({ text: `Reference — ${ref.label}:` })
    parts.push({ inlineData: { mimeType: ref.mimeType, data: ref.data } })
  }
  parts.push({ text: prompt })

  const res = await fetch(`${ENDPOINT}?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts }],
      generationConfig: {
        responseModalities: ['TEXT', 'IMAGE'],
      },
    }),
  })

  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Gemini Image API ${res.status} : ${body.slice(0, 200)}`)
  }

  const data = (await res.json()) as GeminiImageResponse
  const outParts = data.candidates?.[0]?.content?.parts ?? []
  const inline = outParts.find((p) => p.inlineData)?.inlineData
  if (!inline) {
    console.error('[geminiImageClient] Réponse sans image', JSON.stringify(data).slice(0, 1500))
    const textPart = outParts.find((p) => p.text)?.text
    throw new Error(
      `Gemini Image : aucune image dans la réponse${textPart ? ` — "${textPart.slice(0, 200)}"` : ''}`,
    )
  }

  const blob = base64ToBlob(inline.data, inline.mimeType)
  return { blob, mimeType: inline.mimeType }
}
