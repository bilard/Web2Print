/**
 * Décompose une image Nano Banana en éléments vectoriels complets via Claude Vision.
 *
 * Contrairement à une simple extraction "texte + zones image", on demande à Claude
 * de reconstruire 100% du design en primitives vectorielles : fond (couleur ou
 * gradient), formes décoratives (rects, cercles, ellipses, paths SVG), textes
 * éditables et zones image remplaçables.
 *
 * L'image Nano Banana originale n'est JAMAIS posée sur le canvas. Elle sert
 * uniquement de cible visuelle pour Claude Vision.
 */

import { getApiKey } from '@/lib/apiKeys'

export interface TextElement {
  id: string
  text: string
  /** Position et taille en POURCENTAGES (0-100) du canvas */
  bbox: { x: number; y: number; w: number; h: number }
  /** Taille de police en % de la hauteur du canvas (ex: 6 = 6% de canvasHeight) */
  fontSizePct: number
  /** Nom exact d'une famille Google Fonts (ex: "Montserrat", "Oswald", "Inter") */
  fontFamily: string
  /** Couleur du texte (hex) */
  color: string
  /** Gras ou normal */
  bold: boolean
  /** Italique */
  italic?: boolean
  /** Barré (pour les prix d'origine barrés) */
  strikethrough?: boolean
  /** Alignement dans la bbox */
  align: 'left' | 'center' | 'right'
}

export type ImageSlotRole = 'logo' | 'productPhoto' | 'badge' | 'other'

export interface ImageSlot {
  id: string
  /** Rôle du slot : permet d'injecter le bon asset scrapé */
  role: ImageSlotRole
  bbox: { x: number; y: number; w: number; h: number }
  description: string
}

export interface BackgroundDef {
  type: 'solid' | 'linearGradient' | 'radialGradient'
  /** Couleur hex pour type='solid' */
  color?: string
  /** Stops pour les gradients */
  stops?: Array<{ offset: number; color: string }>
  /** Angle en degrés pour linearGradient (0 = horizontal gauche→droite, 90 = vertical haut→bas) */
  angle?: number
}

export type DecorativeShapeType = 'rect' | 'circle' | 'ellipse' | 'path'

export interface DecorativeShape {
  id: string
  type: DecorativeShapeType
  /** Position et taille de la bbox en % du canvas */
  bbox: { x: number; y: number; w: number; h: number }
  /** Données SVG "d=..." dans un espace normalisé 0-100 × 0-100 (requis pour type='path') */
  pathData?: string
  /** Rayon de coin en % du min(w,h) — uniquement pour type='rect' */
  rx?: number
  /** Couleur hex */
  fill: string
  /** Opacité 0-1 (défaut 1) */
  opacity?: number
}

export interface DesignAnalysis {
  background: BackgroundDef
  decorativeShapes: DecorativeShape[]
  texts: TextElement[]
  imageSlots: ImageSlot[]
}

