import {
  User, Shield, LayoutTemplate, Boxes, Package, Database, Tags,
  FileText, Workflow as WorkflowIcon, Play, Images, Activity, FileCode, Rows3,
  type LucideIcon,
} from 'lucide-react'
import { useLocaleStore } from '@/stores/locale.store'
import { refText } from '@/lib/i18n/refStrings'

type FieldType = 'string' | 'number' | 'boolean' | 'timestamp' | 'object' | 'array'
export type SchemaDomain = 'core' | 'design' | 'pim' | 'data' | 'flow' | 'brief'

/** Couleur par domaine du schéma (reprend la palette de l'app). */
export const DOMAIN_HEX: Record<SchemaDomain, string> = {
  core: '#6366f1',   // indigo — identité / RBAC
  design: '#f59e0b', // amber — projets design
  pim: '#a78bfa',    // violet — catalogue PIM
  data: '#38bdf8',   // sky — bases & médias
  flow: '#34d399',   // emerald — workflows
  brief: '#f472b6',  // pink — briefs commerciaux
}

export interface FieldSchema {
  name: string
  type: FieldType
  /** Clé primaire (souligné + badge PK). */
  pk?: boolean
  /** Clé étrangère → id d'une autre table (badge FK). */
  fk?: string
  /** Note humaine optionnelle, affichée dans la fiche d'inspection du champ. */
  note?: string
  /** Note EN — référentiel BILINGUE EN PLACE : c'est la documentation du schéma
   *  de données, pas du vocabulaire d'UI (même choix que `googleSheetsFunctions`). */
  noteEn?: string
}

/** Décrit comment charger les données live d'une table (scope owner courant).
 *  `path` peut contenir `{uid}` (sous-collection per-user). `ownerField` ajoute
 *  un `where(ownerField,'==',uid)`. Absente = table non interrogeable (pas de panneau). */
export interface QuerySpec {
  path: string
  ownerField?: string
  /** Sous-collection : agrège les sous-docs `path` de chaque parent possédé par le user
   *  (les règles interdisent un collectionGroup direct). Chargement one-shot (pas live). */
  subOf?: { parentPath: string; parentOwnerField: string }
  /** Champ contenant des feuilles `{columns, rows}` à APLATIR : le panneau affiche
   *  directement TOUTES les lignes produit (pas les docs conteneurs). Ex. `json`. */
  flattenSheets?: string
}

export interface TableSchema {
  id: string
  label: string
  icon: LucideIcon
  domain: SchemaDomain
  description: string
  /** Description EN (cf. `noteEn`). */
  descriptionEn: string
  fields: FieldSchema[]
  x: number
  y: number
  query?: QuerySpec
  /** Note affichée à la place de « double-clic » quand non interrogeable côté client. */
  serverNote?: string
}

