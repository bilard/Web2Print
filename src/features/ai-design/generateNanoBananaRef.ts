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
import type { ScrapedProductData } from './scrapeProductForDesign'

interface GenerateNanoBananaRefArgs {
  userPrompt: string
  widthMm: number
  heightMm: number
  style: DesignStyle
  dpi: number
  palette?: string[]
  /** Données produit scrapées Jina — injectées dans le prompt pour que NB2
   *  rende les VRAIES valeurs (titre, prix, features, marque) plutôt que
   *  d'halluciner. Si absent, NB2 invente librement. */
  scrapedData?: ScrapedProductData
  /** URL de l'image produit packshot — Nano Banana Pro/3 supporte
   *  l'attachment d'images sources (REFERENCE_IMAGE) pour préserver la
   *  ressemblance visuelle exacte du produit. */
  productImageUrl?: string
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

  // Si on a des données scrapées Jina, on les injecte EXACTEMENT dans le prompt
  // pour que NB2 rende les vraies valeurs (titre, prix, features, marque) au
  // lieu d'halluciner. Si pas de scrapedData, le brief utilisateur libre fait
  // foi.
  const productDataBlock = args.scrapedData ? buildProductDataBlock(args.scrapedData) : ''

  return [
    `Create a COMPLETE, READY-TO-PRINT RETAIL PROMOTIONAL FLYER. The image you generate IS the final design — it will be placed full-canvas as the deliverable. Render every element of the flyer (typography, photo, badges, prices, CTA) directly inside the image.`,
    productDataBlock || `BRIEF: ${args.userPrompt}`,
    `LAYOUT (FLEXIBLE 60/40 SPLIT — adapt to format):
LEFT SECTION (~55-65%): TEXT & BRAND
  - TOP-LEFT: Brand logo (crisp, fully visible — NOT cropped, NOT blurred)
  - TOP-RIGHT (next to logo): green pill "OFFRE EXCLUSIVE"
  - UPPER: Product title (bold, large, dark, complete — NO truncation, NO ellipsis)
  - MIDDLE: Bullet features (3-5 items, each with a green filled circle containing a white ✓, then the feature text)
  - BOTTOM: Price block — old price strikethrough (small grey) above NEW PRICE in large white-on-black; followed by green pill CTA "J'EN PROFITE"

RIGHT SECTION (~35-45%): PRODUCT PHOTO
  - The product centered, sharp, professionally lit, full visibility, no cropping, no decorations.`,
    `STYLE: ${args.style} — ${STYLE_HINTS[args.style]}`,
    `${paletteLine}`,
    `CRITICAL RULES — STRICTLY ENFORCED:
- Render ALL TEXTUAL ELEMENTS sharply legible — NO blur on logo or text, NO ellipsis, NO partial letters, NO low-resolution.
- Use the EXACT TITLE, PRICE, FEATURES from the PRODUCT DATA block above. Do NOT rephrase, do NOT shorten, do NOT add fictional discounts or numbers.
- Logo top-left — pristine, fully visible, sharp.
- Product photo — accurate to the real product (use the reference image as the source of truth for shape, color, materials, branding details).
- Spacing — generous and balanced. NO chaotic placement, NO elements running off-canvas.
- ZERO parasitic elements: no random "10€ OFFERTS" stickers, no extra promotional badges beyond OFFRE EXCLUSIVE, no overlapping text.`,
    `DIMENSIONS: ${args.widthMm}mm × ${args.heightMm}mm (ratio ${formatRatio}:1).`,
    `OUTPUT: A single, complete, ready-to-print retail flyer image. Press-quality. Every element in its right place. NO artifacts.`,
  ].filter(Boolean).join('\n\n')
}

function buildProductDataBlock(data: ScrapedProductData): string {
  const lines: string[] = ['PRODUCT DATA — RENDER EXACTLY THESE VALUES (do not invent, do not rephrase) :']
  if (data.brand) lines.push(`- Brand (logo to render top-left): ${data.brand}`)
  if (data.title) lines.push(`- Product title (render verbatim, full string, no truncation): "${data.title}"`)
  if (data.price) lines.push(`- Current price (render large white-on-black): ${data.price}`)
  if (data.oldPrice) lines.push(`- Old price (render strikethrough, small, grey): ${data.oldPrice}`)
  if (data.features && data.features.length > 0) {
    lines.push(`- Features (render as bullet list with green ✓ marks, EXACTLY these items, no rephrasing) :`)
    for (const f of data.features.slice(0, 5)) lines.push(`    • ${f}`)
  }
  if (data.rating) {
    const reviewSuffix = data.reviewCount ? ` · ${data.reviewCount} avis` : ''
    lines.push(`- Rating (render as ★★★★☆ visual stars + text): ${data.rating}/5${reviewSuffix}`)
  }
  return lines.join('\n')
}

/**
 * Télécharge l'image produit (via le proxy local pour CORS) et la convertit
 * en inline_data part pour l'API Nano Banana. Renvoie [] si pas d'URL ou en
 * cas d'échec — le prompt seul fait foi.
 */
async function fetchProductImagePart(
  productImageUrl: string | undefined,
): Promise<Array<{ inline_data: { mime_type: string; data: string } }>> {
  if (!productImageUrl) return []
  try {
    const proxied = productImageUrl.startsWith('http')
      ? `/api/image-proxy?url=${encodeURIComponent(productImageUrl)}`
      : productImageUrl
    const res = await fetch(proxied)
    if (!res.ok) {
      console.warn('[generateNanoBananaRef] productImageUrl fetch failed:', res.status)
      return []
    }
    const buf = await res.arrayBuffer()
    const mimeType = res.headers.get('content-type') || 'image/jpeg'
    if (!mimeType.startsWith('image/')) return []
    // Base64 encode
    const bytes = new Uint8Array(buf)
    let binary = ''
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])
    const data = btoa(binary)
    console.log(`[generateNanoBananaRef] Attached product reference image: ${Math.round(buf.byteLength / 1024)}KB ${mimeType}`)
    return [{ inline_data: { mime_type: mimeType, data } }]
  } catch (err) {
    console.warn('[generateNanoBananaRef] productImageUrl fetch error:', err)
    return []
  }
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

  // Nano Banana Pro supporte les images de référence en input multipart pour
  // préserver la ressemblance produit. On télécharge l'image (via le proxy
  // pour gérer les CDN sans CORS) et l'attache en inline_data.
  const imageParts = await fetchProductImagePart(args.productImageUrl)

  const requestBody = {
    contents: [{
      parts: [
        ...imageParts,
        { text: prompt },
      ],
    }],
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