const PROMPT = `Décompose cette image promotionnelle en éléments vectoriels SVG complets. Recrée 100% du design en vectoriel pur — l'image ne sera PAS placée en fond.

Retourne un JSON avec exactement 4 clés : background, decorativeShapes, texts, imageSlots.

## 1. background (objet)
Fond global du canvas :
- type : "solid" | "linearGradient" | "radialGradient"
- color : hex (pour solid)
- stops : [{offset: 0-1, color: hex}] (pour gradients)
- angle : degrés (pour linearGradient, 0=horizontal, 90=vertical)

## 2. decorativeShapes (tableau, ordre = z-order, premier = derrière)
Éléments visuels NON-photo et NON-texte :
- bandeaux colorés, boîtes de fond, cartouches arrondies
- cercles/ellipses/rectangles colorés (ex: cercles de pictos)
- courbes, vagues, blobs organiques
- pictos dessinables (batterie, cercle volume, jauge) en paths SVG
- badges promotionnels en pastille unie

Chaque shape :
- id : snake_case
- type : "rect" | "circle" | "ellipse" | "path"
- bbox : {x, y, w, h} en % du canvas
- pathData : SVG d-attribute dans un espace 0-100×0-100 (requis pour type="path")
- rx : rayon de coin en % du plus petit côté (optionnel, pour rect)
- fill : hex
- opacity : 0-1 (défaut 1)

## 3. texts (tableau) — TRÈS IMPORTANT
Chaque texte avec une taille/style cohérent = UN élément. Un texte multi-lignes de même taille = un seul élément.

- id : snake_case (ex: "title", "price_euros", "price_cents", "cta")
- text : contenu exact
- bbox : {x, y, w, h} en % — délimite précisément la zone où le texte s'affiche
- fontSizePct : taille de police en % de la hauteur du canvas, grille indicative :
  • Titre principal (headline) : 4-6
  • Sous-titre : 2.5-3.5
  • Feature heading bold : 2-2.8
  • Body text : 1.5-2
  • Petits labels (OFFRE LIMITÉE, LXT) : 1-1.4
  • Prix gros chiffres entiers : 5-8
  • Prix centimes (plus petits) : 2-3.5
  • CTA bouton : 2-2.8
- fontFamily : nom EXACT d'une famille Google Fonts (https://fonts.google.com). Choix selon le style :
  • Titres promo impact : "Oswald", "Bebas Neue", "Anton", "Montserrat" (bold)
  • Body / descriptions : "Inter", "Roboto", "Open Sans", "Montserrat"
  • Prix / chiffres : "Montserrat", "Roboto Condensed", "Oswald"
  • CTA bouton : "Montserrat", "Poppins", "Inter"
  • Élégant / luxe : "Playfair Display", "Cormorant Garamond"
  • Éditorial / serif : "Merriweather", "Lora"
  Utilise uniquement des noms existants sur fonts.google.com. Si doute : "Inter".
- color : hex
- bold : bool
- italic : bool
- strikethrough : true si le texte est barré (prix d'origine barré)
- align : "left" | "center" | "right"

RÈGLE PRIX — DÉCOMPOSE TOUJOURS :
Si un prix a des tailles typographiques différentes entre partie entière et centimes (ex: "88" gros puis ",99€" plus petit), CRÉE DEUX ÉLÉMENTS SÉPARÉS. Jamais un seul texte avec tailles mélangées.

Exemple prix (avec fontFamily) :
- {"id":"price_euros", "text":"88", "bbox":{"x":55,"y":60,"w":9,"h":7}, "fontSizePct":6, "fontFamily":"Montserrat", "color":"#ffffff", "bold":true, "italic":false, "strikethrough":false, "align":"left"}
- {"id":"price_cents", "text":",99€", "bbox":{"x":64,"y":61,"w":7,"h":4}, "fontSizePct":3, "fontFamily":"Montserrat", "color":"#ffffff", "bold":true, "italic":false, "strikethrough":false, "align":"left"}
- {"id":"price_old", "text":"90,99€", "bbox":{"x":74,"y":61,"w":9,"h":3.5}, "fontSizePct":2.5, "fontFamily":"Montserrat", "color":"#ffffff", "bold":false, "italic":false, "strikethrough":true, "align":"left"}

## 4. imageSlots (tableau) — zones PHOTOGRAPHIQUES remplaçables
STRATÉGIE:
- S'il existe une PHOTO DE PRODUIT CENTRAL/PRINCIPALE → créer UNE SEULE imageSlot pour elle (role="productPhoto")
- Cette bbox doit englober la photo entière + ses ombres/reflets
- Si le design contient d'AUTRES photos (logo séparé, badge, éléments additionnels) → créer des slots additionnels avec role="logo", "badge", "other"
- Ne fragmente JAMAIS une photo de produit en plusieurs slots (ex: ne pas séparer la poignée du corps du produit)

Ne confonds PAS une photo avec une forme dessinable. Si c'est une vraie photo (rendu réaliste) → imageSlot. Si c'est un picto simple (silhouette, icône monochrome) → decorativeShape.

Chaque slot :
- id : snake_case
- role : "logo" | "productPhoto" | "badge" | "other"
- bbox : {x, y, w, h} en % — ATTENTION à la précision, la photo sera recadrée à ces coordonnées
- description : courte (ex: "photo taille-haies RYOBI jaune-noir avec ombrage")

RÈGLE PRODUIT UNIQUE:
Si l'image contient une seule photo de produit dominant (type e-commerce, affiche promotionnelle), crée une SEULE imageSlot qui englobe le produit ENTIER, pas des zones fragmentées.

## Règles finales
- Réponds UNIQUEMENT en JSON, sans markdown ni narration
- N'OMETS aucun élément visuel (texte, photo, forme décorative)
- Sois précis sur les bbox — elles déterminent la position finale
- Ne double pas les éléments (un seul bandeau même si tu le vois sous deux angles)`

export async function analyzeDesignForEdit(imageBase64: string): Promise<DesignAnalysis> {
  const mediaType = imageBase64.startsWith('/9j/') ? 'image/jpeg' : 'image/png'

  const response = await fetch('/api/claude-vision', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'claude-opus-4-7',
      max_tokens: 8192,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: mediaType, data: imageBase64 } },
            { type: 'text', text: PROMPT },
          ],
        },
      ],
    }),
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`Claude Vision API error: ${error}`)
  }

  const data = (await response.json()) as { content?: Array<{ type: string; text?: string }> }
  const textContent = data.content?.find((c) => c.type === 'text')?.text
  if (!textContent) throw new Error('No text response from Claude Vision')

  let clean = textContent.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '')
  const start = clean.indexOf('{')
  const end = clean.lastIndexOf('}')
  if (start < 0 || end < 0) throw new Error('No JSON object in Claude Vision response')
  clean = clean.slice(start, end + 1)

  const parsed = JSON.parse(clean) as Partial<DesignAnalysis>
  const result: DesignAnalysis = {
    background: parsed.background ?? { type: 'solid', color: '#ffffff' },
    decorativeShapes: Array.isArray(parsed.decorativeShapes) ? parsed.decorativeShapes : [],
    texts: Array.isArray(parsed.texts) ? parsed.texts : [],
    imageSlots: Array.isArray(parsed.imageSlots) ? parsed.imageSlots : [],
  }

  return result
}
