/**
 * Template : retail product portrait (MODERN v2)
 *
 * Inspiration Image #43 Nano Banana :
 *  - Dark background (via decorativeSvg)
 *  - Logo TOP-LEFT (4%, 2%, 16%, 8%)
 *  - Title DOMINANT (4%, 10%, 92%, 15%) — noir sur blanc
 *  - Subtitle (4%, 25%, 92%, 5%) — noir sur blanc
 *  - Features LIST GAUCHE : simple icons + text (4%, 32%, 42%, 50%)
 *  - Product DROIT (52%, 10%, 44%, 70%)
 *  - Prix BAS-GAUCHE (4%, 78%, 40%, 15%) — white box with strikethrough + bold price
 *  - CTA BAS-DROIT (52%, 88%, 44%, 8%) — teal button
 */

import type { Template } from './types'

export const retailProductPortrait: Template = {
  id: 'retail-product-portrait',
  label: 'Fiche produit retail — portrait',
  description: 'Design moderne inspiré Nano Banana : dark background, logo top, title dominant, features simple gauche, product droit, prix/CTA bas.',
  aspectRatio: 'portrait',
  fonts: { hero: 'Oswald', body: 'Inter' },
  defaultPalette: {
    primary: '#2B5A66',
    secondary: '#E30613',
    neutral: '#FFFFFF',
    text: '#1A1A1A',
  },
  slots: {
    logo: {
      bbox: { x: 0.04, y: 0.02, w: 0.16, h: 0.08 },
      role: 'logo',
      preserveAspectRatio: 'contain',
    },
    // TITRE dominant — noir/dark sur fond blanc.
    title: {
      bbox: { x: 0.04, y: 0.10, w: 0.92, h: 0.15 },
      role: 'title',
      fontFamily: 'hero',
      fontSize: 42,
      fontWeight: 800,
      align: 'left',
      colorRef: 'text',
      minFontSize: 28,
      maxLines: 3,
    },
    // Subtitle — accroche après titre.
    subtitle: {
      bbox: { x: 0.04, y: 0.25, w: 0.92, h: 0.05 },
      role: 'subtitle',
      fontFamily: 'body',
      fontSize: 14,
      fontWeight: 600,
      align: 'left',
      colorRef: 'text',
      minFontSize: 10,
      maxLines: 1,
    },
    // Features en liste verticale SIMPLE à gauche. Petit spacing.
    features: {
      container: { x: 0.04, y: 0.32, w: 0.42, h: 0.50 },
      layout: 'vertical',
      maxItems: 4,
      itemTemplate: {
        // Petite icône gauche — NO background, juste l'icon en couleur text.
        picto: {
          bbox: { x: 0, y: 0, w: 0.12, h: 0.16 },
          shape: 'none',
          foregroundRef: 'text',
          fallbackPictoKey: 'check',
        },
        title: {
          bbox: { x: 0.16, y: 0, w: 0.84, h: 0.40 },
          fontSize: 13,
          fontWeight: 700,
          colorRef: 'text',
        },
        desc: {
          bbox: { x: 0.16, y: 0.42, w: 0.84, h: 0.58 },
          fontSize: 9,
          fontWeight: 400,
          colorRef: 'text',
        },
      },
    },
    // HERO produit droit.
    heroProduct: {
      bbox: { x: 0.52, y: 0.10, w: 0.44, h: 0.68 },
      role: 'hero',
      preserveAspectRatio: 'contain',
    },
    // Prix — prix barré + nouveau prix en GRAS sur fond blanc.
    priceOld: {
      bbox: { x: 0.04, y: 0.78, w: 0.40, h: 0.05 },
      role: 'price',
      fontFamily: 'body',
      fontSize: 16,
      fontWeight: 600,
      align: 'left',
      colorRef: 'text',
      decoration: 'line-through',
    },
    priceNew: {
      bbox: { x: 0.04, y: 0.84, w: 0.40, h: 0.12 },
      role: 'price',
      fontFamily: 'hero',
      fontSize: 48,
      fontWeight: 800,
      align: 'left',
      colorRef: 'text',
    },
    // CTA teal button droit.
    cta: {
      bbox: { x: 0.52, y: 0.88, w: 0.44, h: 0.08 },
      role: 'cta',
      fontFamily: 'hero',
      fontSize: 16,
      fontWeight: 700,
      align: 'center',
      colorRef: 'neutral',
      backgroundRef: 'primary',
    },
    // Mentions légales.
    mentions: {
      bbox: { x: 0.04, y: 0.98, w: 0.92, h: 0.02 },
      role: 'mention',
      fontFamily: 'body',
      fontSize: 6,
      fontWeight: 400,
      align: 'left',
      colorRef: 'text',
      minFontSize: 4,
      maxLines: 1,
    },
  },
  decorativeSvg: `
    <svg x="0" y="0" width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="none">
      <!-- Dark background -->
      <rect x="0" y="0" width="100" height="100" fill="#2B3E50" data-role="background-decor"/>
      <!-- Dark header bar at top -->
      <rect x="0" y="0" width="100" height="12" fill="#1A1A1A" data-role="background-decor"/>
    </svg>
  `.trim(),
}
