// Contrat du module BI : ce qu'une tuile VEUT SAVOIR, jamais comment le calculer.
//
// ⚠⚠ Toute spec entrant dans le module est validée ici — y compris celles écrites par une
// version antérieure et celles produites par un modèle de langage. Une spec non validée qui
// atteindrait le moteur produirait un chiffre faux sans le dire, ce qui est pire qu'une erreur.
import { z } from 'zod'

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

const measureRefSchema = z.object({ id: z.string().min(1), alias: z.string().optional() })

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
