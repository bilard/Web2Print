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

const TRANSIENT_STATUSES = new Set([429, 500, 502, 503, 504])
const MAX_ATTEMPTS = 4
const BASE_DELAY_MS = 1500

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

/**
 * Génère une image via Gemini 3.1 Nano Banana 2 à partir d'un prompt texte et
 * d'images de référence optionnelles (logos, charte graphique rasterisée).
 * Les images de référence sont injectées en inlineData parts avant le prompt
 * pour que le modèle les utilise comme guide stylistique et d'identité.
 *
 * Retry automatique avec backoff exponentiel + jitter sur les 5xx/429 (surcharge
 * Google transitoire — fréquent en pic de demande sur NB). Jusqu'à 4 tentatives
 * espacées de ~1,5s / 3s / 6s. Les erreurs non-transitoires (400 schema, 401
 * auth…) remontent immédiatement.
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

  const body = JSON.stringify({
    contents: [{ parts }],
    generationConfig: {
      responseModalities: ['TEXT', 'IMAGE'],
      // 1K suffit largement pour un visuel de slide deck. En 2K/4K NB
      // prend 2-3× plus de temps pour un gain invisible à l'écran.
      imageConfig: { imageSize: '1K' },
    },
  })

  let lastErr: Error = new Error('Gemini Image : échec inconnu')
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const ctrl = new AbortController()
    const timeoutId = setTimeout(() => ctrl.abort(), 90_000)
    let res: Response
    try {
      res = await fetch(`${ENDPOINT}?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
        signal: ctrl.signal,
      })
    } catch (err) {
      clearTimeout(timeoutId)
      if ((err as Error).name === 'AbortError') {
        lastErr = new Error('Gemini Image : timeout après 90s')
      } else {
        lastErr = err as Error
      }
      // Erreurs réseau : on retente aussi (fetch peut échouer sur surcharge)
      if (attempt < MAX_ATTEMPTS) {
        await sleep(BASE_DELAY_MS * 2 ** (attempt - 1) + Math.random() * 400)
        continue
      }
      throw lastErr
    }
    clearTimeout(timeoutId)

    if (!res.ok) {
      const text = await res.text()
      const err = new Error(`Gemini Image API ${res.status} : ${text.slice(0, 200)}`)
      if (TRANSIENT_STATUSES.has(res.status) && attempt < MAX_ATTEMPTS) {
        lastErr = err
        console.warn(
          `[geminiImageClient] ${res.status} transitoire (essai ${attempt}/${MAX_ATTEMPTS}), retry…`,
        )
        await sleep(BASE_DELAY_MS * 2 ** (attempt - 1) + Math.random() * 400)
        continue
      }
      throw err
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
  throw lastErr
}
