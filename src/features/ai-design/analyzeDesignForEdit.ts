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

export type Bbox = { x: number; y: number; w: number; h: number }

export type TextRole =
  | 'price'
  | 'oldPrice'
  | 'title'
  | 'feature'
  | 'rating'
  | 'reviewCount'
  | 'badge'
  | 'cta'
  | 'other'

export interface TextElement {
  id: string
  text: string
  /** Position et taille en POURCENTAGES (0-100) du canvas */
  bbox: { x: number; y: number; w: number; h: number }
  /** Rôle data : sert au routing override + détection retail */
  role: TextRole
  /** Taille de police en % de la hauteur du canvas (ex: 6 = 6% de canvasHeight) */
  fontSizePct: number
  /** Nom exact d'une famille Google Fonts */
  fontFamily: string
  /** Couleur du texte (hex) */
  color: string
  bold: boolean
  italic?: boolean
  /** Barré (pour les prix d'origine barrés) */
  strikethrough?: boolean
  align: 'left' | 'center' | 'right'
  /** Couleur du fond local sous le texte (hex). Utilisée pour masquer le texte
   *  NB2 sous-jacent quand on overlay un Textbox éditable par-dessus. */
  backgroundColor: string
  /** false si le fond local est un gradient/photo/dégradé. Dans ce cas, le
   *  renderer fallback sur sample pixel client-side. */
  backgroundIsUniform: boolean
}

export type ImageSlotRole = 'logo' | 'productPhoto' | 'badge' | 'other'

