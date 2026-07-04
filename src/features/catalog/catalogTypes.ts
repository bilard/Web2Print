// src/features/catalog/catalogTypes.ts
// Types du module Catalogue studio. Le moteur (catalogTree/catalogEngine) est pur :
// il ne dépend que de ces types + MergeRow/MergeColumn.
import type { DataSourceRef } from '@/stores/merge.store'
import type { PromoFieldKey } from '@/features/retail-promo/promoTypes'

/** Densités de grille autorisées (produits par page). */
export const CATALOG_GRIDS = [1, 2, 3, 4, 6, 8] as const
export type CatalogGrid = (typeof CATALOG_GRIDS)[number]

/** Densité choisie dans l'UI : une grille fixe ou 'random' (variée page à page, déterministe). */
export type CatalogDensity = CatalogGrid | 'random'

/** [colonnes, lignes] de chaque densité — partagé moteur (packing) + rendu (CSS grid). */
export const GRID_DIMS: Record<CatalogGrid, [number, number]> = { 1: [1, 1], 2: [1, 2], 3: [1, 3], 4: [2, 2], 6: [2, 3], 8: [2, 4] }

export interface CatalogFormat { widthMm: number; heightMm: number }

export const CATALOG_FORMAT_PRESETS: { id: string; label: string; format: CatalogFormat }[] = [
  { id: 'a4-portrait', label: 'A4 portrait', format: { widthMm: 210, heightMm: 297 } },
  { id: 'a4-paysage', label: 'A4 paysage', format: { widthMm: 297, heightMm: 210 } },
  { id: 'a5-portrait', label: 'A5 portrait', format: { widthMm: 148, heightMm: 210 } },
  { id: 'carre', label: 'Carré 21 cm', format: { widthMm: 210, heightMm: 210 } },
]

export interface CatalogTreeNode {
  /** Slug déterministe du chemin (ex. 'outillage/perceuses'). */
  id: string
  label: string
  /** 1 = univers, 2 = famille, 3 = sous-famille. */
  level: 1 | 2 | 3
  children: CatalogTreeNode[]
  /** _id des lignes rattachées à CE nœud (pas aux descendants). */
  productIds: string[]
}

export interface CatalogSectionPlan {
  nodeId: string
  productsPerPage: CatalogGrid
  /** Densité variée page à page (PRNG déterministe seedé par univers) — prime sur productsPerPage. */
  randomDensity?: boolean
  /** Produits vedette : grande carte 2×2 mise en avant AU SEIN de la page (design dédié). */
  featuredIds: string[]
  /** Couleur du CHAPITRE (section d'un univers) — '' = palette cyclique par défaut. */
  color?: string
}

export interface CatalogTheme {
  accent: string
  pageBg: string
  ink: string
  headerBg: string
  headerInk: string
  fontHeading: string
  fontBody: string
}

/**
 * Style COSMÉTIQUE des fiches : réglages bornés appliqués en variables CSS
 * par-dessus le template fluide (qui reste intouchable — packing, variantes
 * et export ne peuvent pas être cassés). '' = couleur héritée du thème.
 */
export interface CatalogCardStyle {
  /** Facteurs d'échelle typographique (1 = défaut), appliqués à toutes les variantes. */
  nameScale: number
  descScale: number
  priceScale: number
  brandScale: number
  refScale: number
  unitScale: number
  promoScale: number
  /** Échelle du sticker de remise (pastille ET texte). */
  stickerScale: number
  /** Échelle du ruban « Vedette » (texte + hauteur). */
  vedetteScale: number
  /** Polices par champ ('' = hérite du thème : titres pour nom/prix/cartouche, texte sinon). */
  nameFont: string
  descFont: string
  priceFont: string
  brandFont: string
  refFont: string
  unitFont: string
  promoFont: string
  stickerFont: string
  vedetteFont: string
  /** Couleurs des objets ('' = hérite du thème). */
  promoBg: string
  stickerBg: string
  priceBg: string
  wasBg: string
  kickerBg: string
  nameColor: string
  /** Couleur de la vedette (ruban + cadre + nom de la fiche vedette). */
  vedetteBg: string
  /** Fins de dégradé ('' = couleur unie) — combinées à la couleur de base de l'objet. */
  promoBg2: string
  stickerBg2: string
  priceBg2: string
  wasBg2: string
  kickerBg2: string
  vedetteBg2: string
  /** Texte du ruban vedette. */
  vedetteLabel: string
  /** Angle commun des dégradés (deg). */
  gradientAngle: number
  /** Rayon des cartes (px). */
  radius: number
  /** Largeur de la colonne image des cartes horizontales (%). */
  imageShare: number
  /** Marge interne du visuel dans son cadre (px) — petite marge = image plus grande. */
  imagePad: number
  /** Visibilité des éléments. */
  showDesc: boolean
  showRef: boolean
  showUnit: boolean
  showSticker: boolean
  showKicker: boolean
  showPromo: boolean
  showVedette: boolean
}

export const DEFAULT_CARD_STYLE: CatalogCardStyle = {
  nameScale: 1, descScale: 1, priceScale: 1, brandScale: 1, refScale: 1, unitScale: 1, promoScale: 1, stickerScale: 1, vedetteScale: 1,
  nameFont: '', descFont: '', priceFont: '', brandFont: '', refFont: '', unitFont: '', promoFont: '', stickerFont: '', vedetteFont: '',
  promoBg: '', stickerBg: '', priceBg: '', wasBg: '', kickerBg: '', nameColor: '', vedetteBg: '',
  promoBg2: '', stickerBg2: '', priceBg2: '', wasBg2: '', kickerBg2: '', vedetteBg2: '',
  vedetteLabel: 'Vedette',
  gradientAngle: 135,
  radius: 6, imageShare: 40, imagePad: 12,
  showDesc: true, showRef: true, showUnit: true, showSticker: true, showKicker: true, showPromo: true, showVedette: true,
}

