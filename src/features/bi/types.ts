// Contrat du module BI : ce qu'une tuile VEUT SAVOIR, jamais comment le calculer.
//
// ⚠⚠ Toute spec entrant dans le module est validée ici — y compris celles écrites par une
// version antérieure et celles produites par un modèle de langage. Une spec non validée qui
// atteindrait le moteur produirait un chiffre faux sans le dire, ce qui est pire qu'une erreur.
import { z } from 'zod'
import type { TranslationKey, TransParams } from '@/lib/i18n'

/**
 * Ce qu'une tuile a à DIRE (cadre vide, erreur), sous une forme qui traverse les modules
 * PURS du moteur sans les faire dépendre de l'interface.
 *
 * ⚠⚠ `kind: 'key'` porte une clé de catalogue et ses paramètres — la traduction est faite
 * par le COMPOSANT, au rendu. Deux raisons de ne pas traduire plus tôt :
 * - le moteur (`registry/`, `engine/`) est pur : y appeler `useTranslation` est impossible,
 *   et le `t()` de module figerait la langue et manquerait les surcharges de compte,
 *   hydratées après le premier rendu ;
 * - `useTileData` mémoïse son agrégation, et le `t` de `useTranslation` est une fermeture
 *   RECRÉÉE à chaque rendu : l'ajouter en dépendance ferait recalculer chaque tuile à
 *   chaque rendu — exactement la mémoïsation que le module protège partout ailleurs.
 *
 * `kind: 'raw'` reste pour les messages techniques déjà formés (exception inattendue), dont
 * l'internationalisation est hors périmètre : mieux vaut la cause exacte qu'une clé absente.
 */
export type BiMessage =
  | { kind: 'key'; key: TranslationKey; params?: TransParams }
  | { kind: 'raw'; text: string }

/** Erreur d'un module pur qui porte sa CLÉ plutôt que sa phrase. */
export class BiKeyedError extends Error {
  constructor(readonly messageKey: TranslationKey, readonly params?: TransParams) {
    // ⚠ Le `message` d'`Error` reste la clé : jamais affiché tel quel (l'appelant lit
    // `messageKey`), mais il rend une trace de pile lisible en développement.
    super(messageKey)
    this.name = 'BiKeyedError'
  }
}

/** Incrémenter à chaque changement INCOMPATIBLE du contrat (et écrire la migration). */
export const DASHBOARD_VERSION = 1

/** Marge sous la limite dure de Firestore (1 048 576 octets). */
export const MAX_DASHBOARD_BYTES = 900_000

/**
 * ⚠⚠ On AJOUTE ici, on ne retire jamais : `parseDashboard` refuse une source inconnue, et un
 * identifiant supprimé rendrait d'un coup illisibles tous les tableaux enregistrés qui le
 * portent. `watch.listings` reste donc, même remplacé par les trois sources de la veille
 * (`watch.summary` — la synthèse, `watch.catalog` — le catalogue source, `watch.site` — les
 * fiches d'un concurrent), dont les coûts de chargement diffèrent radicalement (spec, D2).
 */
const SOURCE_IDS = [
  'pim.products', 'dam.assets', 'ai.usage', 'wf.runs', 'traffic.events',
  'watch.listings', 'watch.summary', 'watch.catalog', 'watch.site',
] as const
export type SourceId = (typeof SOURCE_IDS)[number]

const FILTER_OPS = [
  'eq', 'ne', 'in', 'gt', 'gte', 'lt', 'lte', 'contains', 'between', 'empty', 'notEmpty',
] as const

const filterSchema = z.object({
  field: z.string().min(1),
  op: z.enum(FILTER_OPS),
  value: z.unknown().optional(),
})
export type FilterClause = z.infer<typeof filterSchema>

/** Agrégations qu'une mesure DÉRIVÉE d'une colonne peut appliquer. */
export const AGGREGATIONS = [
  'count', 'countDistinct', 'sum', 'avg', 'median', 'min', 'max', 'filledPct',
] as const
export type Aggregation = (typeof AGGREGATIONS)[number]

