/**
 * Analyse une image Nano Banana via Claude Vision pour extraire les détails de design.
 * Retourne une analyse structurée : layout, typography, colors, elements, structure.
 *
 * NOTE: Pour maintenant, cette fonction est STUBBED car elle requiert une API Vision call.
 * En production, intégrer avec l'API Claude appropriée.
 */

export interface DesignAnalysis {
  layout: {
    width: number
    height: number
    safeArea: { x: number; y: number; w: number; h: number }
    zones: Array<{
      id: string
      name: string
      bbox: { x: number; y: number; w: number; h: number }
      content: string
    }>
  }
  typography: Array<{
    elementId: string
    text: string
    fontFamily: string
    fontSize: number
    fontWeight: number
    color: string
    align: 'left' | 'center' | 'right'
  }>
  colors: {
    primary: string
    secondary: string
    text: string
    background: string
    accent: string
  }
  elements: Array<{
    id: string
    type: 'logo' | 'image' | 'icon' | 'shape' | 'text' | 'box'
    bbox: { x: number; y: number; w: number; h: number }
    properties: Record<string, unknown>
  }>
  structure: string
}

/**
 * Analyse une image via Claude Vision (implémentation future).
 * Pour l'instant, retourne une analyse par défaut.
 */
export async function analyzeDesignImage(imageBase64: string): Promise<DesignAnalysis> {
  // TODO: Intégrer avec Claude Vision API
  // Pour maintenant, retourne une structure par défaut qui peut être testée
  const analysis: DesignAnalysis = {
    layout: {
      width: 210,
      height: 297,
      safeArea: { x: 0, y: 0, w: 100, h: 100 },
      zones: [
        { id: 'header', name: 'Header', bbox: { x: 0, y: 0, w: 100, h: 20 }, content: 'Logo and title area' },
        { id: 'content', name: 'Content', bbox: { x: 0, y: 20, w: 100, h: 60 }, content: 'Main content area' },
        { id: 'footer', name: 'Footer', bbox: { x: 0, y: 80, w: 100, h: 20 }, content: 'Price and CTA' },
      ],
    },
    typography: [
      {
        elementId: 'title',
        text: 'Design Title',
        fontFamily: 'Oswald',
        fontSize: 36,
        fontWeight: 800,
        color: '#1A1A1A',
        align: 'left',
      },
    ],
    colors: {
      primary: '#2B5A66',
      secondary: '#E30613',
      text: '#1A1A1A',
      background: '#FFFFFF',
      accent: '#0A6E7C',
    },
    elements: [
      { id: 'logo', type: 'logo', bbox: { x: 4, y: 2, w: 16, h: 8 }, properties: {} },
      { id: 'hero', type: 'image', bbox: { x: 50, y: 10, w: 45, h: 70 }, properties: {} },
    ],
    structure: 'Header with logo, content with features on left and image on right, footer with price and CTA',
  }

  console.warn('[analyzeDesignImage] Vision API not yet implemented, returning default analysis')
  return analysis
}
