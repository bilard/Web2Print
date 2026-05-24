/**
 * Relecture des prix typographiques composés (ex : "9€59", "4€79") via Vision LLM.
 *
 * Vision OCR (Google) lit mal les prix Carrefour-style où le chiffre principal
 * est gros + "€" en exposant + décimales petites. Résultat typique :
 *  - "9€59" → "9999" (le € interprété comme chiffre)
 *  - "4€79" → "4" + "€" + "+79" (séparé en 3 et virgule lue comme +)
 *
 * Cette passe identifie les clusters de Textbox candidats prix (gros chiffre
 * Arial Black + Textbox adjacents "€" / fragments), crop l'image source à la
 * bbox unifiée du cluster, envoie à Gemini Vision avec un prompt minimal
 * "lis le prix exact". Remplace le gros chiffre du cluster par la valeur lue
 * et supprime les fragments.
 *
 * Coût : ~$0.001 par prix relu via Gemini 3 Pro Vision.
 */

import type { Textbox } from 'fabric'
import { z } from 'zod'
import { generateJson } from '@/features/ai/llmRouter'

const PriceSchema = z.object({
  price: z.string().describe('Le prix exact lu dans l\'image, format "X,YY €" ou "X €" si entier, vide si aucun prix.'),
})

const priceJsonSchema = {
  type: 'object',
  properties: {
    price: { type: 'string' },
  },
  required: ['price'],
} as const

const PRICE_PROMPT = `Tu vois l'image d'une étiquette de prix retail (typographie composée : chiffre gros + symbole € + décimales en exposant).

Retourne UNIQUEMENT le prix exact affiché, au format "X,YY €" (avec virgule comme séparateur décimal) ou "X €" pour un prix entier.

Exemples : "9,59 €", "4,79 €", "1,92 €", "14,38 €", "5 €".

Ne retourne RIEN d'autre — pas d'explication, pas de phrase. Juste le prix au bon format.`

/**
 * Appelle Gemini Vision pour lire UN prix sur une image cropée.
 * Retourne null si Vision n'a pas pu lire (réponse vide).
 */
export async function readPriceFromImage(dataUri: string): Promise<string | null> {
  try {
    const result = await generateJson({
      task: 'design.priceOCR',
      prompt: PRICE_PROMPT,
      schema: PriceSchema,
      schemaForLLM: priceJsonSchema,
      schemaForClaude: priceJsonSchema,
      version: 'price-ocr-v1',
      imageDataUris: [dataUri],
    })
    const trimmed = result.price.trim()
    return trimmed.length > 0 ? trimmed : null
  } catch (err) {
    console.warn('[refinePrices] readPriceFromImage failed:', err)
    return null
  }
}

export interface PriceParts {
  /** Partie entière (gros chiffre) — ex : "9", "14" */
  integer: string
  /** Décimales en indice — ex : "59", null si prix entier */
  decimals: string | null
  /** Symbole monétaire (exposant) — "€" par défaut */
  currency: string
}

/**
 * Décompose un prix lu ("9,59 €", "5 €", "2,56 €", "4,79") en parties pour le
 * rendu composé hypermarché : gros entier à gauche + petit bloc "€" empilé sur
 * les décimales à droite. Retourne null si la chaîne n'est pas un prix simple.
 */
export function parsePriceParts(price: string): PriceParts | null {
  const m = price.trim().match(/^(\d+)(?:[,.](\d+))?\s*(€)?$/)
  if (!m) return null
  return { integer: m[1], decimals: m[2] ?? null, currency: m[3] ?? '€' }
}

/**
 * Crop une zone de l'image source en data URI PNG (pour passer à Vision LLM).
 * Padding : 10% de la bbox de chaque côté pour donner du contexte à Vision.
 */
