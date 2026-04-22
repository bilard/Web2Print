/**
 * Génère une image PNG créative du design COMPLET via Nano Banana.
 * Ceci est la source créative du design — elle sera utilisée comme référence
 * visuelle par le SVG Engineer pour produire le SVG vectoriel éditable.
 */

import { getApiKey } from '@/lib/apiKeys'
import type { DesignStyle } from './types'
import type { DesignPlan } from './artDirectorSchema'

interface GenerateFullDesignImageArgs {
  /** Brief utilisateur original */
  userPrompt: string

  /** Plan structuré produit par l'Art Director */
  plan: DesignPlan

  /** Dimensions du design */
  widthMm: number
  heightMm: number

  /** Style global (corporate, minimaliste, bold, etc.) */
  style: DesignStyle

  /** DPI pour estimer la résolution requise */
  dpi: number
}

interface FullDesignImageResult {
  ok: boolean
  dataUri?: string
  error?: string
}

const NANO_BANANA_MODELS = [
  'gemini-3.1-flash-image-preview',
  'gemini-2.0-flash-exp',
  'gemini-2.5-flash-preview-image-generation',
] as const

function buildFullDesignPrompt(args: GenerateFullDesignImageArgs): string {
  const formatRatio = (args.widthMm / args.heightMm).toFixed(2)
  const parts: string[] = []

  parts.push(`Create a professional retail/print advertising design image.`)
  parts.push(`User brief: ${args.userPrompt}`)
  parts.push(
    `Composition strategy: ${args.plan.mainDevice}. Concept: ${args.plan.concept}. Colors (ONLY use these): ${args.plan.palette.join(', ')}.`,
  )

  parts.push(
    `Visual hierarchy: Title large/bold, subtitle medium, body readable, CTA prominent. NO text overlaps. Clear separation between zones.`,
  )

  parts.push(`Style: ${args.style} — professional, clean, print-ready.`)
  parts.push(`Dimensions: ${args.widthMm}mm × ${args.heightMm}mm (ratio ${formatRatio}:1).`)
  parts.push(
    `Output: High-quality retail poster/flyer suitable for printing. Professional photo or illustration if needed. Solid background (white, color, or gradient). NO watermark, grid, or technical artifacts.`,
  )

  return parts.join(' ')
}

function pickAspectRatio(widthMm: number, heightMm: number): string {
  const ratios = [
    { r: 1 / 4, label: '1:4' },
    { r: 2 / 3, label: '2:3' },
    { r: 3 / 4, label: '3:4' },
    { r: 9 / 16, label: '9:16' },
    { r: 1, label: '1:1' },
    { r: 4 / 3, label: '4:3' },
    { r: 3 / 2, label: '3:2' },
    { r: 16 / 9, label: '16:9' },
    { r: 21 / 9, label: '21:9' },
  ]

  const target = widthMm / heightMm
  let best = ratios[0]
  let bestDiff = Infinity

  for (const ratio of ratios) {
    const diff = Math.abs(target - ratio.r)
    if (diff < bestDiff) {
      bestDiff = diff
      best = ratio
    }
  }

  return best.label
}

function pickImageSize(widthMm: number, heightMm: number, dpi: number): string {
  const pxMax = Math.max(widthMm, heightMm) * (dpi / 25.4)
  // Réduire pour respecter limite 5MB Claude multimodal
  if (pxMax <= 512) return '512'
  if (pxMax <= 1024) return '1K'
  if (pxMax <= 1536) return '1K' // Cap at 1K pour éviter 2K/4K → trop lourd
  return '1K' // Max 1K pour multimodal Claude
}

/**
 * Appelle Nano Banana pour générer une image PNG du design complet.
 * Utilise les mêmes modèles en cascade que generateSlotImage.
 * Retourne le data URI base64 de l'image générée.
 */
export async function generateFullDesignImage(args: GenerateFullDesignImageArgs): Promise<FullDesignImageResult> {
  const apiKey = getApiKey('gemini')
  if (!apiKey) {
    return { ok: false, error: 'Clé API Gemini absente' }
  }

  const aspectRatio = pickAspectRatio(args.widthMm, args.heightMm)
  const imageSize = pickImageSize(args.widthMm, args.heightMm, args.dpi)
  const prompt = buildFullDesignPrompt(args)

  const requestBody = {
    contents: [
      {
        parts: [
          {
            text: prompt,
          },
        ],
      },
    ],
    generationConfig: {
      responseModalities: ['TEXT', 'IMAGE'],
      imageConfig: {
        aspectRatio,
        imageSize,
      },
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
      return { ok: false, error: `Génération refusée (${block})` }
    }

    const parts = data.candidates?.[0]?.content?.parts ?? []
    for (const part of parts) {
      const inlineDataV1 = (part as { inline_data?: { mime_type?: string; data?: string } }).inline_data
      const inlineDataV2 = (part as { inlineData?: { mimeType?: string; data?: string } }).inlineData
      const inline = inlineDataV1 ?? inlineDataV2
      const mimeType = inlineDataV1?.mime_type ?? inlineDataV2?.mimeType
      const b64 = inline?.data

      if (mimeType?.startsWith('image/') && b64) {
        const b64Size = b64.length
        console.log(`[generateFullDesignImage] Image generated: ${Math.round(b64Size / 1024 / 1024)}MB`)
        return { ok: true, dataUri: `data:${mimeType};base64,${b64}` }
      }
    }

    lastError = 'Aucune image dans la réponse'
  }

  return { ok: false, error: lastError.slice(0, 200) || 'Tous les modèles Nano Banana ont échoué' }
}
