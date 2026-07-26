// GABARIT de la carte promo : identifiants des blocs et des sous-éléments texte,
// configuration du template (couleurs, polices, positions, visibilité).
//
// À distinguer de `promoTypes.ts`, qui décrit les DONNÉES SOURCE d'un produit
// (PromoFields, mécanique promo, champs libres).
//
// Ces types vivaient dans `RetailPromoCard.tsx`. Les en sortir casse le cycle
// `RetailPromoCard ↔ PromoSelectionOverlay` et évite qu'un module non visuel
// (API, store, export HTML) ne tire un composant React pour un simple type.
import type { GradientConfig } from '@/stores/editor.store'
import type { ConditionalRule } from '@/features/merge/conditionalRules'

export interface RetailCardData {
  name: string
  brand?: string
  ref?: string
  category?: string
  description?: string
  descriptionRich?: string
  priceNow: string
  priceWas?: string
  priceLabel?: string
  unitPrice?: string
  remiseLabel?: string
  validite?: string
  imageUrl?: string
  ean?: string
  unit?: string
  mentions?: string
  enseigne?: string
  /** Champs libres, valeurs seules (sans label), ordre = customFields. */
  details: string[]
}

export type PromoColorKey =
  | 'category' | 'name' | 'brand' | 'description'
  | 'priceLabel' | 'priceWas' | 'unitPrice' | 'priceNow' | 'footer'

export type PromoBlockId =
  | 'header' | 'image' | 'badge' | 'price' | 'footer' | 'details'
  | 'category' | 'name' | 'brand' | 'description'
  | 'priceLabel' | 'priceWas' | 'unitPrice' | 'priceNow'

/** Variantes de mise en page curées (structure graphique, pas seulement les couleurs). */
export const PROMO_LAYOUT_IDS = ['classique', 'photo-cover', 'prix-fort', 'minimal'] as const
export type PromoLayoutId = typeof PROMO_LAYOUT_IDS[number]
export const PROMO_LAYOUTS: { id: PromoLayoutId; label: string; hint: string }[] = [
  { id: 'classique', label: 'Classique', hint: 'En-tête / photo / bandeau prix empilés' },
  { id: 'photo-cover', label: 'Photo plein cadre', hint: 'Photo en fond, bandeaux en surimpression' },
  { id: 'prix-fort', label: 'Prix dominant', hint: 'Grand bloc prix en bas, gros chiffre' },
  { id: 'minimal', label: 'Minimal', hint: 'Fond blanc, filets accent, étiquette rayon' },
]

/** Réglages que le CSS ne peut pas surcharger (styles inline) : couleurs de texte + échelle du prix selon la variante. */
export interface LayoutTune {
  priceFontScale: number
  headerColor?: string   // texte de l'en-tête (surcharge idealText)
  categoryColor?: string // texte du chip catégorie
  priceColor?: string    // texte du bandeau prix
}

/** Caractéristiques typographiques + remplissage d'un sous-élément texte. */
export interface ElementStyle {
  fontFamily?: string
  fontSize?: number                 // px (priceNow : remplace la taille auto)
  fontWeight?: number               // 400…900
  fontStyle?: 'normal' | 'italic'
  textAlign?: 'left' | 'center' | 'right' | 'justify'
  letterSpacing?: number            // em
  lineHeight?: number               // sans unité
  textTransform?: 'none' | 'uppercase' | 'lowercase' | 'capitalize'
  width?: number                    // px (resize horizontal d'un texte → retour à la ligne)
  euroSep?: boolean                 // prix : « € » comme séparateur décimal (327€78)
  fillType?: 'solid' | 'gradient'
  fill?: string                     // couleur unie
  gradient?: GradientConfig
}

/** Remplissage de fond d'un bloc déco (PNG-safe, y compris dégradé). */
export interface BlockFill {
  fillType: 'solid' | 'gradient'
  fill?: string
  gradient?: GradientConfig
}

/** Attributs « forme » universels (texte ET bloc) : opacité, fusion, ombre, contour, rotation, ordre. */
export interface ShapeStyle {
  opacity?: number                                   // 0..1
  blendMode?: string                                 // mix-blend-mode (⚠ non rendu au PNG)
  rotation?: number                                  // degrés
  zIndex?: number                                    // ordre d'empilement
  shadow?: { x: number; y: number; blur: number; color: string } | null  // texte→text-shadow, bloc→box-shadow
  stroke?: { width: number; color: string } | null  // texte→-webkit-text-stroke, bloc→border
}

export interface PromoTemplateConfig {
  layout?: PromoLayoutId // variante de mise en page (défaut : classique)
  accent: string        // accroche + badge + bandeau prix
  headerBg: string      // bandeau d'en-tête + pied
  fontHeading: string   // nom / accroche / badge
  fontPrice: string     // prix
  colors: Partial<Record<PromoColorKey, string>> // surcharge couleur par donnée (legacy)
  styles?: Partial<Record<PromoColorKey, ElementStyle>> // caractéristiques typo/remplissage par donnée
  offsets: Partial<Record<PromoBlockId, { dx: number; dy: number }>> // déplacement par bloc
  scales?: Partial<Record<PromoBlockId, { sx: number; sy: number }>> // resize (échelle) par bloc déco
  blockFills?: Partial<Record<PromoBlockId, BlockFill>> // fond (uni/dégradé) des blocs déco
  shapes?: Partial<Record<PromoBlockId, ShapeStyle>> // opacité/fusion/ombre/contour/rotation/ordre
  hidden?: Partial<Record<PromoBlockId, boolean>> // visibilité par bloc (panneau Calques)
  rules?: Partial<Record<PromoBlockId, ConditionalRule[]>> // règles conditionnelles par élément
  showCategory: boolean
  showDescription: boolean
  showUnitPrice: boolean
  showBadge: boolean
  showFooter: boolean
}

/** Sous-éléments texte sélectionnables/stylables (typo + resize fontSize/largeur). */
export const STYLE_KEYS: PromoColorKey[] = [
  'category', 'name', 'brand', 'description',
  'priceLabel', 'priceWas', 'unitPrice', 'priceNow', 'footer',
]

export const FONT_OPTIONS = [
  'Montserrat', 'Oswald', 'Poppins', 'Archivo', 'Bebas Neue', 'Anton', 'Playfair Display', 'Inter',
  'Roboto', 'Lato', 'Raleway', 'Nunito', 'Rubik', 'Work Sans', 'Barlow Condensed', 'Jura',
] as const

export const DEFAULT_PROMO_CONFIG: PromoTemplateConfig = {
  layout: 'classique',
  accent: '#ef4444',
  headerBg: '#111827',
  fontHeading: 'Montserrat',
  fontPrice: 'Montserrat',
  colors: {},
  styles: {},
  offsets: {},
  scales: {},
  blockFills: {},
  shapes: {},
  hidden: {},
  rules: {},
  showCategory: true,
  showDescription: true,
  showUnitPrice: true,
  showBadge: true,
  showFooter: true,
}
