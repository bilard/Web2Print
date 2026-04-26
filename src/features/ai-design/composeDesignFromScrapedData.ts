/**
 * Compose un design retail directement à partir des données scrapées,
 * SANS passer par Nano Banana ni Claude Vision. Zéro hallucination possible :
 * tous les textes, prix, images viennent du site source.
 *
 * Layout : portrait retail standard
 *  - Header : logo (top-left) + badge "OFFRE EXCLUSIVE"
 *  - Title : titre produit multi-ligne
 *  - Body left : bullets features + rating
 *  - Body right : photo produit (héro)
 *  - Footer : prix barré (petit) + prix actuel (gros, sur fond noir) + CTA vert
 */

import type {
  DesignAnalysis,
  TextElement,
  ImageSlot,
  DecorativeShape,
  BackgroundDef,
} from './analyzeDesignForEdit'
import type { ScrapedProductData } from './scrapeProductForDesign'

// Palette retail neutre. Les couleurs spécifiques de marque arrivent via le logo
// (FabricImage) qui colore visuellement le haut du poster sans imposer une charte
// codée en dur ici.
const PALETTE = {
  bg: '#f5f0e8',          // crème — fond neutre retail
  accent: '#00a651',      // vert promo (badge + CTA)
  textDark: '#1a1a1a',
  textMuted: '#666666',
  priceBlock: '#000000',
  white: '#ffffff',
}

/**
 * Extrait des features auto-générées depuis le titre du produit, quand le
 * scrape n'a renvoyé aucune feature exploitable. Détecte les specs courantes
 * du retail outillage / électroménager (surface, voltage, ampérage, largeur
 * de coupe, connectivité). Évite un canvas vide visuellement.
 */
function extractFeaturesFromTitle(title: string): string[] {
  if (!title) return []
  const features: string[] = []

  const surfaceMatch = title.match(/(\d+)\s*m²/i)
  if (surfaceMatch) features.push(`Surface jusqu'à ${surfaceMatch[1]} m²`)

  const voltMatch = title.match(/(\d+)\s*V\b/i)
  const ahMatch = title.match(/(\d+(?:[,.]\d+)?)\s*Ah\b/i)
  if (voltMatch && ahMatch) {
    features.push(`Batterie ${voltMatch[1]}V ${ahMatch[1]}Ah`)
  } else if (voltMatch) {
    features.push(`Alimentation ${voltMatch[1]}V`)
  } else if (ahMatch) {
    features.push(`Capacité ${ahMatch[1]}Ah`)
  }

  const cutMatch = title.match(/coupe\s*(\d+(?:[,.]\d+)?)\s*cm/i)
  if (cutMatch) features.push(`Largeur de coupe ${cutMatch[1]} cm`)

  const wifi = /Wi-?Fi/i.test(title)
  const bluetooth = /Bluetooth/i.test(title)
  if (wifi && bluetooth) features.push('Connectivité Wi-Fi & Bluetooth')
  else if (wifi) features.push('Wi-Fi intégré')
  else if (bluetooth) features.push('Bluetooth intégré')

  if (/\bRTK\b/i.test(title)) features.push('Précision GPS RTK')
  else if (/\bGPS\b/i.test(title)) features.push('GPS intégré')

  if (/\bsans fil\b/i.test(title)) features.push('Sans fil')
  if (/\bbrushless\b/i.test(title)) features.push('Moteur brushless')

  return features.slice(0, 5)
}

