// src/features/catalog/cardDesigns.ts
// DESIGNS complets de fiche : des identités visuelles TOTALEMENT différentes
// (polices, couleurs, formes des badges, fond de fiche, structure) proposées
// en galerie — un design = un CatalogCardStyle complet appliqué tel quel
// (par-dessus les défauts). Le thème de PAGE (bandeaux, folio) reste intact.
import { CARD_LAYOUT_TEMPLATES } from './cardLayoutTemplates'
import type { CatalogCardStyle } from './catalogTypes'

export interface CardDesign {
  name: string
  /** Une phrase — tooltip du bouton de la galerie. */
  desc: string
  style: Partial<CatalogCardStyle>
}

/** Structure d'un template de mise en page, par nom (source unique des boîtes). */
const layoutOf = (name: string) => {
  const t = CARD_LAYOUT_TEMPLATES.find((x) => x.name === name)
  return { layout: { ...(t?.layout ?? {}) }, layoutWide: { ...(t?.layoutWide ?? {}) } }
}

export const CARD_DESIGNS: CardDesign[] = [
  {
    name: 'Thème du catalogue',
    desc: 'Le design de départ : tout hérite du thème du plan (couleurs, polices).',
    style: {},
  },
  {
    name: 'Promo choc',
    desc: 'Rouge-orangé flashy, étiquette bien penchée, prix XXL — pur prospectus discount.',
    style: {
      ...layoutOf('Classique'),
      nameFont: 'Anton', priceFont: 'Archivo', promoFont: 'Archivo', brandFont: 'Archivo',
      promoBg: '#dc2626', promoBg2: '#f97316', priceBg: '#dc2626', priceBg2: '#b91c1c',
      stickerBg: '#ef4444', wasBg: '#111827', kickerBg: '#111827', nameColor: '#b91c1c',
      priceShape: 'tag', priceRotate: -6, stickerShape: 'round', stickerRotate: 14,
      priceScale: 1.25, promoScale: 1.1, nameScale: 1.1, radius: 4, cellBg: '',
    },
  },
  {
    name: 'Premium élégant',
    desc: 'Serif Playfair, noir & doré, carrés nets, fond ivoire — haut de gamme.',
    style: {
      ...layoutOf('Focus visuel'),
      nameFont: 'Playfair Display', priceFont: 'Playfair Display', brandFont: 'Raleway', descFont: 'Raleway', promoFont: 'Raleway',
      promoBg: '#0f172a', priceBg: '#111827', priceInk: '#eacd8a', stickerBg: '#0f172a',
      wasBg: '#6b7280', kickerBg: '#0f172a', nameColor: '#111827',
      priceShape: 'square', priceRotate: 0, stickerShape: 'rounded', stickerRotate: 0,
      radius: 0, cellBg: '#faf8f4',
    },
  },
  {
    name: 'Frais & naturel',
    desc: 'Verts tendres, pastilles pilule, coins très arrondis, fond amande — bio/frais.',
    style: {
      ...layoutOf('Image à gauche'),
      nameFont: 'Poppins', priceFont: 'Poppins', promoFont: 'Nunito', descFont: 'Nunito',
      promoBg: '#16a34a', promoBg2: '#65a30d', priceBg: '#15803d', stickerBg: '#84cc16',
      wasBg: '#374151', kickerBg: '#14532d', nameColor: '#14532d',
      priceShape: 'pill', priceRotate: 0, stickerShape: 'round', stickerRotate: 0,
      radius: 14, cellBg: '#f6faf2',
    },
  },
  {
    name: 'Tech minimal',
    desc: 'Bleu acier sur gris perle, tout carré, zéro rotation, grande zone specs.',
    style: {
      ...layoutOf('Fiche technique'),
      nameFont: 'Rubik', priceFont: 'Inter', brandFont: 'Work Sans', detailsFont: 'Inter',
      promoBg: '#1e293b', priceBg: '#0ea5e9', priceBg2: '#2563eb', stickerBg: '#334155',
      wasBg: '#64748b', kickerBg: '#0f172a', nameColor: '#0f172a',
      priceShape: 'square', priceRotate: 0, stickerShape: 'square', stickerRotate: 0,
      detailsScale: 1.1, radius: 2, cellBg: '#f5f7fa',
    },
  },
  {
    name: 'Marché rétro',
    desc: 'Brique & ocre sur fond crème, Bebas Neue, prix en bandeau bas — épicerie vintage.',
    style: {
      ...layoutOf('Prix en bandeau bas'),
      nameFont: 'Bebas Neue', priceFont: 'Oswald', promoFont: 'Oswald', brandFont: 'Lato',
      promoBg: '#9a3412', priceBg: '#7c2d12', stickerBg: '#b45309',
      wasBg: '#292524', kickerBg: '#44403c', nameColor: '#7c2d12',
      priceShape: 'tag', priceRotate: -3, stickerShape: 'round', stickerRotate: 8,
      nameScale: 1.15, radius: 8, cellBg: '#fdf6e3',
    },
  },
]
