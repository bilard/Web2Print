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

const SOURCE_IDS = [
  'pim.products', 'dam.assets', 'ai.usage', 'wf.runs', 'traffic.events', 'watch.listings',
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
export type DeclaredMeasureRef = z.infer<typeof declaredMeasureRefSchema>
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
 * avec rien (aucun id déclaré ne porte de deux-points).
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
  filters: z.array(filterSchema),
  sort: z.array(z.object({ by: z.string(), dir: z.enum(['asc', 'desc']) })).optional(),
  limit: z.number().int().positive().max(10_000).optional(),
})
export type QuerySpec = z.infer<typeof querySchema>

const TILE_KINDS = ['kpi', 'bar', 'line', 'area', 'pie', 'doughnut', 'table', 'pivot'] as const
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

const dashboardSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().optional(),
  accountId: z.string().min(1),
  workspaceUid: z.string().min(1),
  tiles: z.array(tileSchema),
  layout: z.array(placementSchema),
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
  version: z.number().int().positive(),
  createdAt: z.number(), updatedAt: z.number(), createdBy: z.string(),
})
export type Dashboard = z.infer<typeof dashboardSchema>

/**
 * Valide une spec venue de la base, d'un import ou d'un modèle. Lève avec un message
 * lisible — l'appelant l'affiche tel quel plutôt que de tomber en marche.
 */
export function parseDashboard(input: unknown): Dashboard {
  const d = dashboardSchema.parse(input)
  // ⚠ Une tuile sans emplacement n'apparaît nulle part : elle serait perdue en silence,
  // et la première réécriture de la mise en page l'effacerait pour de bon.
  const placed = new Set(d.layout.map((l) => l.tileId))
  const orphan = d.tiles.find((t) => !placed.has(t.id))
  if (orphan) throw new Error(`Tuile « ${orphan.title || orphan.id} » absente de la mise en page`)
  return d
}
