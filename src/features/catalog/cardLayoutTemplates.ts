// src/features/catalog/cardLayoutTemplates.ts
// TEMPLATES de mise en page des fiches : des structures COMPLÈTEMENT différentes
// (position de chaque objet, pour les DEUX variantes verticale/pleine largeur)
// proposées en galerie. Appliquer un template remplace layout + layoutWide —
// couleurs, polices et formes de badges restent celles de l'utilisateur.
import type { CardBox, CardObjectId } from './catalogTypes'

export interface CardLayoutTemplate {
  name: string
  /** Une phrase — tooltip du bouton de la galerie. */
  desc: string
  /** Boîtes de la variante VERTICALE ({} = repli FREE_DEFAULT_LAYOUT). */
  layout: Partial<Record<CardObjectId, CardBox>>
  /** Boîtes de la variante PLEINE LARGEUR ({} = repli FREE_WIDE_LAYOUT, déjà 2 colonnes). */
  layoutWide: Partial<Record<CardObjectId, CardBox>>
}

export const CARD_LAYOUT_TEMPLATES: CardLayoutTemplate[] = [
  {
    name: 'Classique',
    desc: 'Image en haut, textes empilés, prix bas-droite — la structure de départ.',
    layout: {},
    layoutWide: {},
  },
  {
    name: 'Image à gauche',
    desc: 'Image en colonne gauche, textes à droite, détails pleine largeur dessous.',
    layout: {
      image: { x: 2, y: 8, w: 42, h: 50 },
      sticker: { x: 32, y: 44 },
      kicker: { x: 0, y: 3 },
      brand: { x: 48, y: 10, w: 49 },
      name: { x: 48, y: 14, w: 50 },
      description: { x: 48, y: 24, w: 50 },
      details: { x: 5, y: 62, w: 92 },
      ref: { x: 5, y: 90, w: 45 },
    },
    layoutWide: {},
  },
  {
    name: 'Prix en bandeau bas',
    desc: 'Le prix centré au bas de la fiche, réf. dans le coin gauche.',
    layout: {
      details: { x: 5, y: 66, w: 92 },
      ref: { x: 2, y: 93, w: 30 },
      price: { x: 50, y: 2, w: 60, ax: 'c', ay: 'b' },
    },
    layoutWide: {
      ref: { x: 2, y: 93, w: 24 },
      price: { x: 50, y: 2, w: 40, ax: 'c', ay: 'b' },
    },
  },
  {
    name: 'Focus visuel',
    desc: 'Grande image, prix posé dessus en haut à droite, textes condensés en bas.',
    layout: {
      image: { x: 2, y: 4, w: 96, h: 60 },
      sticker: { x: 6, y: 8 },
      price: { x: 3, y: 10, w: 40, ax: 'r', ay: 't' },
      brand: { x: 5, y: 66, w: 90 },
      name: { x: 5, y: 70, w: 92 },
      description: { x: 5, y: 78, w: 92 },
      details: { x: 5, y: 86, w: 92 },
      ref: { x: 5, y: 95, w: 45 },
    },
    layoutWide: {
      image: { x: 2, y: 8, w: 46, h: 88 },
      sticker: { x: 4, y: 14 },
      price: { x: 3, y: 12, w: 40, ax: 'r', ay: 't' },
      brand: { x: 52, y: 36, w: 45 },
      name: { x: 52, y: 42, w: 45 },
      description: { x: 52, y: 52, w: 45 },
      details: { x: 52, y: 68, w: 45 },
      ref: { x: 52, y: 90, w: 30 },
    },
  },
  {
    name: 'Fiche technique',
    desc: 'Petite image en haut à gauche, identité à droite, grande zone de détails.',
    layout: {
      image: { x: 2, y: 4, w: 44, h: 34 },
      sticker: { x: 34, y: 28 },
      brand: { x: 50, y: 6, w: 47 },
      name: { x: 50, y: 10, w: 48 },
      description: { x: 50, y: 20, w: 48 },
      details: { x: 2, y: 42, w: 96 },
      ref: { x: 2, y: 92, w: 45 },
    },
    layoutWide: {
      image: { x: 2, y: 8, w: 24, h: 56 },
      sticker: { x: 18, y: 50 },
      brand: { x: 29, y: 10, w: 45 },
      name: { x: 29, y: 15, w: 46 },
      description: { x: 29, y: 25, w: 46 },
      details: { x: 2, y: 60, w: 70 },
      ref: { x: 2, y: 90, w: 30 },
    },
  },
]
