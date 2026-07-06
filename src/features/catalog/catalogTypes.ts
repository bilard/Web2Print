// src/features/catalog/catalogTypes.ts
// Types du module Catalogue studio. Le moteur (catalogTree/catalogEngine) est pur :
// il ne dépend que de ces types + MergeRow/MergeColumn.
import type { DataSourceRef } from '@/stores/merge.store'
import type { PromoFieldKey, CustomFieldMap } from '@/features/retail-promo/promoTypes'

/** Densités de grille autorisées (produits par page). */
export const CATALOG_GRIDS = [1, 2, 3, 4, 6, 8] as const
export type CatalogGrid = (typeof CATALOG_GRIDS)[number]

/** Densité choisie dans l'UI : une grille fixe ou 'random' (variée page à page, déterministe). */
export type CatalogDensity = CatalogGrid | 'random'

/** [colonnes, lignes] de chaque densité — partagé moteur (packing) + rendu (CSS grid). */
export const GRID_DIMS: Record<CatalogGrid, [number, number]> = { 1: [1, 1], 2: [1, 2], 3: [1, 3], 4: [2, 2], 6: [2, 3], 8: [2, 4] }

/** ARCHÉTYPES de composition de couverture (le moteur créatif en choisit un) :
 *  classic = photo pleine page assombrie + textes bas-gauche (historique) ·
 *  panel = éditorial (bande latérale sombre + grand panneau accent chevauchant
 *  la photo + bandeau infos bas, façon maquettes print/Dribbble) ·
 *  poster = photo pleine page, titre GÉANT centré, minimal. */
export type CatalogCoverLayout = 'classic' | 'panel' | 'poster'

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

/** Objets de la fiche déplaçables/redimensionnables en mode « disposition libre ». */
export type CardObjectId =
  | 'promo' | 'image' | 'sticker' | 'kicker' | 'vedette'
  | 'brand' | 'name' | 'description' | 'ref' | 'unit' | 'price' | 'details'
export const CARD_OBJECT_IDS: CardObjectId[] = [
  'promo', 'image', 'sticker', 'kicker', 'vedette',
  'brand', 'name', 'description', 'ref', 'unit', 'price', 'details',
]
/** Boîte d'un objet en % de la carte (x/y = coin haut-gauche ; w/h optionnels ;
 * `sc` = mise à l'échelle uniforme de l'objet, 1 = taille naturelle). */
/** Boîte d'un objet en disposition libre (%). `m` = aimanté PAR BLOC (collé au bloc
 *  texte du dessus selon la volumétrie) ; absent = suit le défaut `magnetFlow`.
 *  `ax`/`ay` = ANCRAGE LIQUIDE aux bords de la fiche (façon InDesign) : 'r' = x
 *  devient l'écart au bord DROIT, 'b' = y l'écart au bord BAS, 'c' = centré —
 *  l'objet reste collé à son bord sur TOUTES les tailles de carte. */
/** `link` = LIAISON entre blocs : collé à DROITE du bloc cible (aligné en haut),
 *  il le suit dans tous ses déplacements (ex. unité soudée à la réf).
 *  ⚠ « Délié » se stocke `link: null`, JAMAIS undefined : stripUndefined retire la
 *  clé à la sauvegarde Firestore et le lien PAR DÉFAUT (unité→réf) reviendrait au
 *  rechargement — c'était la source des cycles réf↔unité fantômes.
 *  `lx`/`ly` = décalage (%) par rapport au point de soudure — le glisser d'un bloc
 *  lié ajuste ce décalage SANS rompre la liaison. */
/** `r` = ROTATION du bloc (°) — appliquée au conteneur (contenu compris), par variante. */
export interface CardBox { x: number; y: number; w?: number; h?: number; sc?: number; r?: number; m?: boolean; ax?: 'l' | 'c' | 'r'; ay?: 't' | 'c' | 'b'; link?: CardObjectId | null; lx?: number; ly?: number }

/** Style de PARAGRAPHE d'un bloc (barre du header de l'aperçu) : gras/italique/
 *  souligné FORCÉS (absent = défaut du template) + alignement du texte. */
