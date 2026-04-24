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
    `Create a COMPLETE, ready-to-print retail banner with PIXEL-PERFECT GRID-BASED LAYOUT.`,
    `MANDATORY WIDTH CONSTRAINTS (STRICT 60/40 split):
LEFT COLUMN: 0% to 60% of canvas width (TEXT & INFO ONLY)
  - 12% margin-left from canvas edge
  - Top (12% from top): Brand logo (left-aligned) + "OFFRE EXCLUSIVE" label (right of logo or on separate row)
  - Upper-middle (35%): Product title (large, bold, dark color, condensed font)
  - Middle (52%): 3-5 feature bullets (green circle pictos with white checkmarks/symbols INSIDE, not next to text)
  - Lower-middle (68%): Customer rating (stars integrated with text, ex: "★★★★☆ (4.2/5) 128 AVIS")
  - Bottom (82%): PRICE SECTION: strikethrough old price + LARGE new price badge (black bg, white text) + CTA button (green, right-aligned within LEFT column)
  - All text ends at 58% canvas width (2% breathing room before RIGHT column starts)

RIGHT COLUMN: 60% to 100% of canvas width (PRODUCT PHOTO ONLY)
  - Vertical center: product image positioned 25% from top, extends to 75% from top
  - Horizontal: product CENTERED within 60-100% band (20% margin from 100% edge)
  - Product photo: SHARP, clean, professional quality
  - NO text, NO overlays inside RIGHT column`,
    `CRITICAL PRECISION RULES:
- Canvas has 12% margin on all edges (safe zone for text)
- LEFT column bounded STRICTLY at 60% horizontal
- RIGHT column bounded STRICTLY at 60% start
- ZERO pixel overflow between columns
- All vertical gaps: minimum 6% canvas-height
- Text hierarchy: title > features > rating > price
- Product photo: highest quality, product fully visible, no clipping
- ZERO truncation: all text ends with visible characters`,
    `CONTENT (render all as visible graphics):
- Brand logo: top-left corner, FULLY VISIBLE, crisp edges
- "OFFRE EXCLUSIVE": bright green label, center-aligned
- Title: large bold condensed sans-serif, dark color, no truncation
- Features: 3-5 bullets with GREEN FILLED CIRCLES (each circle contains white checkmark ✓ or star ★ INSIDE the circle, not beside it)
- Rating: stars visually rendered (★★★★☆) + rating number + customer count in same line
- Price section: Old price with strikethrough (dark gray, smaller) on first line; New price LARGE bold white text on BLACK badge; "J'EN PROFITE" CTA button GREEN with white text
- Product photo: professional quality, product centered and complete, no truncation`,
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
