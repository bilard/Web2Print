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

// Lookup des grandes enseignes retail françaises : convertit le brandDomain
// (= site qui PUBLIE le flyer) en nom de marque lisible pour NB2. Le user de
// Web2Print attend le LOGO DU DISTRIBUTEUR en haut du flyer (pas la marque
// fabricant du produit).
const KNOWN_DISTRIBUTOR_NAMES: Record<string, string> = {
  'bricodepot.fr': 'BRICO DÉPÔT',
  'castorama.fr': 'CASTORAMA',
  'leroymerlin.fr': 'LEROY MERLIN',
  'mr-bricolage.fr': 'MR.BRICOLAGE',
  'jardiland.com': 'JARDILAND',
  'truffaut.com': 'TRUFFAUT',
  'gammvert.fr': 'GAMM VERT',
  'amazon.fr': 'AMAZON',
  'darty.com': 'DARTY',
  'fnac.com': 'FNAC',
  'boulanger.com': 'BOULANGER',
  'cdiscount.com': 'CDISCOUNT',
  'decathlon.fr': 'DECATHLON',
  'auchan.fr': 'AUCHAN',
  'carrefour.fr': 'CARREFOUR',
}

function distributorNameFromDomain(domain: string | undefined): string | null {
  if (!domain) return null
  const key = domain.toLowerCase().trim()
  if (KNOWN_DISTRIBUTOR_NAMES[key]) return KNOWN_DISTRIBUTOR_NAMES[key]
  // Fallback : nom de domaine title-case sans extension
  const stem = key.replace(/^www\./, '').replace(/\.[a-z]{2,4}(?:\.[a-z]{2,4})?$/, '')
  if (!stem) return null
  return stem
    .split(/[-.]/)
    .filter(Boolean)
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join(' ')
    .toUpperCase()
}

function buildPrompt(args: GenerateNanoBananaRefArgs): string {
  const formatRatio = (args.widthMm / args.heightMm).toFixed(2)
  const paletteLine = args.palette && args.palette.length > 0
    ? `Color palette (use EXCLUSIVELY): ${args.palette.join(', ')}`
    : `Color palette: coherent with ${args.style} style, 3-5 colors max`

  // Distributeur (= retailer qui publie le flyer) déduit du brandDomain.
  // C'est le LOGO PRIMAIRE en haut du flyer (Brico Dépôt, Castorama, etc.).
  // La marque fabricant (data.brand = Sunseeker, Parkside, etc.) reste
  // SECONDAIRE — visible sur le produit lui-même mais PAS comme logo du flyer.
  const distributor = distributorNameFromDomain(args.scrapedData?.brandDomain)

  // Si on a des données scrapées Jina, on les injecte EXACTEMENT dans le prompt
  // pour que NB2 rende les vraies valeurs (titre, prix, features) au lieu
  // d'halluciner. Si pas de scrapedData, le brief utilisateur libre fait foi.
  const productDataBlock = args.scrapedData ? buildProductDataBlock(args.scrapedData, distributor) : ''

  return [
    `Create a COMPLETE, READY-TO-PRINT RETAIL PROMOTIONAL FLYER for a French retailer. The image you generate IS the final deliverable — render every element (typography, hero photo, badges, prices, CTAs) directly inside the image, press-quality.`,
    productDataBlock || `BRIEF: ${args.userPrompt}`,
    `VISUAL REFERENCE STYLE — produce a flyer in the same caliber as a real Brico Dépôt / Castorama / Leroy Merlin retail print:
- Bold red banner header at the very top with the DISTRIBUTOR logo (large, sharp, fully visible) on the left and a punchy promo tagline on the right.
- Hero zone : large product photograph dominating the upper-right, sitting on a manicured lawn / interior context (use the attached reference image as the EXACT source of product appearance — match its color, materials, branding marks pixel-faithfully).
- Left column under header : product title (BOLD, ALL CAPS, dark, on a black tag block), a few short technical specs.
- Bold red price block (or yellow-on-red pill) for the headline price — large numerals, "PRIX DÉPÔT" / "PRIX CHOC" / similar retail tag.
- Optional financing pill ("Payez en 4X"), warranty pill ("GARANTIE 3 ANS").
- Grid of 4-6 feature icons in circular badges (filled black or filled brand-color) with short heading + 2-line description below each.
- Footer : red bandeau with 3-4 quick benefit pills and small legal mentions.`,
    `STYLE: ${args.style} — ${STYLE_HINTS[args.style]}`,
    `${paletteLine}`,
    `CRITICAL RULES — STRICTLY ENFORCED:
- DISTRIBUTOR LOGO TOP-LEFT : render the retailer name "${distributor ?? '[DISTRIBUTOR]'}" as the dominant logo. Do NOT use the manufacturer brand (${args.scrapedData?.brand ?? 'unknown'}) as the main flyer logo — that's the product's brand, not the seller's brand.
- Render ALL TEXTUAL ELEMENTS sharply legible — NO blur on logo or text, NO ellipsis, NO partial letters, NO low-resolution rasterization.
- Use the EXACT TITLE, PRICE, FEATURES from the PRODUCT DATA block above. Do NOT rephrase, do NOT shorten, do NOT add fictional discounts or invented numbers. If no oldPrice is in the data block, do NOT show any strikethrough price.
- Product photograph fidelity is non-negotiable: copy shape, color, branding marks, wheels, sensors from the attached reference image. Do NOT invent a different-looking product.
- Spacing : generous, grid-based, NO chaotic placement, NO overlapping text, NO elements running off-canvas.
- ZERO parasitic elements: no random "10€ OFFERTS" stickers, no extra promotional badges that aren't in the data block, no markdown syntax (### or [Image: ...]).`,
    `DIMENSIONS: ${args.widthMm}mm × ${args.heightMm}mm (ratio ${formatRatio}:1).`,
    `OUTPUT: A single, complete, ready-to-print French retail flyer image. Press-quality. Distributor logo dominant top-left. Product photo faithful to attached reference. Real prices from data block. NO artifacts.`,
  ].filter(Boolean).join('\n\n')
}

function buildProductDataBlock(data: ScrapedProductData, distributor: string | null): string {
  const lines: string[] = ['PRODUCT DATA — RENDER EXACTLY THESE VALUES (do not invent, do not rephrase) :']
  if (distributor) {
    lines.push(`- DISTRIBUTOR (retailer publishing the flyer — render its name as the LOGO TOP-LEFT, dominant) : ${distributor}`)
  }
  if (data.brand) {
    lines.push(`- Manufacturer brand (the product's maker — secondary, only visible on the product itself, NOT the flyer's main logo) : ${data.brand}`)
  }
  if (data.title) lines.push(`- Product title (render verbatim, full string, no truncation): "${data.title}"`)
  if (data.price) {
    lines.push(`- Current price (render LARGE on a red or black price block): ${data.price}`)
  }
  if (data.oldPrice) {
    lines.push(`- Old price (render strikethrough, small, grey, ABOVE current price): ${data.oldPrice}`)
  } else {
    lines.push(`- Old price : NONE — DO NOT render any strikethrough/old/crossed-out price. The current price stands alone.`)
  }
  if (data.features && data.features.length > 0) {
    lines.push(`- Features (render as a 4-6 icon grid OR a bullet list with ✓ marks, EXACTLY these items, no rephrasing) :`)
    for (const f of data.features.slice(0, 6)) lines.push(`    • ${f}`)
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
