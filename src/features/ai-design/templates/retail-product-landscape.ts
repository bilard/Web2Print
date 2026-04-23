/**
 * Template : retail product landscape (MODERN)
 *
 * Disposition moderne & épurée :
 *  - Header diagonal teal en haut (y=0-18%) avec logo angled + tagline
 *  - Titre dominant full-width blanc sur teal (y=10-22%)
 *  - Bloc gauche : features liste verticale avec icônes carrées (x=0-45%, y=25-85%)
 *  - Bloc droit : hero produit grand (x=50-100%, y=15-80%)
 *  - Prix + CTA en bas droite (x=50-100%, y=82-98%)
 */

import type { Template } from './types'

export const retailProductLandscape: Template = {
  id: 'retail-product-landscape',
  label: 'Fiche produit retail — paysage',
  description: 'Design moderne : header diagonal avec logo, title dominant, features liste gauche, hero produit droit, prix+CTA bas-droit.',
  aspectRatio: 'landscape',
  fonts: { hero: 'Oswald', body: 'Inter' },
  defaultPalette: {
    primary: '#0A6E7C',
    secondary: '#E30613',
    neutral: '#FFFFFF',
    text: '#1A1A1A',
  },
  slots: {
    logo: {
      bbox: { x: 0.02, y: 0.03, w: 0.12, h: 0.10 },
      role: 'logo',
      preserveAspectRatio: 'contain',
    },
    title: {
      bbox: { x: 0.02, y: 0.08, w: 0.48, h: 0.32 },
      role: 'title',
      fontFamily: 'hero',
      fontSize: 42,
      fontWeight: 800,
      align: 'left',
      colorRef: 'text',
      minFontSize: 28,
      maxLines: 5,
    },
    features: {
      container: { x: 0.02, y: 0.28, w: 0.46, h: 0.57 },
      layout: 'vertical',
      maxItems: 6,
      itemTemplate: {
        picto: {
          bbox: { x: 0, y: 0, w: 0.18, h: 0.18 },
          shape: 'square',
          backgroundRef: 'primary',
          foregroundRef: 'neutral',
          fallbackPictoKey: 'check',
        },
        title: {
          bbox: { x: 0.22, y: 0.02, w: 0.78, h: 0.35 },
          fontSize: 11,
          fontWeight: 700,
          colorRef: 'text',
        },
        desc: {
          bbox: { x: 0.22, y: 0.38, w: 0.78, h: 0.62 },
          fontSize: 9,
          fontWeight: 400,
          colorRef: 'text',
        },
      },
    },
    heroProduct: {
      bbox: { x: 0.52, y: 0.08, w: 0.46, h: 0.72 },
      role: 'hero',
      preserveAspectRatio: 'contain',
    },
    priceNew: {
      bbox: { x: 0.52, y: 0.82, w: 0.25, h: 0.12 },
      role: 'price',
      fontFamily: 'hero',
      fontSize: 44,
      fontWeight: 800,
      align: 'left',
      colorRef: 'secondary',
    },
    priceOld: {
      bbox: { x: 0.78, y: 0.85, w: 0.20, h: 0.06 },
      role: 'price',
      fontFamily: 'body',
      fontSize: 12,
      fontWeight: 600,
      align: 'left',
      colorRef: 'text',
      decoration: 'line-through',
    },
    cta: {
      bbox: { x: 0.52, y: 0.93, w: 0.46, h: 0.05 },
      role: 'cta',
      fontFamily: 'hero',
      fontSize: 13,
      fontWeight: 700,
      align: 'center',
      colorRef: 'neutral',
      backgroundRef: 'secondary',
    },
    mentions: {
      bbox: { x: 0.02, y: 0.88, w: 0.46, h: 0.10 },
      role: 'mention',
      fontFamily: 'body',
      fontSize: 7,
      fontWeight: 400,
      align: 'left',
      colorRef: 'text',
      minFontSize: 5,
      maxLines: 3,
    },
  },
  decorativeSvg: `
    <svg x="0" y="0" width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="none">
      <!-- Diagonal header background -->
      <polygon points="0,0 100,0 45,22 0,20" fill="{{palette.primary}}" data-role="background-decor"/>
      <!-- Divider line under header -->
      <path d="M 0 22 L 100 22" stroke="{{palette.primary}}" stroke-width="0.8" fill="none" data-role="background-decor"/>
    </svg>
  `.trim(),
}
