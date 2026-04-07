import type { Brief, CartItem } from '@/features/briefs/types'

function readString(values: Record<string, unknown>, key: string): string | undefined {
  const v = values[key]
  return typeof v === 'string' && v.trim() ? v.trim() : undefined
}

function brandPalette(values: Record<string, unknown>): string {
  const primary = readString(values, 'primaryColor')
  const secondary = readString(values, 'secondaryColor')
  if (primary && secondary) return `Brand palette accents: ${primary} and ${secondary}.`
  if (primary) return `Brand accent color: ${primary}.`
  return ''
}

function sectorPhrase(values: Record<string, unknown>): string {
  const sector = readString(values, 'sector')
  if (!sector) return 'a generic commercial environment'
  return `a ${sector.toLowerCase()} environment`
}

const NEGATIVE = 'No text, no logo, no watermark, no people staring at camera.'

/**
 * Construit un prompt anglais déterministe pour le visuel hero d'un brief.
 */
export function buildHeroImagePrompt(brief: Brief): string {
  const v = brief.client.values
  const company = readString(v, 'companyName') ?? 'a company'
  const palette = brandPalette(v)
  const env = sectorPhrase(v)
  return `Photorealistic wide-angle hero image for a commercial proposal addressed to ${company}, set in ${env}. Cinematic lighting, shallow depth of field, premium feeling. ${palette} ${NEGATIVE}`.trim()
}

/**
 * Construit un prompt anglais déterministe pour mettre en scène un produit du panier.
 */
export function buildProductImagePrompt(brief: Brief, item: CartItem): string {
  const v = brief.client.values
  const env = sectorPhrase(v)
  const palette = brandPalette(v)
  const desc = item.description ? ` Product details: ${item.description}.` : ''
  return `Photorealistic product staging of "${item.name}" placed in ${env}. Soft natural lighting, marketing-grade composition.${desc} ${palette} ${NEGATIVE}`.trim()
}
