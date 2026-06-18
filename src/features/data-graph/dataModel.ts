// src/features/data-graph/dataModel.ts
import type { Node, Edge } from '@xyflow/react'
import {
  FolderKanban, Globe, Package, Tags, ListTree,
  Database, Columns3, Rows3, Workflow as WorkflowIcon, Boxes,
  type LucideIcon,
} from 'lucide-react'
import type { DataCounts } from './useDataCounts'

export type DataDomain = 'pim' | 'bdd' | 'flow'

/** Couleur par domaine (réseau « très graphique », pas ERD). */
export const DOMAIN_HEX: Record<DataDomain, string> = {
  pim: '#6366f1',  // indigo — catalogue PIM
  bdd: '#38bdf8',  // sky — bases / feuilles
  flow: '#34d399', // emerald — workflows
}

export interface EntityNodeData {
  label: string
  subtitle: string
  icon: LucideIcon
  domain: DataDomain
  /** Compteur live (éléments chargés) ; undefined = inconnu/non chargé. */
  count?: number
  [k: string]: unknown
}

interface EntitySpec {
  id: string
  label: string
  subtitle: string
  icon: LucideIcon
  domain: DataDomain
  x: number
  y: number
  countKey?: keyof DataCounts
}

const ENTITIES: EntitySpec[] = [
  // ── PIM ──
  { id: 'project',  label: 'Projets',    subtitle: 'espaces de travail',   icon: FolderKanban, domain: 'pim', x: 40,  y: 40,  countKey: 'projects' },
  { id: 'source',   label: 'Sources',    subtitle: 'scrape · import · manuel', icon: Globe,    domain: 'pim', x: 340, y: -70, countKey: 'sources' },
  { id: 'product',  label: 'Produits',   subtitle: 'fiches master',        icon: Package,      domain: 'pim', x: 340, y: 150, countKey: 'products' },
  { id: 'field',    label: 'Champs PIM', subtitle: 'attributs · specs',    icon: ListTree,     domain: 'pim', x: 660, y: 40,  countKey: 'fields' },
  { id: 'taxonomy', label: 'Taxonomies', subtitle: 'arbre de classement',  icon: Tags,         domain: 'pim', x: 660, y: 250, countKey: 'taxonomies' },
  // ── BDD / feuilles ──
  { id: 'sheet',    label: 'Bases (BDD)', subtitle: 'feuilles de données', icon: Database,     domain: 'bdd', x: 40,  y: 360, countKey: 'sheets' },
  { id: 'column',   label: 'Colonnes',   subtitle: 'champs de feuille',    icon: Columns3,     domain: 'bdd', x: 340, y: 360, countKey: 'columns' },
  { id: 'row',      label: 'Lignes',     subtitle: 'enregistrements',      icon: Rows3,        domain: 'bdd', x: 340, y: 510, countKey: 'rows' },
  // ── Workflows ──
  { id: 'workflow', label: 'Workflows',  subtitle: 'pipelines',            icon: WorkflowIcon, domain: 'flow', x: 660, y: 460, countKey: 'workflows' },
  { id: 'node',     label: 'Nodes',      subtitle: 'étapes du flux',       icon: Boxes,        domain: 'flow', x: 940, y: 460 },
]

interface RelSpec {
  from: string
  to: string
  label: string
  fromSide: 'top' | 'right' | 'bottom' | 'left'
  toSide: 'top' | 'right' | 'bottom' | 'left'
  /** Relation transverse entre domaines (trait pointillé). */
  cross?: boolean
}

const RELATIONS: RelSpec[] = [
  { from: 'project',  to: 'source',   label: 'possède',       fromSide: 'right', toSide: 'left' },
  { from: 'project',  to: 'product',  label: 'contient',      fromSide: 'right', toSide: 'left' },
  { from: 'product',  to: 'field',    label: 'décrit par',    fromSide: 'right', toSide: 'left' },
  { from: 'product',  to: 'taxonomy', label: 'classé par',    fromSide: 'right', toSide: 'left' },
  { from: 'product',  to: 'source',   label: 'agrège',        fromSide: 'top',   toSide: 'bottom' },
  { from: 'sheet',    to: 'column',   label: 'structurée en', fromSide: 'right', toSide: 'left' },
  { from: 'sheet',    to: 'row',      label: 'contient',      fromSide: 'right', toSide: 'left' },
  { from: 'workflow', to: 'node',     label: 'composé de',    fromSide: 'right', toSide: 'left' },
  { from: 'workflow', to: 'product',  label: 'enrichit',      fromSide: 'left',  toSide: 'bottom', cross: true },
  { from: 'workflow', to: 'sheet',    label: 'alimente',      fromSide: 'left',  toSide: 'right', cross: true },
]

/** Construit les nœuds + arêtes du graphe de relations à partir des compteurs live. */
export function buildDataGraph(counts: DataCounts): { nodes: Node[]; edges: Edge[] } {
  const nodes: Node[] = ENTITIES.map((e) => ({
    id: e.id,
    type: 'entity',
    position: { x: e.x, y: e.y },
    draggable: true,
    data: {
      label: e.label,
      subtitle: e.subtitle,
      icon: e.icon,
      domain: e.domain,
      count: e.countKey ? counts[e.countKey] : undefined,
    } satisfies EntityNodeData,
  }))

  const edges: Edge[] = RELATIONS.map((r) => {
    const hex = DOMAIN_HEX[ENTITIES.find((e) => e.id === r.from)!.domain]
    return {
      id: `${r.from}-${r.to}`,
      source: r.from,
      target: r.to,
      sourceHandle: `s-${r.fromSide}`,
      targetHandle: `t-${r.toSide}`,
      type: 'smoothstep',
      label: r.label,
      animated: r.cross,
      labelShowBg: false,
      style: {
        stroke: hex,
        strokeWidth: 1.6,
        opacity: r.cross ? 0.5 : 0.8,
        strokeDasharray: r.cross ? '5 4' : undefined,
      },
      labelStyle: { fill: 'rgb(var(--base) / 0.55)', fontSize: 10, fontWeight: 500 },
    }
  })

  return { nodes, edges }
}
