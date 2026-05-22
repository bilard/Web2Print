import { getApiKey } from '@/lib/apiKeys'
import { base64ToBlob } from './base64ToBlob'
import { useAiActivityStore, nextAiActivityId } from '@/stores/aiActivity.store'
import { recordAiUsage } from '@/features/stats/aiUsageTracking'

const MODEL = 'gemini-3.1-flash-image-preview'
const ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`

interface GenerateImageResult {
  blob: Blob
  mimeType: string
  /** Tokens texte en entrée d'après `usageMetadata.promptTokenCount`. */
  inputTokens?: number
  /** Tokens en sortie d'après `usageMetadata.candidatesTokenCount` (image = ~1290). */
  outputTokens?: number
  /** Coût USD calculé via pricing du modèle. */
  costUsd?: number
}

export interface ReferenceImage {
  mimeType: string
  /** base64 sans préfixe data: */
  data: string
  /** label optionnel injecté en texte juste avant l'image (ex: "Logo principal") */
  label?: string
}

export type OutputFormat = 'images-text' | 'images-only'

/** Tailles supportées par Nano Banana 2 (Gemini 3.1 image preview). */
export type ImageSize = '1K' | '2K' | '4K'

/** Ratios supportés par Nano Banana 2. `auto` = ratio natif décidé par le modèle. */
export type ImageAspectRatio = 'auto' | '1:1' | '16:9' | '9:16' | '4:3' | '3:4'

export interface GenerateImageOptions {
  /** 'images-text' (défaut) demande à Gemini IMAGE + TEXT ; 'images-only' uniquement IMAGE. */
  outputFormat?: OutputFormat
  /** Taille du visuel généré (défaut `1K`). 2K/4K = 2-3× plus lent. */
  imageSize?: ImageSize
  /** Ratio d'image (défaut `auto`, ratio natif décidé par le modèle). */
  aspectRatio?: ImageAspectRatio
}

interface GeminiImagePart {
  inlineData?: { mimeType: string; data: string }
  text?: string
}
interface GeminiUsageMetadata {
  promptTokenCount?: number
  candidatesTokenCount?: number
  totalTokenCount?: number
}
interface GeminiImageResponse {
  candidates?: Array<{ content?: { parts?: GeminiImagePart[] } }>
  usageMetadata?: GeminiUsageMetadata
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
  options: GenerateImageOptions = {},
): Promise<GenerateImageResult> {
  const apiKey = getApiKey('gemini')
  if (!apiKey) throw new Error('Clé Gemini absente. Configurez-la dans Réglages.')

  const activity = useAiActivityStore.getState()
  const activityId = nextAiActivityId('img')
  activity.start({
    id: activityId,
    provider: 'gemini-image',
    model: MODEL,
    label: 'Nano Banana 2',
    kind: 'image',
  })
  try {
    const result = await generateImageInner(apiKey, prompt, referenceImages, options)
    activity.end(activityId, 'success', {
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
      costUsd: result.costUsd,
    })
    return result
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    activity.end(activityId, 'error', { errorMessage: message })
    throw err
  }
}

async function generateImageInner(
  apiKey: string,
  prompt: string,
  referenceImages: ReferenceImage[],
  options: GenerateImageOptions,
  /** Si true : force `responseModalities: ['IMAGE']` quel que soit le réglage
   *  utilisateur. Utilisé pour le retry automatique quand le modèle a répondu
   *  conversationnellement ("How can I help you today?") au lieu de générer. */
  forceImageOnly = false,
): Promise<GenerateImageResult> {

  const parts: GeminiImagePart[] = []
  for (const ref of referenceImages) {
    if (ref.label) parts.push({ text: `Reference — ${ref.label}:` })
    parts.push({ inlineData: { mimeType: ref.mimeType, data: ref.data } })
  }
  parts.push({ text: prompt })

  const outputFormat: OutputFormat = options.outputFormat ?? 'images-text'
  const responseModalities = forceImageOnly || outputFormat === 'images-only'
    ? ['IMAGE']
    : ['TEXT', 'IMAGE']

  const imageSize: ImageSize = options.imageSize ?? '1K'
  const aspectRatio: ImageAspectRatio = options.aspectRatio ?? 'auto'

  const imageConfig: Record<string, string> = { imageSize }
  if (aspectRatio !== 'auto') imageConfig.aspectRatio = aspectRatio

  const body = JSON.stringify({
    contents: [{ parts }],
    generationConfig: {
      responseModalities,
      imageConfig,
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
      const textPart = outParts.find((p) => p.text)?.text
      // Nano Banana a répondu en texte ("How can I help you today?", "Sure, here's…")
      // au lieu de générer. Si on était en mode TEXT+IMAGE, on retry une fois en
      // forçant IMAGE-only — ça empêche le modèle de basculer en conversationnel.
      if (!forceImageOnly && outputFormat !== 'images-only') {
        console.warn(
          `[geminiImageClient] Réponse text-only — retry forcé IMAGE-only. Texte: "${(textPart ?? '').slice(0, 120)}"`,
        )
        return await generateImageInner(apiKey, prompt, referenceImages, options, true)
      }
      console.error('[geminiImageClient] Réponse sans image', JSON.stringify(data).slice(0, 1500))
      throw new Error(
        `Gemini Image : aucune image dans la réponse${textPart ? ` — "${textPart.slice(0, 200)}"` : ''}`,
      )
    }

    const blob = base64ToBlob(inline.data, inline.mimeType)
    const usage = data.usageMetadata
    const inputTokens = usage?.promptTokenCount ?? 0
    const outputTokens = usage?.candidatesTokenCount ?? 0
    // recordAiUsage agrège pour Firestore (compteur mensuel) et notifie le live
    // listener — calcule aussi le coût USD à partir de pricing × tokens.
    const costUsd = recordAiUsage({
      provider: 'gemini',
      model: MODEL,
      inputTokens,
      outputTokens,
    })
    return { blob, mimeType: inline.mimeType, inputTokens, outputTokens, costUsd }
  }
  throw lastErr
}
