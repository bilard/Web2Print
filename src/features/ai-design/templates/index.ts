/**
 * Registry de templates. Point d'entrée public du module templates.
 */

import type { Template } from './types'
import { retailProductPortrait } from './retail-product-portrait'
import { retailProductLandscape } from './retail-product-landscape'

const TEMPLATES: Template[] = [
  retailProductPortrait,
  retailProductLandscape,
]

export function listTemplates(): Template[] {
  return TEMPLATES
}

export function getTemplate(id: string): Template | null {
  return TEMPLATES.find((t) => t.id === id) ?? null
}

/**
 * Heuristique de sélection par défaut quand le LLM ne spécifie pas ou qu'un
 * fallback est nécessaire. Portrait si h ≥ w, landscape sinon.
 */
export function pickTemplateByAspect(widthMm: number, heightMm: number): Template {
  const wantPortrait = heightMm >= widthMm
  const candidate = TEMPLATES.find((t) =>
    wantPortrait ? t.aspectRatio === 'portrait' : t.aspectRatio === 'landscape'
  )
  return candidate ?? TEMPLATES[0]
}

export type { Template } from './types'
export type {
  NormalizedBbox,
  TextSlot,
  ImageSlot,
  FeatureListSlot,
  FeatureItemSlot,
  Palette,
  ColorRef,
} from './types'
