/**
 * Types publics de la bibliothèque de templates.
 *
 * Un Template décrit une disposition de design product retail :
 *  - slots de contenu (texte/image) positionnés en coordonnées normalisées
 *  - SVG décoratif (motifs, cadres, dividers) paramétré par palette
 *  - palette par défaut (fallback si le LLM ne fournit rien)
 *
 * L'assembleur prend un template + un TemplateFillData + les dimensions
 * (widthMm, heightMm) et produit un SVG 100 % vectoriel éditable.
 */

/** Coordonnées normalisées dans [0, 1] — fraction de la dimension du canvas. */
export interface NormalizedBbox {
  x: number
  y: number
  w: number
  h: number
}

/** Référence vers une clé de palette, ou un hex littéral `#RRGGBB`. */
export type ColorRef =
  | 'primary'
  | 'secondary'
  | 'neutral'
  | 'text'
  | 'white'
  | 'black'
  | string

export interface TextSlot {
  bbox: NormalizedBbox
  role: 'title' | 'subtitle' | 'body' | 'price' | 'cta' | 'mention'
  fontFamily: 'hero' | 'body'
  /** Taille en pt, absolue — on suppose le template designé pour un A4 portrait
   *  de référence (210 mm × 297 mm). Pour d'autres dimensions, l'assembleur
   *  scale la taille au pro-rata de la surface (sqrt ratio). */
  fontSize: number
  fontWeight: number
  align: 'left' | 'center' | 'right'
  colorRef: ColorRef
  /** Si présent : fond coloré sous le texte (pour CTA, badges prix). */
  backgroundRef?: ColorRef
  /** Décoration du texte (prix barré). */
  decoration?: 'line-through' | 'underline'
  /** Taille minimum autorisée par l'auto-shrink. Défaut = fontSize. */
  minFontSize?: number
  /** Nombre de lignes visuelles max. Défaut = illimité. */
  maxLines?: number
  /** Contenu hard-codé quand le slot n'est PAS rempli par le LLM (rare —
   *  utile pour des étiquettes fixes "Prix barré" etc.). */
  hardcodedContent?: string
}

export interface ImageSlot {
  bbox: NormalizedBbox
  role: 'logo' | 'hero' | 'badge' | 'picto'
  preserveAspectRatio: 'contain' | 'cover'
  /** Paths SVG inline à utiliser si aucun asset scrapé n'est assigné au slot.
   *  Permet d'avoir des pictos décoratifs par défaut (ex: éclair, batterie). */
  fallbackPictoKey?: string
}

export interface FeatureItemSlot {
  /** bbox relative au conteneur du feature-list (coordonnées 0-1 dans l'item). */
  picto: {
    bbox: NormalizedBbox
    fallbackPictoKey: string
    /** Forme de fond du picto (cercle teal style Makita, carré rouge style Milwaukee, ou rien). */
    shape?: 'circle' | 'square' | 'none'
    /** Référence palette pour le fond (primary/secondary/neutral). */
    backgroundRef?: ColorRef
    /** Couleur du picto lui-même (par défaut 'text'). Quand backgroundRef est défini,
     *  utiliser 'neutral' pour contraster sur le fond coloré. */
    foregroundRef?: ColorRef
  }
  title: {
    bbox: NormalizedBbox
    fontSize: number
    fontWeight: number
    colorRef: ColorRef
  }
  desc: {
    bbox: NormalizedBbox
    fontSize: number
    fontWeight: number
    colorRef: ColorRef
  }
}

export interface FeatureListSlot {
  /** bbox du conteneur global de la liste, en coordonnées normalisées du canvas. */
  container: NormalizedBbox
  /** Layout : vertical stack ou grille 2 colonnes. */
  layout: 'vertical' | 'grid-2col'
  maxItems: number
  /** Gabarit d'un item — coordonnées normalisées dans l'item (0-1 × 0-1). */
  itemTemplate: FeatureItemSlot
}

export interface Palette {
  primary: string
  secondary: string
  neutral: string
  text: string
}

export interface Template {
  id: string
  label: string
  description: string
  /** Aspect ratio supporté : le template s'adapte si le canvas correspond. */
  aspectRatio: 'portrait' | 'landscape' | 'any'
  /** Famille de fonts : hero pour titres, body pour le corps. Les noms DOIVENT
   *  être dans `AVAILABLE_FONTS` de `src/features/assets/useFonts.ts`. */
  fonts: { hero: string; body: string }
  defaultPalette: Palette
  slots: {
    logo?: ImageSlot
    badge?: ImageSlot
    heroProduct: ImageSlot
    title: TextSlot
    subtitle?: TextSlot
    /** Accroche promo dans le header (ex: "PROFITEZ DE L'OFFRE MAKITA !"). Rempli via copy.tagline. */
    taglineHeader?: TextSlot
    features?: FeatureListSlot
    priceNew?: TextSlot
    priceOld?: TextSlot
    /** Label sous le prix barré (ex: "PRIX PUBLIC CONSEILLÉ"). Contenu hardcodé. */
    priceOldLabel?: TextSlot
    /** Label sous le prix promo (ex: "PRIX PROMO T.T.C."). Contenu hardcodé. */
    priceNewLabel?: TextSlot
    cta?: TextSlot
    mentions?: TextSlot
  }
  /** SVG décoratif (motifs, cadres, dividers) — coordonnées absolues en
   *  pourcentage (`%`) dans le viewBox. Peut contenir des variables
   *  `{{palette.primary}}` etc. que l'assembleur remplace. */
  decorativeSvg: string
}
