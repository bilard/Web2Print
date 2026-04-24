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
    `MANDATORY LAYOUT (STRICT 60/40 SPLIT – NO EXCEPTIONS):
LEFT COLUMN: 0% to 60% of canvas width
  - Margin: 12% left, 6% right (internal), 12% top, 12% bottom
  - 12%: Logo (left, white background behind it if needed)
  - 18%: "OFFRE EXCLUSIVE" label (green box, white text, LEFT-aligned)
  - 30%: Product title (bold sans-serif, 5-6% fontsize, dark color, NO truncation)
  - 48%: Features (3-5 items, EACH item = green circle + text right-of-circle; text LARGE 2.5-3% fontsize, fully visible, 6% vertical gap between items)
  - 67%: Rating (stars ★★★★☆ + number + "X AVIS CLIENTS" in ONE line, centered, 2% fontsize)
  - 82%: PRICE SECTION (old price strikethrough, 2% fontsize; new price LARGE bold 6% fontsize in black box with white text; "J'EN PROFITE" button GREEN next to or below black box, right-aligned)
  - NO extra elements, NO percentages, NO page numbers, ZERO parasitic content

RIGHT COLUMN: 60% to 100% of canvas width
  - 10% margin from right edge (vertical center of right column)
  - Product photo: centered within 60-100% band, positioned 30%-70% vertically
  - ONLY product photo: no text, no overlays, no decorations
  - Sharp quality, fully visible product, professional product shot`,
    `CRITICAL PRECISION RULES:
- Canvas: 12% margin ALL edges, SAFE ZONE for text/logos only
- LEFT column: 0-60% width, NEVER extends beyond 60%
- RIGHT column: 60-100% width, NEVER extends before 60%
- ZERO overflow between columns, ZERO overlap
- FORBIDDEN ELEMENTS: NO percentages (like "25%"), NO page numbers, NO badges outside specified zones, NO decorative overlays, NO extra text, NO borders, NO shadows
- Feature items: circle diameter = 4-5% canvas height, text positioned RIGHT of circle, 2.5-3% fontsize
- Vertical spacing: minimum 6% gap between feature items, minimum 8% gaps before/after sections
- Product photo: SHARP, CLEAN, product fully visible, NO cropping, NO watermarks, centered in right column
- All text: dark color on light background, NO color overlays, NO transparency effects
- ZERO truncation: every word fully visible, no "..." ellipsis`,
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
