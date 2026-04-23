/**
 * Template : retail product portrait — style Makita promo
 *
 * Composition dramatique inspirée des affiches retail Makita/Milwaukee :
 *  - Header teal compact (12 % h) avec logo + tagline
 *  - Titre display énorme (20 % h) + subtitle (5 % h)
 *  - Hero produit dominant à gauche (55 % w) + features à droite avec picto-circles teal
 *  - Bloc prix 2 colonnes : ancien prix barré gauche + badge teal "prix promo" droite
 *  - CTA full-width teal en bas ("JE COMMANDE MAINTENANT !")
 *  - Mentions centrées en pied
 */

import type { Template } from './types'

export const retailProductPortrait: Template = {
  id: 'retail-product-portrait',
  label: 'Fiche produit retail — portrait',
  description: 'Composition Makita-promo : header + tagline, hero dominant, features avec picto-circles, bloc prix 2-col, CTA full-width. Parfait pour affiche retail A4/flyer.',
  aspectRatio: 'portrait',
  fonts: { hero: 'Oswald', body: 'Inter' },
  defaultPalette: {
    primary: '#0A6E7C',
    secondary: '#E30613',
    neutral: '#F4F6F8',
    text: '#0E2A47',
  },
  slots: {
    logo: {
      bbox: { x: 0.04, y: 0.025, w: 0.24, h: 0.065 },
      role: 'logo',
      preserveAspectRatio: 'contain',
    },
    taglineHeader: {
      bbox: { x: 0.30, y: 0.035, w: 0.66, h: 0.05 },
      role: 'subtitle',
      fontFamily: 'hero',
      fontSize: 22,
      fontWeight: 700,
      align: 'right',
      colorRef: 'neutral',
      minFontSize: 14,
      maxLines: 1,
    },
    title: {
      bbox: { x: 0.04, y: 0.14, w: 0.92, h: 0.12 },
      role: 'title',
      fontFamily: 'hero',
      fontSize: 48,
      fontWeight: 800,
      align: 'left',
      colorRef: 'text',
      minFontSize: 28,
      maxLines: 2,
    },
    subtitle: {
      bbox: { x: 0.04, y: 0.265, w: 0.92, h: 0.04 },
      role: 'subtitle',
      fontFamily: 'body',
      fontSize: 16,
      fontWeight: 600,
      align: 'left',
      colorRef: 'text',
      minFontSize: 12,
      maxLines: 1,
    },
    heroProduct: {
      bbox: { x: 0.00, y: 0.32, w: 0.55, h: 0.44 },
      role: 'hero',
      preserveAspectRatio: 'contain',
    },
    features: {
      container: { x: 0.56, y: 0.32, w: 0.42, h: 0.44 },
      layout: 'vertical',
      maxItems: 4,
      itemTemplate: {
        picto: {
          bbox: { x: 0.00, y: 0.10, w: 0.22, h: 0.80 },
          fallbackPictoKey: 'check',
          shape: 'circle',
          backgroundRef: 'primary',
          foregroundRef: 'neutral',
        },
        title: {
          bbox: { x: 0.26, y: 0.08, w: 0.74, h: 0.40 },
          fontSize: 13,
          fontWeight: 800,
          colorRef: 'text',
        },
        desc: {
          bbox: { x: 0.26, y: 0.50, w: 0.74, h: 0.50 },
          fontSize: 10,
          fontWeight: 400,
          colorRef: 'text',
        },
      },
    },
    priceOld: {
      bbox: { x: 0.06, y: 0.78, w: 0.28, h: 0.06 },
      role: 'price',
      fontFamily: 'hero',
      fontSize: 28,
      fontWeight: 700,
      align: 'center',
      colorRef: 'secondary',
      decoration: 'line-through',
    },
    priceOldLabel: {
      bbox: { x: 0.06, y: 0.84, w: 0.28, h: 0.03 },
      role: 'mention',
      fontFamily: 'body',
      fontSize: 9,
      fontWeight: 700,
      align: 'center',
      colorRef: 'text',
      hardcodedContent: 'PRIX PUBLIC CONSEILLÉ',
    },
    priceNew: {
      bbox: { x: 0.38, y: 0.76, w: 0.56, h: 0.08 },
      role: 'price',
      fontFamily: 'hero',
      fontSize: 44,
      fontWeight: 800,
      align: 'center',
      colorRef: 'neutral',
      backgroundRef: 'primary',
    },
    priceNewLabel: {
      bbox: { x: 0.38, y: 0.845, w: 0.56, h: 0.03 },
      role: 'mention',
      fontFamily: 'body',
      fontSize: 9,
      fontWeight: 700,
      align: 'center',
      colorRef: 'text',
      hardcodedContent: 'PRIX PROMO T.T.C.',
    },
    cta: {
      bbox: { x: 0.04, y: 0.88, w: 0.92, h: 0.07 },
      role: 'cta',
      fontFamily: 'hero',
      fontSize: 26,
      fontWeight: 800,
      align: 'center',
      colorRef: 'neutral',
      backgroundRef: 'primary',
    },
    mentions: {
      bbox: { x: 0.04, y: 0.96, w: 0.92, h: 0.035 },
      role: 'mention',
      fontFamily: 'body',
      fontSize: 8,
      fontWeight: 400,
      align: 'center',
      colorRef: 'text',
      minFontSize: 6,
      maxLines: 2,
    },
  },
  decorativeSvg: `
    <svg x="0" y="0" width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="none">
      <!-- Header teal compact -->
      <rect x="0" y="0" width="100" height="12" fill="{{palette.primary}}" data-role="background-decor"/>
      <!-- Accent lines top-right du header -->
      <path d="M 82 3 L 97 3 M 84 5 L 97 5 M 86 7 L 97 7" stroke="{{palette.neutral}}" stroke-width="0.25" stroke-opacity="0.5" fill="none" data-role="background-decor"/>
      <!-- Divider horizontal sous le subtitle -->
      <rect x="4" y="30" width="92" height="0.3" fill="{{palette.primary}}" fill-opacity="0.3" data-role="background-decor"/>
      <!-- Divider horizontal au-dessus du bloc prix -->
      <rect x="4" y="77" width="92" height="0.3" fill="{{palette.primary}}" fill-opacity="0.3" data-role="background-decor"/>
    </svg>
  `.trim(),
}