export function composeDesignFromScrapedData(data: ScrapedProductData): DesignAnalysis {
  const texts: TextElement[] = []
  const decorativeShapes: DecorativeShape[] = []
  const imageSlots: ImageSlot[] = []

  // ─── 1. Logo marque (top-left, agrandi pour visibilité retail) ──────────
  // Hauteur portée de 7 à 12 : avec fit-contain et un logo souvent carré
  // (Brico Dépôt, Castorama, etc.), augmenter h donne directement un logo
  // plus grand sans empiéter sur le badge OFFRE EXCLUSIVE qui reste à x=30.
  imageSlots.push({
    id: 'brand_logo',
    role: 'logo',
    bbox: { x: 3, y: 2, w: 26, h: 12 },
    description: data.brandDomain || data.brand || '',
    backgroundColor: PALETTE.bg,
    backgroundIsUniform: true,
  })

  // ─── 2. Badge "OFFRE EXCLUSIVE" (vert, à droite du logo) ────────────────
  decorativeShapes.push({
    id: 'badge_bg',
    type: 'rect',
    bbox: { x: 30, y: 4, w: 28, h: 5 },
    rx: 50,
    fill: PALETTE.accent,
  })
  texts.push({
    id: 'badge_label',
    text: 'OFFRE EXCLUSIVE',
    bbox: { x: 30, y: 5.3, w: 28, h: 3 },
    fontSizePct: 1.5,
    fontFamily: 'Inter',
    color: PALETTE.white,
    bold: true,
    italic: false,
    align: 'center',
    role: 'badge',
    backgroundColor: PALETTE.accent,
    backgroundIsUniform: true,
  })

  // ─── 3. Titre produit (multi-ligne) ──────────────────────────────────────
  // Le titre scrapé peut être long ; on lui laisse 4 lignes virtuelles via h=18
  // Décalé y=16 (vs 14) pour laisser respirer le logo agrandi qui descend à y=14
  texts.push({
    id: 'product_title',
    text: data.title,
    bbox: { x: 5, y: 16, w: 50, h: 18 },
    fontSizePct: 4,
    fontFamily: 'Inter',
    color: PALETTE.textDark,
    bold: true,
    italic: false,
    align: 'left',
    role: 'title',
    backgroundColor: PALETTE.bg,
    backgroundIsUniform: true,
  })

  // ─── 4. Photo produit (right side, héro) ─────────────────────────────────
  imageSlots.push({
    id: 'product_photo',
    role: 'productPhoto',
    bbox: { x: 58, y: 14, w: 38, h: 50 },
    description: data.title,
    backgroundColor: PALETTE.bg,
    backgroundIsUniform: true,
  })

  // ─── 5. Features (bullets verts à gauche) ────────────────────────────────
  // Defensive layer : filtrer les parasites au cas où normalizeFeatures
  // (scrapeProductForDesign.ts) en aurait laissé passer.
  const PARASITE_RE = /^#+\s|^★+|\bAvis\s+clients?\b|\bAucun(?:e)?\s+(?:valeur|avis|note)\b|\bNote\s+moyenne\b|\bFiltrer\s+par\b|\b[Éé]valuation\b|^\s*\d+\s*$|^(?:Caractéristiques?|Description|Spécifications?|Détails)\s*:?\s*$/i
  let features = data.features
    .filter((f) => f && f.trim().length > 0 && !PARASITE_RE.test(f.trim()))
    .slice(0, 5)

  // Fallback : si le scrape n'a renvoyé aucune feature exploitable, on en
  // extrait depuis le titre du produit (specs courantes en retail outillage).
  // Évite un design vide quand la page produit n'a pas de section
  // "Caractéristiques" claire (cas Brico Dépôt et autres SSR sites).
  if (features.length === 0 && data.title) {
    features = extractFeaturesFromTitle(data.title)
  }

  // Sub-titre "AVANTAGES" en bold au-dessus de la liste, pour structurer
  // visuellement la zone features (même si feature liste vide on l'omet).
  if (features.length > 0) {
    texts.push({
      id: 'features_heading',
      text: 'AVANTAGES',
      bbox: { x: 5, y: 35, w: 50, h: 4 },
      fontSizePct: 2,
      fontFamily: 'Inter',
      color: PALETTE.accent,
      bold: true,
      italic: false,
      align: 'left',
      role: 'other',
      backgroundColor: PALETTE.bg,
      backgroundIsUniform: true,
    })
  }

  features.forEach((feat, i) => {
    const y = 40 + i * 7  // step augmenté à 7 (vs 5.5) pour donner de l'air aux features plus grandes

    // Texte feature (pastilles vertes remplacées par ✓ unicode)
    texts.push({
      id: `feature_${i}`,
      text: `✓ ${feat}`,
      bbox: { x: 5, y: y, w: 50, h: 6 },
      fontSizePct: 2.2,
      fontFamily: 'Inter',
      color: PALETTE.textDark,
      bold: false,
      italic: false,
      align: 'left',
      role: 'feature',
      backgroundColor: PALETTE.bg,
      backgroundIsUniform: true,
    })
  })

  // Curseur Y qui n'avance que si on rend réellement du contenu — évite les
  // gros vides sur produits sans rating ni oldPrice (typique Brico Dépôt).
  // Base : si features rendues, démarre après bloc heading + features (+ marge).
  // Sinon démarre à y=39 (zone juste après le titre).
  let cursorY = features.length > 0
    ? 40 + features.length * 7 + 4
    : 39

  // ─── 6. Rating (étoiles + nb avis) — uniquement si data.rating ───────────
  if (data.rating) {
    texts.push({
      id: 'rating_stars',
      text: '★★★★★',
      bbox: { x: 5, y: cursorY, w: 16, h: 4 },
      fontSizePct: 2.6,
      fontFamily: 'Inter',
      color: PALETTE.textDark,
      bold: false,
      italic: false,
      align: 'left',
      role: 'rating',
      backgroundColor: PALETTE.bg,
      backgroundIsUniform: true,
    })

    const reviewSuffix = data.reviewCount ? ` · ${data.reviewCount} AVIS CLIENTS` : ''
    texts.push({
      id: 'rating_text',
      text: `${data.rating}${reviewSuffix}`,
      bbox: { x: 5, y: cursorY + 4, w: 50, h: 3 },
      fontSizePct: 1.4,
      fontFamily: 'Inter',
      color: PALETTE.textDark,
      bold: true,
      italic: false,
      align: 'left',
      role: 'rating',
      backgroundColor: PALETTE.bg,
      backgroundIsUniform: true,
    })
    cursorY += 9 // hauteur étoiles (4) + texte (3) + marge (2)
  }

  // ─── 7. Prix barré (petit) — uniquement si data.oldPrice ─────────────────
  if (data.oldPrice) {
    texts.push({
      id: 'price_old',
      text: `Ancien prix ${data.oldPrice}`,
      bbox: { x: 5, y: cursorY, w: 30, h: 3 },
      fontSizePct: 1.3,
      fontFamily: 'Inter',
      color: PALETTE.textMuted,
      bold: false,
      italic: false,
      strikethrough: true,
      align: 'left',
      role: 'oldPrice',
      backgroundColor: PALETTE.bg,
      backgroundIsUniform: true,
    })
    cursorY += 3.5
  }

  // ─── 8. Prix actuel (gros, sur bloc noir) ────────────────────────────────
  if (data.price) {
    decorativeShapes.push({
      id: 'price_block',
      type: 'rect',
      bbox: { x: 5, y: cursorY, w: 30, h: 9 },
      fill: PALETTE.priceBlock,
    })
    texts.push({
      id: 'price_current',
      text: data.price,
      bbox: { x: 6, y: cursorY + 1.5, w: 28, h: 6 },
      fontSizePct: 5,
      fontFamily: 'Inter',
      color: PALETTE.white,
      bold: true,
      italic: false,
      align: 'left',
      role: 'price',
      backgroundColor: PALETTE.priceBlock,
      backgroundIsUniform: true,
    })
    cursorY += 11
  }

  // ─── 9. CTA "J'EN PROFITE" (pill verte) ──────────────────────────────────
  decorativeShapes.push({
    id: 'cta_bg',
    type: 'rect',
    bbox: { x: 5, y: cursorY, w: 30, h: 6 },
    rx: 50,
    fill: PALETTE.accent,
  })
  texts.push({
    id: 'cta_label',
    text: "J'EN PROFITE",
    bbox: { x: 5, y: cursorY + 1.5, w: 30, h: 3.5 },
    fontSizePct: 1.8,
    fontFamily: 'Inter',
    color: PALETTE.white,
    bold: true,
    italic: false,
    align: 'center',
    role: 'cta',
    backgroundColor: PALETTE.accent,
    backgroundIsUniform: true,
  })

  const background: BackgroundDef = { type: 'solid', color: PALETTE.bg }

  return {
    mode: 'creative',
    background,
    decorativeShapes,
    texts,
    imageSlots,
  }
}
