/**
 * Template : retail product portrait (MODERN)
 *
 * Disposition moderne & épurée :
 *  - Header diagonal teal en haut (~18% h) avec logo angled
 *  - Titre dominant blanc sur/après le header (y=8-28%)
 *  - Bloc gauche : features liste verticale avec icônes carrées (x=0-48%, y=30-78%)
 *  - Bloc droit : hero produit grand (x=50-100%, y=10-75%)
 *  - Prix rouge + CTA teal en bas droite (x=50-100%, y=78-100%)
 *  - Mentions légales bas gauche
 */

import type { Template } from './types'

export const retailProductPortrait: Template = {
  id: 'retail-product-portrait',
  label: 'Fiche produit retail — portrait',
  description: 'Design moderne : header diagonal, title dominant, features liste gauche, hero produit droit, prix+CTA bas-droit. A4/flyer/bristol.',
  aspectRatio: 'portrait',
  fonts: { hero: 'Oswald', body: 'Inter' },
  defaultPalette: {
    primary: '#0A6E7C',
    secondary: '#E30613',
    neutral: '#FFFFFF',
    text: '#1A1A1A',
  },
  slots: {
    logo: {
      bbox: { x: 0.04, y: 0.02, w: 0.18, h: 0.08 },
      role: 'logo',
      preserveAspectRatio: 'contain',
    },
    // TITRE dominant — blanc sur fond blanc (ou avec overlay léger du header).
    title: {
      bbox: { x: 0.04, y: 0.10, w: 0.92, h: 0.18 },
      role: 'title',
      fontFamily: 'hero',
      fontSize: 38,
      fontWeight: 800,
      align: 'left',
      colorRef: 'text',
      minFontSize: 24,
      maxLines: 5,
    },
    // Features en liste verticale à gauche. maxItems=6 pour 6 items.
    features: {
      container: { x: 0.04, y: 0.30, w: 0.44, h: 0.48 },
      layout: 'vertical',
      maxItems: 6,
      itemTemplate: {
        picto: {
          bbox: { x: 0, y: 0, w: 0.20, h: 0.20 },
          shape: 'square',
          backgroundRef: 'primary',
          foregroundRef: 'neutral',
          fallbackPictoKey: 'check',
        },
        title: {
          bbox: { x: 0.24, y: 0.02, w: 0.76, h: 0.40 },
          fontSize: 12,
          fontWeight: 700,
          colorRef: 'text',
        },
        desc: {
          bbox: { x: 0.24, y: 0.42, w: 0.76, h: 0.58 },
          fontSize: 9,
          fontWeight: 400,
          colorRef: 'text',
        },
      },
    },
    // HERO produit à droite.
    heroProduct: {
      bbox: { x: 0.50, y: 0.08, w: 0.48, h: 0.68 },
      role: 'hero',
      preserveAspectRatio: 'contain',
    },
    // Prix en rouge à droite en bas.
    priceNew: {
      bbox: { x: 0.50, y: 0.78, w: 0.48, h: 0.12 },
      role: 'price',
      fontFamily: 'hero',
      fontSize: 44,
      fontWeight: 800,
      align: 'center',
      colorRef: 'neutral',
      backgroundRef: 'secondary',
    },
    priceOld: {
      bbox: { x: 0.50, y: 0.88, w: 0.48, h: 0.04 },
      role: 'price',
      fontFamily: 'body',
      fontSize: 12,
      fontWeight: 600,
      align: 'center',
      colorRef: 'text',
      decoration: 'line-through',
    },
    cta: {
      bbox: { x: 0.50, y: 0.93, w: 0.48, h: 0.05 },
      role: 'cta',
      fontFamily: 'hero',
      fontSize: 13,
      fontWeight: 700,
      align: 'center',
      colorRef: 'neutral',
      backgroundRef: 'primary',
    },
    // Mentions légales bas gauche.
    mentions: {
      bbox: { x: 0.04, y: 0.80, w: 0.44, h: 0.18 },
      role: 'mention',
      fontFamily: 'body',
      fontSize: 7,
      fontWeight: 400,
      align: 'left',
      colorRef: 'text',
      minFontSize: 5,
      maxLines: 6,
    },
  },
  decorativeSvg: `
    <svg x="0" y="0" width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="none">
      <!-- Diagonal header background -->
      <polygon points="0,0 100,0 65,20 0,18" fill="{{palette.primary}}" data-role="background-decor"/>
      <!-- Divider line under header -->
      <path d="M 0 20 L 100 20" stroke="{{palette.primary}}" stroke-width="0.5" fill="none" data-role="background-decor"/>
      <!-- Bottom divider for price section -->
      <path d="M 50 76 L 100 76" stroke="{{palette.primary}}" stroke-width="0.3" stroke-opacity="0.3" fill="none" data-role="background-decor"/>
    </svg>
  `.trim(),
}