/**
 * Une tuile désigne sa mesure de DEUX façons, et les deux doivent coexister :
 * - `{ id }` — mesure DÉCLARÉE par la source, adossée à une fonction pure qui fait déjà
 *   autorité ailleurs (complétude, médiane d'écart, coût rattrapé) ;
 * - `{ field, agg }` — mesure DÉRIVÉE d'une colonne de la donnée, calculée par le moteur.
 *
 * ⚠⚠ L'union est ORDONNÉE : la forme déclarée d'abord. Tous les tableaux de bord déjà
 * enregistrés portent `{ id }` — les écarter les rendrait illisibles d'un coup.
 */
const declaredMeasureRefSchema = z.object({ id: z.string().min(1), alias: z.string().optional() })
const derivedMeasureRefSchema = z.object({
  field: z.string().min(1),
  agg: z.enum(AGGREGATIONS),
  alias: z.string().optional(),
})
const measureRefSchema = z.union([declaredMeasureRefSchema, derivedMeasureRefSchema])
export type MeasureRef = z.infer<typeof measureRefSchema>
export type DerivedMeasureRef = z.infer<typeof derivedMeasureRefSchema>

export function isDerivedMeasure(ref: MeasureRef): ref is DerivedMeasureRef {
  return 'field' in ref && 'agg' in ref
}

/**
 * Clé de la colonne de résultat portée par une mesure — c'est elle que `sort.by` désigne
 * dans les specs enregistrées.
 *
 * ⚠ Pour une mesure déclarée, elle reste `alias ?? id` : la changer casserait le tri de tous
 * les tableaux en base. La forme `agg:field` est NOUVELLE, elle n'entre donc en collision
 * avec rien (aucune source n'expose d'identifiant déclaré portant un deux-points).
 */
export function measureKey(ref: MeasureRef): string {
  if (ref.alias) return ref.alias
  return isDerivedMeasure(ref) ? `${ref.agg}:${ref.field}` : ref.id
}

/** `bucket` regroupe une dimension de TEMPS. Absent sur les autres. */
const dimensionRefSchema = z.object({
  id: z.string().min(1),
  bucket: z.enum(['day', 'week', 'month']).optional(),
})

const querySchema = z.object({
  source: z.enum(SOURCE_IDS),
  measures: z.array(measureRefSchema).min(1),
  dimensions: z.array(dimensionRefSchema),
  /**
   * Mesures montrées AU SURVOL seulement, jamais tracées comme série.
   *
   * ⚠⚠ OPTIONNEL, et il doit le rester : aucun tableau déjà enregistré ne le porte, et un
   * champ requis les rendrait tous illisibles d'un coup. Le moteur (`aggregate`) ne le
   * connaît pas : c'est `DashboardGrid` qui fusionne ces mesures dans `measures` avant le
   * calcul, et `ChartTile` qui les écarte des jeux de données pour ne les rendre qu'au
   * survol. Les laisser atteindre le moteur telles quelles en ferait des séries visibles.
   */
  tooltips: z.array(measureRefSchema).optional(),
  filters: z.array(filterSchema),
  sort: z.array(z.object({ by: z.string(), dir: z.enum(['asc', 'desc']) })).optional(),
  limit: z.number().int().positive().max(10_000).optional(),
})
export type QuerySpec = z.infer<typeof querySchema>

// ⚠ AJOUTER À LA FIN, jamais réordonner ni retirer : ces valeurs sont persistées dans les
// tuiles enregistrées, et un type disparu ferait rejeter tout le document par `parseDashboard`
// — le tableau de bord deviendrait invisible pour son auteur.
const TILE_KINDS = [
  'kpi', 'bar', 'line', 'area', 'pie', 'doughnut', 'table', 'pivot',
  'gauge', 'scatter', 'funnel', 'heatmap',
] as const
export type TileKind = (typeof TILE_KINDS)[number]

