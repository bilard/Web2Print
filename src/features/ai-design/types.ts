export type DesignStyle = 'corporate' | 'minimaliste' | 'bold' | 'elegant' | 'playful' | 'retro'

export interface DesignRequest {
  prompt: string
  formatId: string          // id d'un PRINT_FORMAT, ou 'custom'
  customWidthMm?: number    // si formatId === 'custom'
  customHeightMm?: number
  style: DesignStyle
  includeBleed: boolean
  palette?: string[]        // hex codes optionnels imposés par l'utilisateur
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