export const TABLES: TableSchema[] = [
  {
    id: 'users', label: 'users', icon: User, domain: 'core', x: 560, y: 0,
    description: "Profils utilisateurs, secrets & réglages.", descriptionEn: "User profiles, secrets & settings.",
    query: { path: 'users' },
    fields: [
      { name: 'uid', type: 'string', pk: true, note: 'Identifiant Firebase Auth (doc id).', noteEn: 'Firebase Auth identifier (doc id).' },
      { name: 'email', type: 'string' },
      { name: 'displayName', type: 'string' },
      { name: 'accessRoleId', type: 'string', fk: 'roles', note: 'Rôle RBAC appliqué à l’utilisateur.', noteEn: 'RBAC role applied to the user.' },
      { name: 'uiSettings', type: 'object', note: 'Préférences UI (thème, etc.).', noteEn: 'UI preferences (theme, etc.).' },
      { name: 'aiSettings', type: 'object', note: 'Clés LLM, cascade et budgets.', noteEn: 'LLM keys, cascade and budgets.' },
    ],
  },
  {
    id: 'roles', label: 'roles', icon: Shield, domain: 'core', x: 960, y: -40,
    description: 'Rôles & permissions (RBAC).', descriptionEn: 'Roles & permissions (RBAC).',
    query: { path: 'roles' },
    fields: [
      { name: 'roleId', type: 'string', pk: true },
      { name: 'name', type: 'string' },
      { name: 'permissions', type: 'array' },
      { name: 'updatedAt', type: 'number' },
    ],
  },
  {
    id: 'projects', label: 'projects', icon: LayoutTemplate, domain: 'design', x: 120, y: 270,
    description: 'Documents design de l’éditeur.', descriptionEn: 'Design documents from the editor.',
    query: { path: 'projects', ownerField: 'ownerId' },
    fields: [
      { name: 'id', type: 'string', pk: true },
      { name: 'ownerId', type: 'string', fk: 'users' },
      { name: 'title', type: 'string' },
      { name: 'canvasWidth', type: 'number' },
      { name: 'canvasHeight', type: 'number' },
      { name: 'dpi', type: 'number' },
      { name: 'updatedAt', type: 'number' },
    ],
  },
  {
    id: 'pim_projects', label: 'pim_projects', icon: Boxes, domain: 'pim', x: 540, y: 320,
    description: 'Projets PIM (catalogue produits).', descriptionEn: 'PIM projects (product catalogue).',
    query: { path: 'pim_projects', ownerField: 'userId' },
    fields: [
      { name: 'id', type: 'string', pk: true },
      { name: 'userId', type: 'string', fk: 'users' },
      { name: 'name', type: 'string' },
      { name: 'sources', type: 'array' },
      { name: 'taxonomy', type: 'array' },
      { name: 'createdAt', type: 'number' },
    ],
  },
  {
    id: 'products', label: 'products', icon: Package, domain: 'pim', x: 540, y: 640,
    description: 'Fiches produit (sous-collection de pim_projects).', descriptionEn: 'Product records (a sub-collection of pim_projects).',
    query: { path: 'products', subOf: { parentPath: 'pim_projects', parentOwnerField: 'userId' } },
    fields: [
      { name: '_id', type: 'string', pk: true },
      { name: 'masterSku', type: 'string' },
      { name: 'masterEan', type: 'string' },
      { name: 'primarySourceId', type: 'string' },
      { name: 'fields', type: 'object' },
      { name: 'taxonomyPath', type: 'array' },
    ],
  },
  {
    id: 'taxonomies', label: 'taxonomies', icon: Tags, domain: 'pim', x: 980, y: 300,
    description: 'Arbres de classement & formulaires.', descriptionEn: 'Classification trees & forms.',
    query: { path: 'taxonomies', ownerField: 'ownerId' },
    fields: [
      { name: 'id', type: 'string', pk: true },
      { name: 'ownerId', type: 'string', fk: 'users' },
      { name: 'name', type: 'string' },
      { name: 'nodes', type: 'object' },
      { name: 'updatedAt', type: 'timestamp' },
    ],
  },
  {
    id: 'briefs', label: 'briefs', icon: FileText, domain: 'brief', x: 980, y: 600,
    description: 'Briefs commerciaux (devis → deck).', descriptionEn: 'Sales briefs (quote → deck).',
    query: { path: 'briefs', ownerField: 'ownerId' },
    fields: [
      { name: 'id', type: 'string', pk: true },
      { name: 'ownerId', type: 'string', fk: 'users' },
      { name: 'taxonomyId', type: 'string', fk: 'taxonomies' },
      { name: 'clientName', type: 'string' },
      { name: 'status', type: 'string' },
      { name: 'currentStep', type: 'number' },
    ],
  },
  {
    id: 'excel_data', label: 'excel_data', icon: Database, domain: 'data', x: 120, y: 600,
    description: 'Bases de données (métadonnées des feuilles BDD).', descriptionEn: 'Databases (metadata of the DB sheets).',
    query: { path: 'excel_data', ownerField: 'userId' },
    fields: [
      { name: 'docId', type: 'string', pk: true },
      { name: 'userId', type: 'string', fk: 'users' },
      { name: 'fileName', type: 'string' },
      { name: 'sheetCount', type: 'number' },
      { name: 'totalRows', type: 'number' },
      { name: 'updatedAt', type: 'number' },
    ],
  },
  {
    id: 'excel_data_payload', label: 'excel_data_payload', icon: Rows3, domain: 'data', x: -200, y: 620,
    description: 'Contenu des BDD — choisissez une base pour voir ses produits.', descriptionEn: 'Database contents — pick a database to see its products.',
    query: { path: 'excel_data_payload', ownerField: 'userId', flattenSheets: 'json' },
    fields: [
      { name: 'docId', type: 'string', pk: true },
      { name: 'userId', type: 'string', fk: 'users' },
      { name: 'json', type: 'array' },
    ],
  },
  {
    id: 'workflows', label: 'workflows', icon: WorkflowIcon, domain: 'flow', x: 1340, y: 120,
    description: 'Pipelines (users/{uid}/workflows).', descriptionEn: 'Pipelines (users/{uid}/workflows).',
    query: { path: 'users/{uid}/workflows' },
    fields: [
      { name: 'id', type: 'string', pk: true },
      { name: 'name', type: 'string' },
      { name: 'nodes', type: 'array' },
      { name: 'edges', type: 'array' },
      { name: 'updatedAt', type: 'number' },
    ],
  },
  {
    id: 'workflowRuns', label: 'workflowRuns', icon: Play, domain: 'flow', x: 1340, y: 420,
    description: 'Historique d’exécution des workflows.', descriptionEn: 'Workflow run history.',
    query: { path: 'users/{uid}/workflowRuns' },
    fields: [
      { name: 'id', type: 'string', pk: true },
      { name: 'workflowId', type: 'string', fk: 'workflows' },
      { name: 'status', type: 'string' },
      { name: 'trigger', type: 'string' },
      { name: 'durationMs', type: 'number' },
      { name: 'startedAt', type: 'number' },
    ],
  },
  {
    id: 'dam_assets', label: 'dam_assets', icon: Images, domain: 'data', x: 1340, y: 720,
    description: 'Bibliothèque média partagée (DAM).', descriptionEn: 'Shared media library (DAM).',
    query: { path: 'dam_assets' },
    fields: [
      { name: 'id', type: 'string', pk: true },
      { name: 'addedBy', type: 'string', fk: 'users' },
      { name: 'sourceProvider', type: 'string' },
      { name: 'description', type: 'string' },
      { name: 'tags', type: 'array' },
      { name: 'width', type: 'number' },
    ],
  },
  {
    id: 'scrapingTemplates', label: 'scrapingTemplates', icon: FileCode, domain: 'data', x: 120, y: 920,
    description: 'Modèles de scraping (partagés).', descriptionEn: 'Scraping templates (shared).',
    query: { path: 'scrapingTemplates' },
    fields: [
      { name: 'id', type: 'string', pk: true },
      { name: 'name', type: 'string' },
      { name: 'vendorDomain', type: 'string' },
      { name: 'fields', type: 'array' },
      { name: 'version', type: 'number' },
    ],
  },
  {
    id: 'pipelineRuns', label: 'pipelineRuns', icon: Activity, domain: 'flow', x: 560, y: 940,
    description: 'Journal des pipelines d’enrichissement.', descriptionEn: 'Enrichment pipeline log.',
    query: { path: 'pipelineRuns', ownerField: 'ownerId' },
    fields: [
      { name: 'id', type: 'string', pk: true },
      { name: 'ownerId', type: 'string', fk: 'users' },
      { name: 'module', type: 'string' },
      { name: 'status', type: 'string' },
      { name: 'durationMs', type: 'number' },
      { name: 'createdAt', type: 'number' },
    ],
  },
]

