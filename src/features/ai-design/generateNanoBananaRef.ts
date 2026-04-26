/**
 * Génère une image PNG "ref créative" via Nano Banana (Gemini image).
 *
 * Cette ref N'EST PAS injectée dans le SVG ni dans le template. Elle sert
 * UNIQUEMENT comme aperçu visuel dans l'UI (DesignProgress) pour que
 * l'utilisateur compare son rendu template au concept créatif généré par IA.
 *
 * Fire-and-forget : si la génération échoue ou prend trop de temps, le
 * pipeline principal continue sans elle.
 */

import { getApiKey } from '@/lib/apiKeys'
import type { DesignStyle } from './types'

interface GenerateNanoBananaRefArgs {
  userPrompt: string
  widthMm: number
  heightMm: number
  style: DesignStyle
  dpi: number
  palette?: string[]
}

interface NanoBananaRefResult {
  ok: boolean
  dataUri?: string
  error?: string
}

// Nano Banana 2 / Pro en premier (créativité maximale demandée par l'utilisateur).
// Les modèles flash sont des fallbacks si Pro est indisponible ou quota épuisé.
const NANO_BANANA_MODELS = [
  'nano-banana-pro-preview',
  'gemini-3-pro-image-preview',
  'gemini-3.1-flash-image-preview',
  'gemini-2.5-flash-image',
] as const

const STYLE_HINTS: Record<DesignStyle, string> = {
  corporate: 'Strict grid, modern sans-serif, muted 2-4 tone palette, clear hierarchy. B2B premium.',
  minimaliste: 'Vast white space, single saturated accent, thin typography, asymmetric-balanced layout.',
  bold: 'Dramatic split (55/45), condensed bold display type, hero bleeding off-canvas, dense price stack.',
  elegant: 'Fine display serifs, generous ratios, tone-on-tone palette, fine ornamentation, axial composition.',
  playful: 'Organic shapes mixed with type, decorative rotations, pop saturated solids, joyful density.',
  retro: 'Vintage palette (burnt orange/cream/khaki), old display typefaces, dot screens, bordered frames.',
}

function buildPrompt(args: GenerateNanoBananaRefArgs): string {
  const formatRatio = (args.widthMm / args.heightMm).toFixed(2)
  const paletteLine = args.palette && args.palette.length > 0
    ? `Color palette (use EXCLUSIVELY): ${args.palette.join(', ')}`
    : `Color palette: coherent with ${args.style} style, 3-5 colors max`

  return [
    `Generate an AMBIENT BACKGROUND SCENE for a retail flyer — NOT a product shot. The actual product photograph will be composited on top of your image in a later editing step. Your job is to create the SETTING / ENVIRONMENT only.`,
    `CONTEXT (for ambient mood only — DO NOT depict the actual product, do not spell anything): ${args.userPrompt}`,
    `STYLE: ${args.style} — ${STYLE_HINTS[args.style]}`,
    `${paletteLine}`,
    `ABSOLUTE REQUIREMENTS — STRICTLY ENFORCED:
- DO NOT depict the product itself. No invented product, no stand-in object, no "similar-looking" item. The real product photo will be added on top later.
- ZERO TEXT in the image. No typography, no letters, no numbers, no symbols, no characters from any language.
- NO PRICE TAGS, NO BADGES, NO LABELS, NO STICKERS, NO LOGOS, NO BRAND NAMES, NO WATERMARKS.
- NO callouts, NO annotations, NO captions, NO speech bubbles.
- The image must be 100% TEXT-FREE and 100% PRODUCT-FREE.`,
    `COMPOSITION:
- Show only the AMBIENT ENVIRONMENT or SETTING that's appropriate for the product context. Examples: a manicured garden lawn (for outdoor tools), a modern kitchen counter (for cookware), a workshop background (for tools), a clean minimal studio gradient (universal fallback).
- Lifestyle photography mood: soft natural lighting, cinematic shallow depth-of-field, professional retouching, ambient gradients.
- Leave the LOWER-RIGHT or RIGHT THIRD as relatively clean space (slightly out of focus, soft gradient) so the product photo can be cleanly composited on top there.
- Leave the LEFT SIDE with a calm, slightly out-of-focus area so text overlays (title, features, price) read clearly.
- Use ambient elements (gradients, depth-of-field blur, environmental textures) — never depict the actual product.`,
    `DIMENSIONS: ${args.widthMm}mm × ${args.heightMm}mm (ratio ${formatRatio}:1).`,
    `OUTPUT: a single high-quality, text-free, product-free ambient background scene, ready to receive a product photo and typography in post-production.`,
  ].join('\n\n')
}

function pickAspectRatio(widthMm: number, heightMm: number): string {
  // Professonal retail standard ratios ONLY (avoid extreme panoramic formats)
  const ratios: Array<{ r: number; label: string }> = [
    { r: 3 / 4, label: '3:4' },     // Vertical
    { r: 9 / 16, label: '9:16' },   // Vertical
    { r: 1, label: '1:1' },         // Square
    { r: 4 / 3, label: '4:3' },     // Landscape (standard)
    { r: 3 / 2, label: '3:2' },     // Landscape (standard)
    { r: 16 / 9, label: '16:9' },   // Landscape (widescreen, NOT extreme)
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

export async function generateNanoBananaRef(
  args: GenerateNanoBananaRefArgs,
): Promise<NanoBananaRefResult> {
  const apiKey = getApiKey('gemini')
  if (!apiKey) return { ok: false, error: 'Clé API Gemini absente' }

  const aspectRatio = pickAspectRatio(args.widthMm, args.heightMm)
  const prompt = buildPrompt(args)

  const requestBody = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: {
      responseModalities: ['TEXT', 'IMAGE'],
      imageConfig: { aspectRatio, imageSize: '1K' },
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
      const inlineV1 = (part as { inline_data?: { mime_type?: string; data?: string } }).inline_data
      const inlineV2 = (part as { inlineData?: { mimeType?: string; data?: string } }).inlineData
      const inline = inlineV1 ?? inlineV2
      const mimeType = inlineV1?.mime_type ?? inlineV2?.mimeType
      const b64 = inline?.data
      if (mimeType?.startsWith('image/') && b64) {
        console.log(`[generateNanoBananaRef] Generated: ${Math.round(b64.length / 1024 / 1024)}MB`)
        return { ok: true, dataUri: `data:${mimeType};base64,${b64}` }
      }
    }

    lastError = 'Aucune image dans la réponse'
  }

  return { ok: false, error: lastError.slice(0, 200) || 'Tous les modèles Nano Banana ont échoué' }
}
