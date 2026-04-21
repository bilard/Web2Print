import { getApiKey } from '@/lib/apiKeys'
import type { DesignSlot } from './artDirectorSchema'

/**
 * Génère UNE image via Nano Banana 2 pour un slot du DesignPlan.
 *
 * Diffère de `useImageGeneration` :
 *   - pas de gallery upload (l'image est inlinée dans le SVG)
 *   - retourne directement le data URI base64
 *   - silencieux en cas d'erreur (le pipeline continue avec placeholder gris)
 *
 * Modèles tentés en cascade (Nano Banana 2 → fallbacks) :
 *   gemini-3.1-flash-image-preview > gemini-2.0-flash-exp > gemini-2.5-flash-preview-image-generation
 */

const NANO_BANANA_MODELS = [
  'gemini-3.1-flash-image-preview',
  'gemini-2.0-flash-exp',
  'gemini-2.5-flash-preview-image-generation',
] as const

interface SlotImageResult {
  ok: boolean
  dataUri?: string
  error?: string
}

interface GenerateSlotImageArgs {
  slot: DesignSlot
  /** Style global du design pour orienter le rendu (ex: "bold print", "minimaliste"). */
  styleHint?: string
  /** Concept directeur du design (du DesignPlan) pour le contexte. */
  conceptHint?: string
  /** DPI cible (pour estimer la résolution requise). */
  dpi: number
}

const SUPPORTED_RATIOS: Array<{ r: number; label: string }> = [
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

function pickAspectRatio(wMm: number, hMm: number): string {
  const target = wMm / hMm
  let best = SUPPORTED_RATIOS[0]
  let bestDiff = Infinity
  for (const s of SUPPORTED_RATIOS) {
    const diff = Math.abs(target - s.r)
    if (diff < bestDiff) {
      bestDiff = diff
      best = s
    }
  }
  return best.label
}

function pickImageSize(wMm: number, hMm: number, dpi: number): string {
  const pxMax = Math.max(wMm, hMm) * (dpi / 25.4)
  if (pxMax <= 512) return '512'
  if (pxMax <= 1024) return '1K'
  if (pxMax <= 2048) return '2K'
  return '4K'
}

function buildImagePrompt(args: GenerateSlotImageArgs): string {
  const parts: string[] = []
  parts.push(args.slot.description)
  if (args.styleHint) parts.push(`Style général : ${args.styleHint}.`)
  if (args.conceptHint) parts.push(`Contexte : ${args.conceptHint}.`)
  parts.push(
    'Visuel propre prêt pour print : photo produit OU illustration vectorielle nette. Fond UNI (blanc, transparent, ou couleur unie pleine) — JAMAIS de quadrillage, grille, papier millimétré, motif technique, watermark, ni texture pattern. Aucun texte ni légende dans l\'image.',
  )
  return parts.join(' ')
}

export async function generateSlotImage(args: GenerateSlotImageArgs): Promise<SlotImageResult> {
  const apiKey = getApiKey('gemini')
  if (!apiKey) {
    return { ok: false, error: 'Clé API Gemini absente' }
  }

  const { w, h } = args.slot.bboxMm
  const aspectRatio = pickAspectRatio(w, h)
  const imageSize = pickImageSize(w, h, args.dpi)

  const requestBody = {
    contents: [{ parts: [{ text: `Generate an image: ${buildImagePrompt(args)}` }] }],
    generationConfig: {
      responseModalities: ['TEXT', 'IMAGE'],
      imageConfig: { aspectRatio, imageSize },
    },
  }

  let lastError = ''
  for (const model of NANO_BANANA_MODELS) {
    let res: Response
    try {
      res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(requestBody),
        },
      )
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err)
      continue
    }

    if (!res.ok) {
      lastError = await res.text()
      continue
    }

    const data = (await res.json()) as {
      candidates?: Array<{
        finishReason?: string
        content?: { parts?: Array<Record<string, unknown>> }
      }>
    }

    const block = data.candidates?.[0]?.finishReason
    if (block === 'SAFETY' || block === 'RECITATION') {
      return { ok: false, error: `Slot "${args.slot.id}" : génération refusée (${block})` }
    }

    const parts = data.candidates?.[0]?.content?.parts ?? []
    for (const part of parts) {
      const inlineDataV1 = (part as { inline_data?: { mime_type?: string; data?: string } }).inline_data
      const inlineDataV2 = (part as { inlineData?: { mimeType?: string; data?: string } }).inlineData
      const inline = inlineDataV1 ?? inlineDataV2
      const mimeType = (inlineDataV1?.mime_type) ?? (inlineDataV2?.mimeType)
      const b64 = inline?.data
      if (mimeType?.startsWith('image/') && b64) {
        return { ok: true, dataUri: `data:${mimeType};base64,${b64}` }
      }
    }
    lastError = 'Aucune image dans la réponse'
  }

  return { ok: false, error: lastError.slice(0, 200) || 'Tous les modèles Nano Banana ont échoué' }
}
