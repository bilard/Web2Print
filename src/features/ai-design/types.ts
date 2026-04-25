import { DEFAULT_FORMAT_ID } from '@/features/print/PRINT_FORMATS'

export type DesignStyle = 'corporate' | 'minimaliste' | 'bold' | 'elegant' | 'playful' | 'retro'

export interface DesignRequest {
  prompt: string
  formatId: string          // id d'un PRINT_FORMAT, ou 'custom'
  customWidthMm?: number    // si formatId === 'custom'
  customHeightMm?: number
  style: DesignStyle
  includeBleed: boolean
  palette?: string[]        // hex codes optionnels imposés par l'utilisateur
  productImageUrl?: string
  productName?: string
  siteLogoUrl?: string
  siteUrl?: string
  brandGuideUrl?: string
}

export interface DesignResult {
  widthMm: number
  heightMm: number
  bleedMm: number
  rationale: string
}

/**
 * Persisted state of the Claude Design form. Stored on
 * `projects/{projectId}.claudeDesignBrief` as a JSON string.
 */
export interface DesignBriefState {
  prompt: string
  formatId: string
  customWidthMm?: number
  customHeightMm?: number
  style: DesignStyle
  includeBleed: boolean
  /** Raw text of the palette input — NOT parsed. Validation happens at submit time. */
  paletteText: string
  updatedAt: number
  promptOptimized?: string // Optimized version of the prompt
  productImageUrl?: string
  siteLogoUrl?: string
  siteUrl?: string
  brandGuideUrl?: string
}

export const DEFAULT_DESIGN_BRIEF: DesignBriefState = {
  prompt: '',
  formatId: DEFAULT_FORMAT_ID,
  customWidthMm: undefined,
  customHeightMm: undefined,
  style: 'corporate',
  includeBleed: false,
  paletteText: '',
  updatedAt: 0,
  promptOptimized: '',
  productImageUrl: '',
  siteLogoUrl: '',
  siteUrl: '',
  brandGuideUrl: '',
}
