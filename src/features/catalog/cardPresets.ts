// src/features/catalog/cardPresets.ts
// Presets GRAPHIQUES des fiches : patchs prédéfinis de CatalogCardStyle (formes,
// inclinaisons, arrondis) appliqués PAR-DESSUS le style courant — couleurs,
// polices et dispositions (layout/layoutWide) de l'utilisateur sont préservées.
import type { CatalogCardStyle } from './catalogTypes'

export interface CardPreset {
  name: string
  /** Une phrase — tooltip du bouton de la galerie. */
  desc: string
  patch: Partial<CatalogCardStyle>
}

export const CARD_PRESETS: CardPreset[] = [
  {
    name: 'Classique',
    desc: 'Étiquette prix inclinée, sticker rond — le style de départ.',
    patch: { priceShape: 'tag', priceRotate: -2, stickerShape: 'round', stickerRotate: 8, radius: 6 },
  },
  {
    name: 'Badges carrés',
    desc: 'Prix et sticker carrés, aucune rotation — net et technique.',
    patch: { priceShape: 'square', priceRotate: 0, stickerShape: 'square', stickerRotate: 0, radius: 2 },
  },
  {
    name: 'Pastilles rondes',
    desc: 'Prix en pilule, sticker rond bien droit — doux et moderne.',
    patch: { priceShape: 'pill', priceRotate: 0, stickerShape: 'round', stickerRotate: 0, radius: 14 },
  },
  {
    name: 'Coins arrondis',
    desc: 'Badges aux coins arrondis, sans inclinaison — sobre et lisible.',
    patch: { priceShape: 'rounded', priceRotate: 0, stickerShape: 'rounded', stickerRotate: 0, radius: 10 },
  },
  {
    name: 'Promo dynamique',
    desc: 'Étiquette bien penchée, sticker en biais — énergie prospectus.',
    patch: { priceShape: 'tag', priceRotate: -6, stickerShape: 'round', stickerRotate: 14, radius: 6 },
  },
  {
    name: 'Prix XXL',
    desc: 'Prix en pilule agrandi ×1,3 — la mise en avant avant tout.',
    patch: { priceShape: 'pill', priceRotate: 0, priceScale: 1.3, stickerShape: 'round', stickerRotate: 0, radius: 10 },
  },
]
