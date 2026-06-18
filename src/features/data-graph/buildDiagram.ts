// src/features/data-graph/buildDiagram.ts
import type { Node, Edge } from '@xyflow/react'
import { TABLES, RELATIONS, DOMAIN_HEX, type TableSchema } from './firestoreSchema'

export interface TableNodeData {
  table: TableSchema
  [k: string]: unknown
}

const byId = new Map(TABLES.map((t) => [t.id, t]))

/** Construit les nœuds (cartes de table) + arêtes (relations) du diagramme ERD. */
export function buildDiagram(): { nodes: Node[]; edges: Edge[] } {
  const nodes: Node[] = TABLES.map((t) => ({
    id: t.id,
    type: 'table',
    position: { x: t.x, y: t.y },
    draggable: true,
    data: { table: t } satisfies TableNodeData,
  }))

  const edges: Edge[] = RELATIONS.map((r) => {
    const hex = DOMAIN_HEX[byId.get(r.from)?.domain ?? 'core']
    return {
      id: `${r.from}-${r.to}`,
      source: r.from,
      target: r.to,
      sourceHandle: `s-${r.fromSide}`,
      targetHandle: `t-${r.toSide}`,
      type: 'smoothstep',
      label: r.ownership ? undefined : r.card,
      labelShowBg: true,
      labelBgPadding: [6, 2] as [number, number],
      labelBgBorderRadius: 4,
      labelBgStyle: { fill: 'rgb(var(--surface))', fillOpacity: 0.95 },
      labelStyle: { fill: 'rgb(var(--base) / 0.85)', fontSize: 11, fontWeight: 700 },
      style: {
        stroke: hex,
        strokeWidth: r.ownership ? 1.2 : 2,
        opacity: r.ownership ? 0.35 : 0.85,
        strokeDasharray: '6 4',
      },
    }
  })

  return { nodes, edges }
}
