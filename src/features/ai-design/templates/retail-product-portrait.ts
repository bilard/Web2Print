/**
 * Template : retail product portrait — composition Makita-promo réf NB
 *
 *  - Header teal ~14% : logo gauche + TITRE blanc à droite (pas d'overflow
 *    possible vers subtitle)
 *  - Subtitle dark sous le header (6% h)
 *  - Hero produit MASSIF centré (36% h)
 *  - Features sous le hero en rangée horizontale 2-cols (15% h)
 *  - Bloc prix compact à droite en bas : priceOld barré + priceNew teal +
 *    labels + CTA intégré
 *  - Mentions à gauche en bas (pendant du bloc prix)
 *
 * Avantage vs version précédente : titre dans le header = pas d'overflow
 * possible sur le subtitle. Hero massif central = meilleur rendu pour
 * produits horizontaux (taille-haie, coupe-bordure).
 */

import type { Template } from './types'

export const retailProductPortrait: Template = {
  id: 'retail-product-portrait',
  label: 'Fiche produit retail — portrait',
  description: 'Composition Makita-promo : titre dans header teal, hero massif centré, features 2-col horizontales, bloc prix+CTA à droite. A4/flyer/bristol.',
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
      bbox: { x: 0.03, y: 0.02, w: 0.20, h: 0.10 },
      role: 'logo',
      preserveAspectRatio: 'contain',
    },
    // TITRE dans le header teal — blanc sur teal, aligné droite.
    title: {
      bbox: { x: 0.26, y: 0.02, w: 0.70, h: 0.10 },
      role: 'title',
      fontFamily: 'hero',
      fontSize: 32,
      fontWeight: 800,
      align: 'right',
      colorRef: 'neutral',
      minFontSize: 16,
      maxLines: 2,
    },
    // Subtitle sous le header — dark sur blanc, full-width.
    subtitle: {
      bbox: { x: 0.04, y: 0.17, w: 0.92, h: 0.055 },
      role: 'subtitle',
      fontFamily: 'hero',
      fontSize: 22,
      fontWeight: 700,
      align: 'left',
      colorRef: 'text',
      minFontSize: 12,
      maxLines: 1,
    },
    // HERO produit MASSIF centré (large horizontal rectangle pour produits
    // allongés type taille-haie).
    heroProduct: {
      bbox: { x: 0.02, y: 0.26, w: 0.96, h: 0.36 },
      role: 'hero',
      preserveAspectRatio: 'contain',
    },
    // Features en grille 2-cols sous le hero. maxItems=4 pour 2 rangées de 2.
    features: {
      container: { x: 0.04, y: 0.64, w: 0.92, h: 0.15 },
      layout: 'grid-2col',
      maxItems: 4,
      itemTemplate: {
        picto: {
          bbox: { x: 0.03, y: 0.10, w: 0.20, h: 0.80 },
          fallbackPictoKey: 'check',
          shape: 'circle',
          backgroundRef: 'primary',
          foregroundRef: 'neutral',
        },
        title: {
          bbox: { x: 0.26, y: 0.08, w: 0.72, h: 0.38 },
          fontSize: 11,
          fontWeight: 800,
          colorRef: 'text',
        },
        desc: {
          bbox: { x: 0.26, y: 0.48, w: 0.72, h: 0.48 },
          fontSize: 8,
          fontWeight: 400,
          colorRef: 'text',
        },
      },
    },
    // Bloc prix à droite en bas.
    priceOld: {
      bbox: { x: 0.40, y: 0.81, w: 0.56, h: 0.04 },
      role: 'price',
      fontFamily: 'hero',
      fontSize: 18,
      fontWeight: 700,
      align: 'right',
      colorRef: 'secondary',
      decoration: 'line-through',
    },
    priceOldLabel: {
      bbox: { x: 0.40, y: 0.855, w: 0.56, h: 0.02 },
      role: 'mention',
      fontFamily: 'body',
      fontSize: 7,
      fontWeight: 700,
      align: 'right',
      colorRef: 'text',
      hardcodedContent: 'PRIX PUBLIC CONSEILLÉ',
    },
    priceNew: {
      bbox: { x: 0.40, y: 0.87, w: 0.56, h: 0.08 },
      role: 'price',
      fontFamily: 'hero',
      fontSize: 42,
      fontWeight: 800,
      align: 'center',
      colorRef: 'neutral',
      backgroundRef: 'primary',
    },
    cta: {
      bbox: { x: 0.40, y: 0.955, w: 0.56, h: 0.035 },
      role: 'cta',
      fontFamily: 'hero',
      fontSize: 14,
      fontWeight: 700,
      align: 'center',
      colorRef: 'primary',
      minFontSize: 9,
      maxLines: 1,
    },
    // Mentions légales à gauche en bas, en pendant du bloc prix.
    mentions: {
      bbox: { x: 0.03, y: 0.81, w: 0.35, h: 0.18 },
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
      <rect x="0" y="0" width="100" height="15" fill="{{palette.primary}}" data-role="background-decor"/>
      <path d="M 82 4 L 97 4 M 84 7 L 97 7 M 86 10 L 97 10" stroke="{{palette.neutral}}" stroke-width="0.3" stroke-opacity="0.5" fill="none" data-role="background-decor"/>
      <rect x="4" y="23" width="92" height="0.25" fill="{{palette.primary}}" fill-opacity="0.25" data-role="background-decor"/>
    </svg>
  `.trim(),
}
