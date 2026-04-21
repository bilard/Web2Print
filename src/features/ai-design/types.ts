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
}

export interface ImageSlot {
  id: string
  role: string             // 'hero' | 'background' | 'product' …
  promptSuggestion: string // ce que l'utilisateur peut envoyer à Nano Banana plus tard
}

export interface DesignResult {
  svg: string              // SVG complet, viewBox en unités internes du design
  widthMm: number          // largeur fini
  heightMm: number         // hauteur finie
  bleedMm: number          // 0 si pas demandé
  palette: string[]        // palette effectivement utilisée
  fontsUsed: string[]      // liste des font-family référencées
  slots: ImageSlot[]       // slots image détectés, à remplir via DAM/Nano Banana
  rationale: string        // courte note explicative du LLM sur les choix de design
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
}

export const DEFAULT_DESIGN_BRIEF: DesignBriefState = {
  prompt: '',
  formatId: DEFAULT_FORMAT_ID,
  customWidthMm: undefined,
  customHeightMm: undefined,
  style: 'corporate',
  includeBleed: true,
  paletteText: '',
  updatedAt: 0,
  promptOptimized: '',
  productImageUrl: '',
}