/**
 * Style des ÉLÉMENTS DE PAGE (bandeau taxonomie, pied de page, ouvertures,
 * couverture, 4e) : mêmes principes que CatalogCardStyle — réglages bornés
 * appliqués en variables CSS + visibilité, le gabarit reste intouchable.
 */
export interface CatalogPageStyle {
  /** Bandeau taxonomie des pages produits. */
  showHeader: boolean
  headerScale: number
  /** Couleurs PAR CHAPITRE : bandeau + affiche d'ouverture prennent la couleur de l'univers (palette du chemin de fer) au lieu du bandeau du thème. */
  chapterColors: boolean
  /** Pied de page (folio + nom du catalogue). */
  showFooter: boolean
  showFooterName: boolean
  folioScale: number
  /** Affiche d'ouverture d'univers. */
  showOpenerNum: boolean
  showOpenerChip: boolean
  showOpenerCount: boolean
  showOpenerPanel: boolean
  openerTitleScale: number
  /** Couverture. */
  coverTitleScale: number
  showCoverBaseline: boolean
  showCoverSubtitle: boolean
  showCoverRule: boolean
  /** Assombrissement du visuel de couverture/4e (0–80 %). */
  coverOverlay: number
  /** 4e de couverture. */
  backScale: number
  showBackRule: boolean
}

export const DEFAULT_PAGE_STYLE: CatalogPageStyle = {
  showHeader: true, headerScale: 1, chapterColors: false,
  showFooter: true, showFooterName: true, folioScale: 1,
  showOpenerNum: true, showOpenerChip: true, showOpenerCount: true, showOpenerPanel: true, openerTitleScale: 1,
  coverTitleScale: 1, showCoverBaseline: true, showCoverSubtitle: true, showCoverRule: true, coverOverlay: 55,
  backScale: 1, showBackRule: true,
}

export interface CatalogPlan {
  theme: CatalogTheme
  /** Style cosmétique des fiches (couleurs/tailles/visibilité). Absent = défauts. */
  cardStyle?: CatalogCardStyle
  /** Style des éléments de page (bandeau/pied/ouvertures/couvertures). Absent = défauts. */
  pageStyle?: CatalogPageStyle
  /** Nom du dernier modèle appliqué ('' = aucun) — réaffiché dans le sélecteur de modèles. */
  appliedTemplate?: string
  /** Taille des fiches proportionnelle au prix (paliers médiane/P80 par univers). Absent = actif. */
  sizeByPrice?: boolean
  sections: CatalogSectionPlan[]
  cover: { title: string; subtitle: string; baseline: string; imagePrompt: string }
  backCover: { title: string; text: string }
  tocTitle: string
}

export interface TocEntry { nodeId: string; label: string; level: 1 | 2 | 3; pageNumber: number }
export interface ProductSlot {
  rowId: string
  featured: boolean
  /** Chemin taxonomique du produit (univers › famille › sous-famille) — affiché en kicker sur la fiche. */
  path: string[]
  /** Placement CSS grid (1-based) calculé par le packing du moteur. */
  col: number
  row: number
  colSpan: number
  rowSpan: number
}

/** Famille affichée sur la page d'ouverture d'univers (avec ses sous-familles). */
export interface OpenerFamily { label: string; count: number; subs: string[] }

export type CatalogPageDescriptor =
  | { kind: 'cover'; pageNumber: number }
  | { kind: 'toc'; pageNumber: number; entries: TocEntry[] }
  | { kind: 'opener'; pageNumber: number; nodeId: string; label: string; index: number; productCount: number; families: OpenerFamily[]; highlights: string[] }
  | { kind: 'products'; pageNumber: number; nodeId: string; breadcrumb: string[]; grid: CatalogGrid; slots: ProductSlot[];
      /** Ids des nœuds taxonomiques représentés sur la page (chaînes univers→sous-famille) — navigation/stats du chemin de fer. */
      nodeIds?: string[] }
  | { kind: 'back-cover'; pageNumber: number }

/** Colonnes mappées sur les 3 niveaux taxonomiques. */
export interface LevelKeys { univers?: string; famille?: string; sousFamille?: string }

/** Édits utilisateur de l'arbre, appliqués AVANT le regroupement (déterministe). */
export interface TreeEdits {
  /** `${level}:${labelOrigine}` → nouveau libellé. Deux libellés identiques au même parent fusionnent. */
  renames: Record<string, string>
  /** id de nœud parent ('' = racine) → ids enfants dans l'ordre voulu. */
  order: Record<string, string[]>
  /** rowId → chemin de labels cible (déplacement manuel d'un produit). */
  moves: Record<string, string[]>
}

/** Document Firestore users/{uid}/catalogs/{id}. Les lignes ne sont PAS persistées (rechargées via sourceRef). */
export interface CatalogDoc {
  id: string
  name: string
  sourceRef: DataSourceRef | null
  selectedRowIds: string[]
  levelKeys: LevelKeys
  treeEdits: TreeEdits
  prompt: string
  plan: CatalogPlan | null
  fieldMap: Partial<Record<PromoFieldKey, string>>
  format: CatalogFormat
  coverImageUrl: string | null
  backCoverImageUrl: string | null
  /** Ordre manuel des pages (clés stables du chemin de fer, cf. catalogFlatplan). Vide = ordre du moteur. */
  pageOrder: string[]
}
