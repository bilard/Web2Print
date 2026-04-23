/**
 * Template : retail product portrait
 *
 * Disposition :
 *  - Header band teal en haut (12 % de la hauteur)
 *    └─ Logo Makita à gauche (x=4 %, w=22 %)
 *    └─ Badge tech (LXT, 18V) à côté (x=28 %, w=14 %)
 *  - Titre display 3 lignes max, sur fond clair (y=15 % à 33 %)
 *  - Subtitle (nom produit + modèle), 1 ligne (y=34 % à 39 %)
 *  - Colonne features à gauche (x=4 %, y=40-85 %, w=48 %) — 7 items max
 *  - Hero produit à droite (x=54 %, y=38-86 %, w=44 %)
 *  - Bandeau prix + CTA en bas (y=87-97 %)
 *  - Mentions légales en pied (y=97-100 %)
 *  - Décorations : lignes cyan en haut-droite + dividers
 */

import type { Template } from './types'

export const retailProductPortrait: Template = {
  id: 'retail-product-portrait',
  label: 'Fiche produit retail — portrait',
  description: 'Header coloré, titre display, colonne features avec pictos, hero produit à droite, bloc prix+CTA en bas. Inspiration Makita/Milwaukee retail.',
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
    badge: {
      bbox: { x: 0.30, y: 0.025, w: 0.14, h: 0.065 },
      role: 'badge',
      preserveAspectRatio: 'contain',
    },
    title: {
      bbox: { x: 0.04, y: 0.14, w: 0.92, h: 0.18 },
      role: 'title',
      fontFamily: 'hero',
      fontSize: 42,
      fontWeight: 800,
      align: 'left',
      colorRef: 'text',
      minFontSize: 28,
      maxLines: 3,
    },
    subtitle: {
      bbox: { x: 0.04, y: 0.335, w: 0.92, h: 0.05 },
      role: 'subtitle',
      fontFamily: 'body',
      fontSize: 18,
      fontWeight: 600,
      align: 'left',
      colorRef: 'text',
      minFontSize: 14,
      maxLines: 1,
    },
    features: {
      container: { x: 0.04, y: 0.40, w: 0.48, h: 0.45 },
      layout: 'vertical',
      maxItems: 7,
      itemTemplate: {
        picto: {
          bbox: { x: 0, y: 0.15, w: 0.18, h: 0.70 },
          fallbackPictoKey: 'check',
        },
        title: {
          bbox: { x: 0.22, y: 0, w: 0.78, h: 0.40 },
          fontSize: 11,
          fontWeight: 700,
          colorRef: 'text',
        },
        desc: {
          bbox: { x: 0.22, y: 0.42, w: 0.78, h: 0.58 },
          fontSize: 9,
          fontWeight: 400,
          colorRef: 'text',
        },
      },
    },
    heroProduct: {
      bbox: { x: 0.54, y: 0.38, w: 0.44, h: 0.48 },
      role: 'hero',
      preserveAspectRatio: 'contain',
    },
    cta: {
      bbox: { x: 0.04, y: 0.88, w: 0.44, h: 0.08 },
      role: 'cta',
      fontFamily: 'hero',
      fontSize: 22,
      fontWeight: 700,
      align: 'center',
      colorRef: 'neutral',
      backgroundRef: 'primary',
    },
    priceNew: {
      bbox: { x: 0.56, y: 0.88, w: 0.28, h: 0.08 },
      role: 'price',
      fontFamily: 'hero',
      fontSize: 34,
      fontWeight: 800,
      align: 'left',
      colorRef: 'text',
    },
    priceOld: {
      bbox: { x: 0.85, y: 0.90, w: 0.13, h: 0.05 },
      role: 'price',
      fontFamily: 'body',
      fontSize: 14,
      fontWeight: 600,
      align: 'left',
      colorRef: 'text',
      decoration: 'line-through',
    },
    mentions: {
      bbox: { x: 0.04, y: 0.97, w: 0.92, h: 0.03 },
      role: 'mention',
      fontFamily: 'body',
      fontSize: 7,
      fontWeight: 400,
      align: 'center',
      colorRef: 'text',
      minFontSize: 5,
      maxLines: 1,
    },
  },
  decorativeSvg: `
    <svg x="0" y="0" width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="none">
      <!-- Header band -->
      <rect x="0" y="0" width="100" height="12" fill="{{palette.primary}}" data-role="background-decor"/>
      <!-- Decorative lines top-right -->
      <path d="M 85 1 L 99 1 M 87 3 L 99 3 M 89 5 L 99 5 M 91 7 L 99 7" stroke="{{palette.neutral}}" stroke-width="0.3" stroke-opacity="0.4" fill="none" data-role="background-decor"/>
      <!-- Divider sous le subtitle -->
      <rect x="4" y="39.5" width="92" height="0.4" fill="{{palette.primary}}" data-role="background-decor"/>
      <!-- Bottom bar decoration -->
      <rect x="0" y="97" width="100" height="0.4" fill="{{palette.primary}}" data-role="background-decor"/>
    </svg>
  `.trim(),
}