export interface CardTextStyle { align?: 'l' | 'c' | 'r' | 'j'; bold?: boolean; italic?: boolean; underline?: boolean }

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
  /** Échelle de la zone « Détails » (champs libres, valeurs seules). */
  detailsScale: number
  /** Échelle de la pastille « Sous-famille » (kicker, pastille ET texte). */
  kickerScale: number
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
  /** Police de la zone « Détails » ('' = hérite du thème : texte). */
  detailsFont: string
  /** Police de la pastille « Sous-famille » ('' = hérite du thème : titres). */
  kickerFont: string
  /** Couleurs des objets ('' = hérite du thème). */
  promoBg: string
  stickerBg: string
  priceBg: string
  wasBg: string
  kickerBg: string
  nameColor: string
  /** Couleurs des TEXTES des badges ('' = blanc / encre du thème selon l'objet). */
  promoInk: string
  stickerInk: string
  kickerInk: string
  wasInk: string
  vedetteTxtInk: string
  /** Couleurs des textes de contenu ('' = hérite : accent pour la marque, encre sinon). */
  brandColor: string
  descColor: string
  refColor: string
  unitColor: string
  detailsColor: string
  /** Fond de la zone « Détails » ('' = gris translucide par défaut). */
  detailsBg: string
  /** Couleur de la vedette (ruban + cadre + nom de la fiche vedette). */
  vedetteBg: string
  /** Couleur du BADGE PRIX des fiches vedette ('' = couleur prix standard). */
  vedettePriceBg: string
  /** Couleur du TEXTE des badges prix ('' = blanc). */
  priceInk: string
  /** Couleur du TEXTE du prix des fiches vedette ('' = texte prix standard). */
  vedettePriceInk: string
  /** Fins de dégradé ('' = couleur unie) — combinées à la couleur de base de l'objet. */
  promoBg2: string
  stickerBg2: string
  priceBg2: string
  wasBg2: string
  kickerBg2: string
  vedetteBg2: string
  vedettePriceBg2: string
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
  /** Affichage de la zone « Détails » (champs libres, valeurs seules). */
  showDetails: boolean
  showImage: boolean
  showBrand: boolean
  showName: boolean
  showPrice: boolean
  /** Affichage du prix BARRÉ dans le badge prix (le prix de vente reste). */
  showWas: boolean
  /** Ids des champs libres MASQUÉS dans la zone « Détails » (ex. TVA) — optionnel (styles persistés anciens). */
  hiddenDetails?: string[]
  /** Paragraphe PAR BLOC (gras/italique/souligné/alignement) — optionnel (styles persistés anciens). */
  textStyle?: Partial<Record<CardObjectId, CardTextStyle>>
  /** Flux AIMANTÉ : les blocs texte se collent/poussent selon leur volumétrie — jamais de superposition ni de trou. Décoché = placement 100 % manuel. */
  magnetFlow: boolean
  /** Boîtes en % par objet (disposition libre — LE mode de rendu) ; absent = position de repli. */
  layout: Partial<Record<CardObjectId, CardBox>>
  /** Boîtes de la variante LARGE (fiches pleine largeur, repli 2 colonnes) —
   *  INDÉPENDANTES de `layout` : un drag fait sur la carte verticale ne déforme
   *  jamais la carte large, et réciproquement. Optionnel (styles persistés anciens). */
  layoutWide?: Partial<Record<CardObjectId, CardBox>>
}

export const DEFAULT_CARD_STYLE: CatalogCardStyle = {
  nameScale: 1, descScale: 1, priceScale: 1, brandScale: 1, refScale: 1, unitScale: 1, promoScale: 1, stickerScale: 1, vedetteScale: 1, detailsScale: 1, kickerScale: 1,
  nameFont: '', descFont: '', priceFont: '', brandFont: '', refFont: '', unitFont: '', promoFont: '', stickerFont: '', vedetteFont: '', detailsFont: '', kickerFont: '',
  promoBg: '', stickerBg: '', priceBg: '', wasBg: '', kickerBg: '', nameColor: '', vedetteBg: '', vedettePriceBg: '', priceInk: '', vedettePriceInk: '',
  promoInk: '', stickerInk: '', kickerInk: '', wasInk: '', vedetteTxtInk: '', brandColor: '', descColor: '', refColor: '', unitColor: '', detailsColor: '', detailsBg: '',
  promoBg2: '', stickerBg2: '', priceBg2: '', wasBg2: '', kickerBg2: '', vedetteBg2: '', vedettePriceBg2: '',
  vedetteLabel: 'Vedette',
  gradientAngle: 135,
  radius: 6, imageShare: 40, imagePad: 12,
  showDesc: true, showRef: true, showUnit: true, showSticker: true, showKicker: true, showPromo: true, showVedette: true, showDetails: true,
  showImage: true, showBrand: true, showName: true, showPrice: true, showWas: true, hiddenDetails: [], textStyle: {},
  magnetFlow: true, layout: {}, layoutWide: {},
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
  cover: { title: string; subtitle: string; baseline: string; imagePrompt: string; layout?: CatalogCoverLayout }
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
      /** Rangées RÉELLES de la page quand elles diffèrent du nominal GRID_DIMS —
       *  la grille s'étire pour honorer « N produits/page » malgré les grandes
       *  cartes (vedette 2×2, agrandissement prix). Absent = nominal. */
      rows?: number;
      /** Ids des nœuds taxonomiques représentés sur la page (chaînes univers→sous-famille) — navigation/stats du chemin de fer. */
      nodeIds?: string[];
      /** Bandeaux de SECTION : rangée (1-based) où démarre chaque sous-famille de la page. */
      groupRows?: { row: number; label: string }[] }
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
/** Charte graphique EXTRAITE des éléments joints (PDF/logo/visuels) — données
 *  seules, jamais de binaire (Firestore ≤ 1 MiB/doc). Alimente le thème ET le
 *  prompt du plan IA (moteur créatif). */
export interface CatalogCharte {
  files: string[]
  colors: string[]
  fonts: string[]
  /** Consignes libres de pilotage créa (graphique + structure). */
  notes: string
}

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
  /** Choix MANUELS de correspondance (survivent au re-devinage). */
  fieldMapOverrides: Partial<Record<PromoFieldKey, string>>
  /** Champs libres affichés en zone « détails » de la fiche. */
  customFields: CustomFieldMap
  format: CatalogFormat
  coverImageUrl: string | null
  backCoverImageUrl: string | null
  /** Ordre manuel des pages (clés stables du chemin de fer, cf. catalogFlatplan). Vide = ordre du moteur. */
  pageOrder: string[]
  /** Corrections produit propres à CE catalogue (édition double-clic, sauvegarde
   *  « publication ») : rowId → { colonne → valeur }. Absent sur les anciens docs. */
  rowOverrides?: Record<string, Record<string, string>>
  /** Charte extraite des éléments joints — absent sur les anciens docs. */
  charte?: CatalogCharte | null
}