export function cropToDataUri(
  ctx: CanvasRenderingContext2D,
  box: { left: number; top: number; width: number; height: number },
  imgW: number,
  imgH: number,
): string | null {
  const padX = Math.max(10, Math.round(box.width * 0.1))
  const padY = Math.max(10, Math.round(box.height * 0.1))
  const cropX = Math.max(0, Math.round(box.left - padX))
  const cropY = Math.max(0, Math.round(box.top - padY))
  const cropW = Math.min(imgW - cropX, Math.round(box.width + padX * 2))
  const cropH = Math.min(imgH - cropY, Math.round(box.height + padY * 2))
  if (cropW <= 0 || cropH <= 0) return null

  const off = document.createElement('canvas')
  off.width = cropW
  off.height = cropH
  const offCtx = off.getContext('2d')
  if (!offCtx) return null
  try {
    const data = ctx.getImageData(cropX, cropY, cropW, cropH)
    offCtx.putImageData(data, 0, 0)
    return off.toDataURL('image/png')
  } catch (err) {
    console.warn('[refinePrices] crop failed:', err)
    return null
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Détection de clusters prix
// ─────────────────────────────────────────────────────────────────────────────

export interface PriceCandidate {
  /** Le Textbox "principal" du cluster (le gros chiffre qui restera après merge) */
  main: Textbox
  /** Les Textbox fragments à supprimer après merge (€, +79, etc.) */
  fragments: Textbox[]
  /** Bbox unifiée du cluster pour cropper l'image source */
  unifiedBbox: { left: number; top: number; width: number; height: number }
}

const isLikelyMainPrice = (tb: Textbox): boolean => {
  const text = tb.text ?? ''
  // Texte court (1-5 chars), uniquement chiffres / signes spéciaux, fontSize gros, ARIAL BLACK
  if (!/^[+\-]?\d{1,5}$/.test(text)) return false
  if ((tb.fontSize ?? 0) < 60) return false
  return true
}

const isLikelyFragment = (tb: Textbox): boolean => {
  const text = tb.text ?? ''
  // € seul, ou chiffres courts (1-3 chars éventuellement avec +/-)
  if (text === '€') return true
  if (/^[+\-]?\d{1,3}$/.test(text)) return true
  return false
}

const rectDistance = (a: { left: number; top: number; width: number; height: number }, b: typeof a): number => {
  const dx = Math.max(0, Math.max(a.left, b.left) - Math.min(a.left + a.width, b.left + b.width))
  const dy = Math.max(0, Math.max(a.top, b.top) - Math.min(a.top + a.height, b.top + b.height))
  return Math.max(dx, dy)
}

const tbBox = (tb: Textbox): { left: number; top: number; width: number; height: number } => ({
  left: tb.left ?? 0,
  top: tb.top ?? 0,
  width: (tb.width ?? 0),
  height: (tb.height ?? tb.fontSize ?? 20),
})

/**
 * Identifie les clusters prix : un Textbox "main" gros + les fragments adjacents
 * (€ et chiffres courts) dans un rayon de ~80 px.
 */
export function detectPriceClusters(textboxes: Textbox[]): PriceCandidate[] {
  const clusters: PriceCandidate[] = []
  const consumedFragments = new Set<Textbox>()

  for (const main of textboxes) {
    if (!isLikelyMainPrice(main)) continue
    if (consumedFragments.has(main)) continue
    const mainBox = tbBox(main)
    const fragments: Textbox[] = []
    let unifiedLeft = mainBox.left
    let unifiedTop = mainBox.top
    let unifiedRight = mainBox.left + mainBox.width
    let unifiedBottom = mainBox.top + mainBox.height
    for (const other of textboxes) {
      if (other === main) continue
      if (consumedFragments.has(other)) continue
      if (!isLikelyFragment(other)) continue
      const otherBox = tbBox(other)
      if (rectDistance(mainBox, otherBox) > 80) continue
      fragments.push(other)
      consumedFragments.add(other)
      unifiedLeft = Math.min(unifiedLeft, otherBox.left)
      unifiedTop = Math.min(unifiedTop, otherBox.top)
      unifiedRight = Math.max(unifiedRight, otherBox.left + otherBox.width)
      unifiedBottom = Math.max(unifiedBottom, otherBox.top + otherBox.height)
    }
    // Inclure le main même s'il n'a pas de fragments (cas "9999" tout seul)
    clusters.push({
      main,
      fragments,
      unifiedBbox: {
        left: unifiedLeft,
        top: unifiedTop,
        width: unifiedRight - unifiedLeft,
        height: unifiedBottom - unifiedTop,
      },
    })
  }

  return clusters
}