const tileSchema = z.object({
  id: z.string().min(1),
  kind: z.enum(TILE_KINDS),
  title: z.string(),
  query: querySchema,
  options: z.object({
    stacked: z.boolean().optional(),
    showTotals: z.boolean().optional(),
    /** Dimension portée en COLONNES du tableau croisé ; les autres restent en lignes. */
    pivotColumn: z.string().optional(),
  }).optional(),
  interactions: z.object({
    emitsFilter: z.boolean().optional(),
    drillPath: z.array(z.string()).optional(),
  }).optional(),
})
export type Tile = z.infer<typeof tileSchema>

const placementSchema = z.object({
  tileId: z.string().min(1),
  x: z.number().int().min(0), y: z.number().int().min(0),
  w: z.number().int().min(1), h: z.number().int().min(1),
})
export type TilePlacement = z.infer<typeof placementSchema>

/**
 * Une PAGE : ses tuiles et sa mise en page. Un tableau de bord en porte plusieurs, et les
 * onglets du pied les nomment.
 *
 * ⚠⚠ Le champ est OPTIONNEL sur le document, et il doit le rester : tous les tableaux déjà
 * enregistrés portent `tiles` + `layout` à la RACINE, sans la moindre page. `parseDashboard`
 * les normalise en une page unique — un champ requis les rendrait illisibles d'un coup.
 */
const pageSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  tiles: z.array(tileSchema),
  layout: z.array(placementSchema),
  /**
   * Filtres appliqués à TOUTES les tuiles de cette page — la portée intermédiaire entre le
   * visuel et le tableau de bord entier.
   *
   * ⚠ OPTIONNEL, et il doit le rester : les pages enregistrées avant cette portée n'en
   * portent pas, et un document que `parseDashboard` rejetterait disparaîtrait de la liste
   * de l'utilisateur sans un mot.
   */
  filters: z.array(filterSchema).optional(),
})
export type DashboardPage = z.infer<typeof pageSchema>

/** Identifiant donné à la page unique reconstituée depuis un document ANTÉRIEUR aux pages. */
export const FIRST_PAGE_ID = 'p1'

const dashboardSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().optional(),
  accountId: z.string().min(1),
  workspaceUid: z.string().min(1),
  /**
   * ⚠⚠ Racine = MIROIR de la première page, jamais une seconde vérité. Elle survit pour deux
   * raisons : les documents antérieurs ne portent qu'elle, et un onglet resté sur l'ancien
   * code pendant un déploiement continue d'y lire quelque chose de sensé plutôt que rien.
   * Toute écriture passe par `parseDashboard`, qui la recopie depuis `pages[0]`.
   */
  tiles: z.array(tileSchema),
  layout: z.array(placementSchema),
  pages: z.array(pageSchema).min(1).optional(),
  filters: z.array(filterSchema),
  /**
   * Nom de la feuille du module « Données » sur laquelle le tableau de bord a été CONSTRUIT.
   *
   * ⚠⚠ Les tuiles interrogent la feuille ACTIVE, et les identifiants de dimension sont les
   * intitulés de colonnes : deux feuilles aux mêmes en-têtes (un catalogue et celui d'un
   * concurrent — le cas normal) sont donc interchangeables sans que rien ne le signale. Un
   * tableau bâti sur l'une, rouvert avec l'autre active, recalcule dessus sous le même titre
   * et avec les mêmes libellés. Ce champ est la seule trace qui permette d'AVERTIR.
   *
   * ⚠ OPTIONNEL, et il doit le rester : les tableaux déjà enregistrés ne le portent pas, et
   * un champ requis les rendrait illisibles d'un coup (`parseDashboard` les écarterait tous).
   */
  sourceSheetName: z.string().optional(),
  /**
   * Base du module « Données » (`excel_data/{docId}`) qui alimente ce tableau de bord.
   *
   * ⚠⚠ Sans elle, les tuiles PIM lisaient la feuille OUVERTE AILLEURS : un utilisateur qui
   * gère dix bases devait aller ouvrir la bonne dans le module Données avant que ses chiffres
   * veuillent dire quelque chose. Le tableau désigne désormais la sienne, et la charge.
   *
   * ⚠ OPTIONNELLE, et elle doit le rester : aucun tableau déjà enregistré ne la porte, et un
   * champ requis les rendrait tous illisibles d'un coup. Absente, on retombe exactement sur
   * le comportement d'avant (la feuille active, quelle qu'elle soit).
   *
   * ⚠ Le NOM est conservé à côté de l'identifiant : il nomme la base dans un avertissement
   * (« base introuvable ») même quand la liste ne la contient plus. L'affichage courant, lui,
   * lit toujours le nom VIVANT de la liste — celui-ci a pu être renommé depuis.
   */
  sourceDbId: z.string().optional(),
  sourceDbName: z.string().optional(),
  version: z.number().int().positive(),
  createdAt: z.number(), updatedAt: z.number(), createdBy: z.string(),
})
/** ⚠ `pages` est optionnel À L'ENTRÉE, garanti À LA SORTIE : `parseDashboard` normalise. */
export type Dashboard = Omit<z.infer<typeof dashboardSchema>, 'pages'> & { pages: DashboardPage[] }