type Cardinality = '1:1' | '1:N' | 'N:1'

export interface RelationSpec {
  from: string
  to: string
  card: Cardinality
  fromSide: 'top' | 'right' | 'bottom' | 'left'
  toSide: 'top' | 'right' | 'bottom' | 'left'
  /** Relation de simple propriété (→ users) : trait atténué, pas de cardinalité affichée. */
  ownership?: boolean
}

export const RELATIONS: RelationSpec[] = [
  // ── Relations métier parlantes (trait plein + cardinalité) ──
  { from: 'briefs',       to: 'taxonomies',   card: '1:1', fromSide: 'top',   toSide: 'bottom' },
  { from: 'pim_projects', to: 'products',     card: '1:N', fromSide: 'bottom', toSide: 'top' },
  { from: 'workflows',    to: 'workflowRuns', card: '1:N', fromSide: 'bottom', toSide: 'top' },
  { from: 'excel_data',   to: 'excel_data_payload', card: '1:1', fromSide: 'left', toSide: 'right' },
  { from: 'users',        to: 'roles',        card: 'N:1', fromSide: 'right', toSide: 'left' },
  // ── Propriété (atténué) : users = hub ──
  { from: 'users', to: 'projects',     card: '1:N', fromSide: 'left',   toSide: 'top',   ownership: true },
  { from: 'users', to: 'pim_projects', card: '1:N', fromSide: 'bottom', toSide: 'top',   ownership: true },
  { from: 'users', to: 'excel_data',   card: '1:N', fromSide: 'left',   toSide: 'top',   ownership: true },
  { from: 'users', to: 'taxonomies',   card: '1:N', fromSide: 'right',  toSide: 'top',   ownership: true },
  { from: 'users', to: 'workflows',    card: '1:N', fromSide: 'right',  toSide: 'left',  ownership: true },
  { from: 'users', to: 'dam_assets',   card: '1:N', fromSide: 'right',  toSide: 'left',  ownership: true },
]

/** Description d'une table dans la langue courante (référentiel bilingue). */
export function tableDescription(table: TableSchema): string {
  return refText(table.description, table.descriptionEn, useLocaleStore.getState().locale)
}

/** Note d'un champ dans la langue courante. */
export function fieldNote(f: FieldSchema): string | undefined {
  if (f.note === undefined) return undefined
  return refText(f.note, f.noteEn ?? f.note, useLocaleStore.getState().locale)
}
