/**
 * Template : retail product landscape
 *
 * Disposition horizontale :
 *  - Bande verticale teal à gauche (14 % de la largeur)
 *    └─ Logo en haut
 *    └─ Badge tech dessous
 *  - Hero produit à gauche (x=14 % à 50 %, y=10-85 %)
 *  - Bloc texte à droite (x=52 %, y=10-85 %)
 *    └─ Titre (3 lignes)
 *    └─ Subtitle (1 ligne)
 *    └─ 4-5 features en grid 2 colonnes
 *  - Bandeau prix + CTA en bas (y=88-98 %, full width)
 */

import type { Template } from './types'

export const retailProductLandscape: Template = {
  id: 'retail-product-landscape',
  label: 'Fiche produit retail — paysage',
  description: 'Bande verticale gauche avec logo, hero produit central, bloc texte à droite avec features en grille 2 colonnes, bandeau prix+CTA en bas.',
  aspectRatio: 'landscape',
  fonts: { hero: 'Oswald', body: 'Inter' },
  defaultPalette: {
    primary: '#0A6E7C',
    secondary: '#E30613',
    neutral: '#F4F6F8',
    text: '#0E2A47',
  },
  slots: {
    logo: {
      bbox: { x: 0.02, y: 0.04, w: 0.10, h: 0.08 },
      role: 'logo',
      preserveAspectRatio: 'contain',
    },
    badge: {
      bbox: { x: 0.02, y: 0.14, w: 0.10, h: 0.08 },
      role: 'badge',
      preserveAspectRatio: 'contain',
    },
    heroProduct: {
      bbox: { x: 0.14, y: 0.08, w: 0.36, h: 0.75 },
      role: 'hero',
      preserveAspectRatio: 'contain',
    },
    title: {
      bbox: { x: 0.52, y: 0.08, w: 0.46, h: 0.18 },
      role: 'title',
      fontFamily: 'hero',
      fontSize: 38,
      fontWeight: 800,
      align: 'left',
      colorRef: 'text',
      minFontSize: 26,
      maxLines: 3,
    },
    subtitle: {
      bbox: { x: 0.52, y: 0.27, w: 0.46, h: 0.05 },
      role: 'subtitle',
      fontFamily: 'body',
      fontSize: 16,
      fontWeight: 600,
      align: 'left',
      colorRef: 'text',
      minFontSize: 12,
      maxLines: 1,
    },
    features: {
      container: { x: 0.52, y: 0.34, w: 0.46, h: 0.48 },
      layout: 'grid-2col',
      maxItems: 6,
      itemTemplate: {
        picto: {
          bbox: { x: 0, y: 0.15, w: 0.20, h: 0.70 },
          fallbackPictoKey: 'check',
        },
        title: {
          bbox: { x: 0.24, y: 0, w: 0.76, h: 0.40 },
          fontSize: 10,
          fontWeight: 700,
          colorRef: 'text',
        },
        desc: {
          bbox: { x: 0.24, y: 0.42, w: 0.76, h: 0.58 },
          fontSize: 8,
          fontWeight: 400,
          colorRef: 'text',
        },
      },
    },
    cta: {
      bbox: { x: 0.04, y: 0.88, w: 0.30, h: 0.08 },
      role: 'cta',
      fontFamily: 'hero',
      fontSize: 22,
      fontWeight: 700,
      align: 'center',
      colorRef: 'neutral',
      backgroundRef: 'primary',
    },
    priceNew: {
      bbox: { x: 0.40, y: 0.87, w: 0.24, h: 0.10 },
      role: 'price',
      fontFamily: 'hero',
      fontSize: 38,
      fontWeight: 800,
      align: 'left',
      colorRef: 'text',
    },
    priceOld: {
      bbox: { x: 0.66, y: 0.90, w: 0.12, h: 0.05 },
      role: 'price',
      fontFamily: 'body',
      fontSize: 14,
      fontWeight: 600,
      align: 'left',
      colorRef: 'text',
      decoration: 'line-through',
    },
    mentions: {
      bbox: { x: 0.78, y: 0.88, w: 0.20, h: 0.08 },
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
      <!-- Vertical left band -->
      <rect x="0" y="0" width="14" height="100" fill="{{palette.primary}}" data-role="background-decor"/>
      <!-- Decorative vertical lines right edge -->
      <path d="M 98 15 L 98 60 M 96 20 L 96 60 M 94 25 L 94 60" stroke="{{palette.primary}}" stroke-width="0.3" stroke-opacity="0.5" fill="none" data-role="background-decor"/>
      <!-- Top divider after header -->
      <rect x="14" y="7" width="86" height="0.3" fill="{{palette.primary}}" fill-opacity="0.3" data-role="background-decor"/>
      <!-- Bottom bar decoration -->
      <rect x="0" y="98" width="100" height="0.4" fill="{{palette.primary}}" data-role="background-decor"/>
    </svg>
  `.trim(),
}
