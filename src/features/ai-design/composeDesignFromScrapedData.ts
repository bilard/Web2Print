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

export function composeDesignFromScrapedData(data: ScrapedProductData): DesignAnalysis {
  const texts: TextElement[] = []
  const decorativeShapes: DecorativeShape[] = []
  const imageSlots: ImageSlot[] = []

  // ─── 1. Logo Jardiland (top-left) ────────────────────────────────────────
  imageSlots.push({
    id: 'brand_logo',
    role: 'logo',
    bbox: { x: 5, y: 3, w: 22, h: 7 },
    description: data.brandDomain || data.brand || '',
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
  })

  // ─── 3. Titre produit (multi-ligne) ──────────────────────────────────────
  // Le titre scrapé peut être long ; on lui laisse 4 lignes virtuelles via h=18
  texts.push({
    id: 'product_title',
    text: data.title,
    bbox: { x: 5, y: 14, w: 50, h: 18 },
    fontSizePct: 4,
    fontFamily: 'Inter',
    color: PALETTE.textDark,
    bold: true,
    italic: false,
    align: 'left',
  })

  // ─── 4. Photo produit (right side, héro) ─────────────────────────────────
  imageSlots.push({
    id: 'product_photo',
    role: 'productPhoto',
    bbox: { x: 58, y: 14, w: 38, h: 50 },
    description: data.title,
  })

  // ─── 5. Features (bullets verts à gauche) ────────────────────────────────
  const features = data.features.slice(0, 5)
  features.forEach((feat, i) => {
    const y = 35 + i * 5.5

    // Pastille verte
    decorativeShapes.push({
      id: `feature_dot_${i}`,
      type: 'circle',
      bbox: { x: 5.5, y: y + 0.5, w: 1.8, h: 1.8 },
      fill: PALETTE.accent,
    })

    // Texte feature
    texts.push({
      id: `feature_${i}`,
      text: feat,
      bbox: { x: 9, y: y, w: 45, h: 4.5 },
      fontSizePct: 1.6,
      fontFamily: 'Inter',
      color: PALETTE.textDark,
      bold: false,
      italic: false,
      align: 'left',
    })
  })

  // ─── 6. Rating (étoiles + nb avis) ───────────────────────────────────────
  const ratingY = 35 + features.length * 5.5 + 4

  if (data.rating) {
    texts.push({
      id: 'rating_stars',
      text: '★★★★★',
      bbox: { x: 5, y: ratingY, w: 16, h: 4 },
      fontSizePct: 2.6,
      fontFamily: 'Inter',
      color: PALETTE.textDark,
      bold: false,
      italic: false,
      align: 'left',
    })

    const reviewSuffix = data.reviewCount ? ` · ${data.reviewCount} AVIS CLIENTS` : ''
    texts.push({
      id: 'rating_text',
      text: `${data.rating}${reviewSuffix}`,
      bbox: { x: 5, y: ratingY + 4, w: 50, h: 3 },
      fontSizePct: 1.4,
      fontFamily: 'Inter',
      color: PALETTE.textDark,
      bold: true,
      italic: false,
      align: 'left',
    })
  }

  // ─── 7. Prix barré (petit, sous le rating) ───────────────────────────────
  const priceY = ratingY + 9

  if (data.oldPrice) {
    texts.push({
      id: 'price_old',
      text: `Ancien prix ${data.oldPrice}`,
      bbox: { x: 5, y: priceY, w: 30, h: 3 },
      fontSizePct: 1.3,
      fontFamily: 'Inter',
      color: PALETTE.textMuted,
      bold: false,
      italic: false,
      strikethrough: true,
      align: 'left',
    })
  }

  // ─── 8. Prix actuel (gros, sur bloc noir) ────────────────────────────────
  if (data.price) {
    decorativeShapes.push({
      id: 'price_block',
      type: 'rect',
      bbox: { x: 5, y: priceY + 3.5, w: 30, h: 9 },
      fill: PALETTE.priceBlock,
    })
    texts.push({
      id: 'price_current',
      text: data.price,
      bbox: { x: 6, y: priceY + 5, w: 28, h: 6 },
      fontSizePct: 5,
      fontFamily: 'Inter',
      color: PALETTE.white,
      bold: true,
      italic: false,
      align: 'left',
    })
  }

  // ─── 9. CTA "J'EN PROFITE" (pill verte, en bas) ──────────────────────────
  decorativeShapes.push({
    id: 'cta_bg',
    type: 'rect',
    bbox: { x: 5, y: priceY + 14, w: 30, h: 6 },
    rx: 50,
    fill: PALETTE.accent,
  })
  texts.push({
    id: 'cta_label',
    text: "J'EN PROFITE",
    bbox: { x: 5, y: priceY + 15.5, w: 30, h: 3.5 },
    fontSizePct: 1.8,
    fontFamily: 'Inter',
    color: PALETTE.white,
    bold: true,
    italic: false,
    align: 'center',
  })

  const background: BackgroundDef = { type: 'solid', color: PALETTE.bg }

  return {
    background,
    decorativeShapes,
    texts,
    imageSlots,
  }
}
