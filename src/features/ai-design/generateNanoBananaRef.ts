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

const NANO_BANANA_MODELS = [
  'gemini-3.1-flash-image-preview',
  'gemini-2.0-flash-exp',
  'gemini-2.5-flash-preview-image-generation',
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
    ? `- Color palette (use EXCLUSIVELY): ${args.palette.join(', ')}`
    : `- Color palette: coherent with ${args.style} style, 3-5 colors max`

  return [
    `Create a PROFESSIONAL RETAIL PROMOTIONAL BANNER — clean, organized, ready-to-print.`,
    `LAYOUT STRUCTURE (FLEXIBLE 60/40 SPLIT):
LEFT SECTION (approximately 55-65% width): TEXT & BRAND
  - TOP: Brand logo (crisp, fully visible) + "OFFRE EXCLUSIVE" green label
  - UPPER: Product title (bold, large, dark color, complete text, no truncation)
  - MIDDLE: Features (3-5 bullets with GREEN CIRCLES containing checkmarks INSIDE + descriptive text)
  - LOWER: Star rating (★★★★☆ + number + customer count, e.g., 4.3 · 128 AVIS CLIENTS)
  - BOTTOM: Price section (old price strikethrough + NEW PRICE large white-on-black + green "J'EN PROFITE" button)

RIGHT SECTION (approximately 35-45% width): PRODUCT PHOTO
  - Centered, high-quality professional product image
  - Vertically balanced on the page
  - NO text overlays, NO decorations`,
    `CRITICAL RULES:
- NO parasitic elements: NO discount percentages, NO page numbers, NO extra badges, NO artifacts
- Logo: FULLY VISIBLE, sharp, top-left positioning
- Product photo: SHARP, COMPLETE, no cropping
- Text: ALL LEGIBLE, FULLY VISIBLE, no truncation or ellipsis
- Spacing: GENEROUS, balanced, professional appearance
- Colors: ${args.style === 'corporate' ? 'muted 2-4 tone palette' : args.style === 'bold' ? 'dramatic split, contrasting' : 'coherent 3-5 colors'}${args.palette?.length ? ` — use ONLY: ${args.palette.join(', ')}` : ''}
- Layout: clean grid-based, LEFT text section + RIGHT product section, ZERO overlap`,
    `CONTENT:
- Logo: brand logo top-left corner, fully visible
- "OFFRE EXCLUSIVE": bright green banner or label, prominent positioning
- Title: large bold text, complete product name, dark color
- Features: 3-5 feature bullets, each with GREEN FILLED CIRCLE (contains checkmark ✓ INSIDE) + feature description text
- Rating: stars rendered visually (★★★★☆) with number rating + customer review count
- Price: Old price with strikethrough (smaller, gray) above or left of new price; new price LARGE bold (white text on BLACK background); "J'EN PROFITE" CTA button (green, prominent)
- Product image: professional quality, product fully visible and centered in right section`,
    `DESIGN QUALITY:
- Style: ${args.style} — ${STYLE_HINTS[args.style]}
${paletteLine}
- Typography: max 3 fonts, clear hierarchy, professional retail
- Spacing: generous, grid-based, no chaotic placement
- Alignment: perfect horizontal/vertical alignment
- Structure: LEFT text / RIGHT image. NO exceptions.`,
    `BRIEF: ${args.userPrompt}`,
    `DIMENSIONS: ${args.widthMm}mm × ${args.heightMm}mm (ratio ${formatRatio}:1)`,
    `OUTPUT: Professional, grid-based retail banner. All text fully visible. Perfect left-right balance. Press-ready, NO artifacts.`,
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