export interface ImageSlot {
  id: string
  role: ImageSlotRole
  bbox: { x: number; y: number; w: number; h: number }
  description: string
  /** Couleur du fond local sous le slot (hex). Voir TextElement.backgroundColor. */
  backgroundColor: string
  backgroundIsUniform: boolean
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

export type DesignMode = 'retail' | 'creative'

export interface DesignAnalysis {
  /** Décide quel renderer utiliser. retail = NB2 lockée + overlays. creative = reconstruction vectorielle complète (ancien pipeline + fallback compose-direct). */
  mode: DesignMode
  texts: TextElement[]
  imageSlots: ImageSlot[]
  /** Présent uniquement si mode='creative'. Optionnel sinon. */
  background?: BackgroundDef
  /** Présent uniquement si mode='creative'. Optionnel sinon. */
  decorativeShapes?: DecorativeShape[]
}

const PROMPT = `Décompose cette image promotionnelle en éléments éditables (vectoriel + zones images).

## ÉTAPE 0 — DÉCISION DE MODE

Avant tout, décide si l'image est :
- "retail" : produit avec prix + titre + photo produit clairement identifiables (flyer commerce, promo, carte produit)
- "creative" : poster artistique, invitation, affiche événementielle, design typographique sans data produit explicite

Retourne \`mode\` dans ta réponse JSON.

## CONTRAT DE SORTIE

Si mode = "retail" :
  Retourne EXACTEMENT { mode, texts, imageSlots }. NE retourne PAS background NI decorativeShapes (ils ne sont pas utilisés).

Si mode = "creative" :
  Retourne EXACTEMENT { mode, background, decorativeShapes, texts, imageSlots }.

Dans les deux cas, chaque texte/slot doit inclure \`backgroundColor\` (couleur du fond local hex) + \`backgroundIsUniform\` (true si fond local plat, false si gradient/photo/dégradé).

RÈGLE PRIMAIRE: Ne vectorise que les formes géométriques simples. TOUTES les images, photos, logos, icônes complexes RESTENT comme zones images (imageSlots) — jamais vectorisées.

RECONNAISSANCE OBLIGATOIRE DE LOGOS ET PRODUITS:
- CHAQUE logo (marque, brand) = TOUJOURS imageSlot avec role="logo" (jamais vectoriel)
- CHAQUE produit photograph (même partiellement visible) = TOUJOURS imageSlot avec role="productPhoto"
- NE JAMAIS fusionner 2 imageSlots en 1 zone géante
- CHAQUE imageSlot DOIT avoir une bbox PRÉCISE et INDÉPENDANTE

**RÈGLE CRITIQUE — BBOX SERRÉES (TIGHT BOUNDING BOX):**
Les bboxes des imageSlots doivent englober UNIQUEMENT l'objet lui-même (le logo SANS espace autour, la photo du produit SANS fond ni textes adjacents).
- Si le logo fait 8% × 5%, la bbox doit être ~8% × 5%, PAS 20% × 15%
- Si la tondeuse occupe 25% × 40%, la bbox doit être ~25% × 40%, PAS 50% × 80%
- JAMAIS inclure du fond coloré, du texte, ou des éléments adjacents dans la bbox d'un imageSlot
- La bbox doit être le CONTOUR SERRÉ de l'objet visible, rien de plus

Retourne un JSON selon le contrat de sortie défini dans ÉTAPE 0 ci-dessus.

## 1. background (objet) — uniquement si mode='creative'
Fond global du canvas :
- type : "solid" | "linearGradient" | "radialGradient"
- color : hex (pour solid)
- stops : [{offset: 0-1, color: hex}] (pour gradients)
- angle : degrés (pour linearGradient, 0=horizontal, 90=vertical)

## 2. decorativeShapes (tableau, ordre = z-order, premier = derrière) — uniquement si mode='creative'
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

**RÈGLE TITRE — INVIOLABLE :**
Le titre principal du produit (la grosse phrase headline en haut, ex: "Robot tondeuse V3PLUS 1000m² 20V 4Ah coupe 18 cm Wi-Fi Bluetooth") = **UN SEUL texte unique**, JAMAIS fragmenté. Même s'il s'étale sur 2-4 lignes visuelles dans l'image, c'est UN seul élément "text" avec la phrase complète et une bbox englobante. Le retour à la ligne sera géré par Fabric Textbox automatiquement via la "width" de la bbox. Ne crée JAMAIS plusieurs textes pour des morceaux d'un même titre.

**RÈGLE COCHES/PUCES :**
Les coches "✓" / "✔" / picto check à côté de chaque feature ne sont PAS des paths SVG. Ce sont :
  - soit des "decorativeShape" de type "circle" (cercle de couleur)
  - soit incluses dans le "text" de la feature elle-même (préfixe "✓ Surface de tonte..." ou caractère unicode dans le texte)
  - JAMAIS un "path" avec pathData inventé (ça produit des triangles noirs aléatoires).
Si tu vois un cercle de couleur (vert/orange) avec un ✓ blanc dedans : crée UN "decorativeShape" type=circle pour le rond, puis UN "text" avec "✓" à côté ou par-dessus. Pas de path.

- id : snake_case (ex: "title", "price_euros", "price_cents", "cta")
- text : contenu exact
- bbox : {x, y, w, h} en % — délimite précisément la zone où le texte s'affiche
- role : "price" | "oldPrice" | "title" | "feature" | "rating" | "reviewCount" | "badge" | "cta" | "other"
  Choisis le rôle qui correspond le mieux. "title" pour le headline produit. "price" pour le prix gros chiffres. "oldPrice" pour le prix barré. "feature" pour les bullets. "rating" pour la note "4.3" ou "4.3/5". "reviewCount" pour "127 avis". "badge" pour "OFFRE EXCLUSIVE", "PROMO", etc. "cta" pour "J'EN PROFITE", "ACHETER", etc. "other" sinon.
- backgroundColor : couleur hex du fond local SOUS ce texte (échantillonne autour de la bbox, pas dedans).
- backgroundIsUniform : true si fond local plat (couleur unie), false si gradient, photo, ou dégradé visible.
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
STRATÉGIE STRICT – CHAQUE ÉLEMENT PHOTOGRAPHIQUE = IMAGESL INDÉPENDANT:

**RÈGLES ABSOLUES:**
- JAMAIS fusionner 2 logos/photos en une zone → chaque est indépendant
- Logo visible = imageSlot séparé avec role="logo" (bbox doit englober TOUT le logo)
- Produit visible = imageSlot séparé avec role="productPhoto" (bbox doit englober TOUT le produit)
- Badge/illustration = imageSlot séparé avec role="badge"

**TOUJOURS imageSlot (jamais vectoriel):**
- Photos de produits réalistes (même partiellement) → role="productPhoto"
- Logos marques (Jardiland, RYOBI, Bosch, Apple, etc.) → role="logo" SÉPARÉ
- Illustrations réalistes, rendus 3D, photos de badges → role="badge" ou "other"
- Icônes photo-réalistes avec gradients/ombres → role="other"

**UNIQUEMENT decorativeShape (vectoriel):**
- Formes GÉOMÉTRIQUES PURES: rectangles, cercles, carrés, ellipses (1-2 couleurs max)
- Silhouettes monochrome SIMPLES sans gradient: batterie, jauge, clé anglaise
- Bandeaux colorés arrière-plans, formes SVG dessinées

**EXEMPLE CORRECT - LOGO + PRODUCT:**
- Slot 1: logo Jardiland (role="logo", bbox x=0, y=0, w=15, h=8)
- Slot 2: tondeuse RYOBI (role="productPhoto", bbox x=60, y=20, w=30, h=60)
- JAMAIS une seule zone fusionnée contenant les 2

Chaque slot :
- id : snake_case
- role : "logo" | "productPhoto" | "badge" | "other"
- bbox : {x, y, w, h} en % — ATTENTION à la précision
- description : ex: "photo RYOBI tondeuse jaune-noir", "logo Jardiland orange"
- backgroundColor : couleur hex du fond local AUTOUR de l'imageSlot (pas dans la bbox).
- backgroundIsUniform : true si fond local plat, false sinon.

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

  // Mode obligatoire — défaut retail si absent (backward compat)
  const mode: DesignMode = parsed.mode === 'creative' ? 'creative' : 'retail'

  // Normalise texts : role défaut 'other', backgroundColor défaut '#ffffff',
  // backgroundIsUniform défaut false (force le futur fallback M2 sample-pixel
  // plutôt que de peindre un masque blanc à l'aveugle sur fond sombre/gradient)
  const texts: TextElement[] = (Array.isArray(parsed.texts) ? parsed.texts : []).map((t) => ({
    ...t,
    role: t.role ?? 'other',
    backgroundColor: t.backgroundColor ?? '#ffffff',
    backgroundIsUniform: t.backgroundIsUniform ?? false,
  })) as TextElement[]

  const imageSlots: ImageSlot[] = (Array.isArray(parsed.imageSlots) ? parsed.imageSlots : []).map((s) => ({
    ...s,
    role: s.role ?? 'other',
    backgroundColor: s.backgroundColor ?? '#ffffff',
    backgroundIsUniform: s.backgroundIsUniform ?? false,
  })) as ImageSlot[]

  const result: DesignAnalysis = {
    mode,
    texts,
    imageSlots,
  }

  if (mode === 'creative') {
    result.background = parsed.background
    result.decorativeShapes = Array.isArray(parsed.decorativeShapes) ? parsed.decorativeShapes : []
  }

  console.log('[analyzeDesignForEdit] Analysis complete:', {
    mode: result.mode,
    background: result.background,
    shapes: result.decorativeShapes?.length ?? 0,
    texts: result.texts.length,
    imageSlots: result.imageSlots.length,
    imageSlotDetails: result.imageSlots.map(s => ({ id: s.id, role: s.role, bbox: s.bbox })),
    textIds: result.texts.map(t => ({ id: t.id, role: t.role, text: t.text.slice(0, 40), bbox: t.bbox })),
    pathShapes: result.decorativeShapes?.filter(s => s.type === 'path').map(s => ({ id: s.id, fill: s.fill, bbox: s.bbox, pathData: s.pathData?.slice(0, 60) })) ?? [],
  })

  return result
}