/** Ce qu'on a le droit d'ENVOYER à l'écriture : les pages y restent facultatives, puisque
 *  `parseDashboard` les reconstitue depuis la racine — c'est la forme d'un document ancien. */
export type DashboardDraft = z.infer<typeof dashboardSchema>

/**
 * Valide une spec venue de la base, d'un import ou d'un modèle. Lève avec un message
 * lisible — l'appelant l'affiche tel quel plutôt que de tomber en marche.
 *
 * ⚠⚠ NORMALISE au passage : un document antérieur aux pages (`tiles` + `layout` à la racine)
 * en ressort avec une page unique, et la racine est toujours recopiée depuis `pages[0]`.
 */
export function parseDashboard(input: unknown): Dashboard {
  const d = dashboardSchema.parse(input)
  const pages: DashboardPage[] = d.pages?.length
    ? d.pages
    : [{ id: FIRST_PAGE_ID, name: d.name, tiles: d.tiles, layout: d.layout }]

  // ⚠ L'onglet actif est désigné par son identifiant : deux pages homonymes rendraient le
  // choix ambigu, et une écriture atterrirait sur la mauvaise.
  if (new Set(pages.map((p) => p.id)).size !== pages.length) {
    throw new Error('Deux pages portent le même identifiant')
  }

  // ⚠ Une tuile sans emplacement n'apparaît nulle part : elle serait perdue en silence,
  // et la première réécriture de la mise en page l'effacerait pour de bon. La garde vaut
  // pour CHAQUE page — une page au fond du classeur est aussi facile à vider qu'une autre.
  for (const p of pages) {
    const placed = new Set(p.layout.map((l) => l.tileId))
    const orphan = p.tiles.find((t) => !placed.has(t.id))
    if (orphan) throw new Error(`Tuile « ${orphan.title || orphan.id} » absente de la mise en page`)
  }

  return { ...d, pages, tiles: pages[0].tiles, layout: pages[0].layout }
}

/** Le tableau de bord dont la page `pageId` a été modifiée. PUR — la racine reste en miroir. */
export function replacePage(
  d: Dashboard, pageId: string, patch: Partial<Omit<DashboardPage, 'id'>>,
): Dashboard {
  if (!d.pages.some((p) => p.id === pageId)) return d
  const pages = d.pages.map((p) => (p.id === pageId ? { ...p, ...patch } : p))
  return { ...d, pages, tiles: pages[0].tiles, layout: pages[0].layout }
}

/**
 * Le tableau de bord augmenté d'une page VIDE, nommée. PUR.
 *
 * ⚠ L'identifiant se dérive du RANG le plus élevé déjà pris, jamais du simple nombre de
 * pages : après une suppression, `p${n+1}` retomberait sur un identifiant encore vivant.
 */
export function appendPage(d: Dashboard, name: string): Dashboard {
  const taken = new Set(d.pages.map((p) => p.id))
  let n = d.pages.length + 1
  while (taken.has(`p${n}`)) n += 1
  return { ...d, pages: [...d.pages, { id: `p${n}`, name, tiles: [], layout: [] }] }
}
