/**
 * Analyse une image de design via Claude Vision pour extraire les détails complets.
 * Retourne une analyse structurée : layout, typography, colors, elements, structure.
 */

import { getApiKey } from '@/lib/apiKeys'

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
 * Analyse une image de design via Claude Vision API.
 * Extrait layout, typography, colors, éléments et structure pour générer un SVG fidèle.
 */
export async function analyzeDesignImage(imageBase64: string): Promise<DesignAnalysis> {
  const apiKey = getApiKey('anthropic')
  if (!apiKey) {
    throw new Error('Anthropic API key missing')
  }

  // Déterminer le media type
  const mediaType = imageBase64.startsWith('/9j/') ? 'image/jpeg' : 'image/png'

  const requestBody = {
    model: 'claude-3-5-sonnet-20241022',
    max_tokens: 2000,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'image',
            source: {
              type: 'base64',
              media_type: mediaType,
              data: imageBase64,
            },
          },
          {
            type: 'text',
            text: `Analyse cette image de design en EXTRÊME détail pour créer un SVG 100% fidèle.

Fournis une réponse JSON VALIDE STRICTE avec SEULEMENT ces 5 clés top-level:

{
  "layout": {
    "width": 210,
    "height": 297,
    "safeArea": {"x": 0, "y": 0, "w": 100, "h": 100},
    "zones": [
      {"id": "string", "name": "string", "bbox": {"x": number, "y": number, "w": number, "h": number}, "content": "string"}
    ]
  },
  "typography": [
    {"elementId": "string", "text": "string", "fontFamily": "string", "fontSize": number, "fontWeight": number, "color": "#RRGGBB", "align": "left|center|right"}
  ],
  "colors": {
    "primary": "#RRGGBB",
    "secondary": "#RRGGBB",
    "text": "#RRGGBB",
    "background": "#RRGGBB",
    "accent": "#RRGGBB"
  },
  "elements": [
    {"id": "string", "type": "logo|image|icon|shape|text|box", "bbox": {"x": number, "y": number, "w": number, "h": number}, "properties": {}}
  ],
  "structure": "Description du layout général"
}

RÈGLES:
- Coordonnées en pourcentages (0-100)
- Couleurs SEULEMENT en #RRGGBB
- FontSize en points
- FontWeight: 400, 600, 700, 800
- Extraire le texte EXACT visible
- Identifier zones principales
- JSON VALIDE SEULEMENT, pas de narration avant/après`,
          },
        ],
      },
    ],
  }

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify(requestBody),
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`Claude Vision API error: ${error}`)
  }

  const data = (await response.json()) as {
    content?: Array<{ type: string; text?: string }>
  }

  const textContent = data.content?.find((c) => c.type === 'text')?.text
  if (!textContent) {
    throw new Error('No text response from Claude Vision')
  }

  // Extract JSON from response
  const jsonMatch = textContent.match(/\{[\s\S]*\}/)
  if (!jsonMatch) {
    throw new Error('Failed to extract JSON from Claude Vision response')
  }

  const analysis = JSON.parse(jsonMatch[0]) as DesignAnalysis
  console.log('[analyzeDesignImage] Analysis complete:', analysis)
  return analysis
}
