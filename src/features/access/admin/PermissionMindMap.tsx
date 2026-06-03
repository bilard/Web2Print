// src/features/access/admin/PermissionMindMap.tsx
import { useMemo } from 'react'
import {
  ReactFlow, Background, Controls, Handle, Position,
  type Node, type Edge, type NodeProps,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { Check, Lock } from 'lucide-react'
import { permissionParent, type PermissionDef } from '@/features/access/permissions'
import { moduleHex } from '@/features/access/moduleMeta'

interface MindData {
  kind: 'root' | 'module' | 'perm'
  label: string
  hex: string
  selected: boolean
  locked: boolean
  count?: string
  onToggle?: () => void
  [key: string]: unknown
}

function MindNode({ data }: NodeProps) {
  const d = data as MindData
  if (d.kind === 'root') {
    return (
      <div className="px-4 py-2 rounded-full bg-indigo-500 text-white text-sm font-bold shadow-[0_0_24px_rgba(99,102,241,0.4)] border border-indigo-300/40">
        {d.label || 'Rôle'}
        <Handle type="source" position={Position.Right} className="!w-1.5 !h-1.5 !border-0 !bg-indigo-300" />
      </div>
    )
  }
  if (d.kind === 'module') {
    return (
      <button onClick={d.onToggle}
        style={{ borderColor: d.hex, background: d.selected ? `${d.hex}26` : 'rgba(255,255,255,0.025)' }}
        className="px-3 py-1.5 rounded-lg border text-[12px] font-semibold inline-flex items-center gap-1.5 hover:brightness-125 transition">
        <Handle type="target" position={Position.Left} className="!w-1.5 !h-1.5 !border-0" style={{ background: d.hex }} />
        {d.selected && <Check className="w-3.5 h-3.5" style={{ color: d.hex }} />}
        <span style={{ color: d.selected ? d.hex : 'rgba(255,255,255,0.6)' }}>{d.label}</span>
        {d.count && <span className="text-[9px] text-white/35 tabular-nums">{d.count}</span>}
        <Handle type="source" position={Position.Right} className="!w-1.5 !h-1.5 !border-0" style={{ background: d.hex }} />
      </button>
    )
  }
  // perm leaf
  return (
    <button onClick={d.locked ? undefined : d.onToggle} disabled={d.locked}
      style={d.selected && !d.locked ? { borderColor: d.hex, background: `${d.hex}1f`, color: '#fff' } : {}}
      className={`px-2 py-1 rounded-md border text-[11px] inline-flex items-center gap-1 transition ${
        d.locked ? 'border-white/[0.07] text-white/20 cursor-not-allowed'
          : d.selected ? '' : 'border-white/15 text-white/55 hover:text-white/85'
      }`}>
      <Handle type="target" position={Position.Left} className="!w-1 !h-1 !border-0" style={{ background: d.locked ? '#3a3a3a' : d.hex }} />
      {d.locked ? <Lock className="w-2.5 h-2.5" /> : d.selected ? <Check className="w-2.5 h-2.5" /> : null}
      {d.label}
    </button>
  )
}

const nodeTypes = { mind: MindNode }

const ROW = 34
const MOD_GAP = 26
const X_MOD = 300
const X_PERM = 580

/** Carte mentale (mind map) de la matrice de rôle : centre « Rôle » → branches par module
 *  (couleur) → feuilles par action. Clic sur un nœud = bascule la permission. */
export function PermissionMindMap({
  roleName,
  entries,
  permissions,
  onToggle,
}: {
  roleName: string
  entries: [string, PermissionDef[]][]
  permissions: Set<string>
  onToggle: (key: string) => void
}) {
  const { nodes, edges, height } = useMemo(() => {
    const has = (k: string) => permissions.has(k)
    const nodes: Node[] = []
    const edges: Edge[] = []
    let y = 0
    const blocks = entries.map(([module, defs]) => {
      const viewDef = defs.find((d) => permissionParent(d.key) === null)
      const children = defs.filter((d) => permissionParent(d.key) !== null)
      const h = Math.max(1, children.length) * ROW
      const top = y
      y += h + MOD_GAP
      return { module, viewDef, children, top, h }
    })
    const totalH = Math.max(y - MOD_GAP, ROW)
    const hex = (m: string) => moduleHex(m)

    nodes.push({
      id: 'root', type: 'mind', position: { x: 0, y: totalH / 2 - 16 }, draggable: false,
      data: { kind: 'root', label: roleName.trim() || 'Rôle', hex: '#6366f1', selected: false, locked: false } satisfies MindData,
    })

    for (const b of blocks) {
      const c = hex(b.module)
      const viewKey = b.viewDef?.key
      const viewOn = viewKey ? has(viewKey) : true
      const sel = b.children.filter((d) => has(d.key)).length + (viewOn ? 1 : 0)
      const modId = `m-${b.module}`
      nodes.push({
        id: modId, type: 'mind', position: { x: X_MOD, y: b.top + b.h / 2 - 14 }, draggable: false,
        data: {
          kind: 'module', label: b.module, hex: c, selected: viewOn, locked: false,
          count: `${sel}/${b.children.length + 1}`,
          onToggle: viewKey ? () => onToggle(viewKey) : undefined,
        } satisfies MindData,
      })
      edges.push({ id: `e-root-${modId}`, source: 'root', target: modId, type: 'smoothstep', style: { stroke: c, strokeWidth: 2, opacity: viewOn ? 0.9 : 0.3 } })

      b.children.forEach((d, i) => {
        const pid = `p-${d.key}`
        nodes.push({
          id: pid, type: 'mind', position: { x: X_PERM, y: b.top + i * ROW }, draggable: false,
          data: { kind: 'perm', label: d.label, hex: c, selected: has(d.key), locked: !viewOn, onToggle: () => onToggle(d.key) } satisfies MindData,
        })
        edges.push({ id: `e-${modId}-${pid}`, source: modId, target: pid, type: 'smoothstep', style: { stroke: c, strokeWidth: 1.5, opacity: has(d.key) ? 0.8 : 0.25 } })
      })
    }
    return { nodes, edges, height: Math.min(Math.max(totalH + 60, 380), 680) }
  }, [entries, permissions, roleName, onToggle])

  return (
    <div className="rounded-xl border border-white/[0.06] bg-[#0c0c0c] overflow-hidden" style={{ height }}>
      <ReactFlow
        nodes={nodes} edges={edges} nodeTypes={nodeTypes}
        fitView fitViewOptions={{ padding: 0.15 }}
        nodesDraggable={false} nodesConnectable={false} elementsSelectable={false}
        zoomOnScroll={false} panOnScroll={false} preventScrolling={false} minZoom={0.3}
        proOptions={{ hideAttribution: true }}
      >
        <Background color="#1c1c1c" gap={20} />
        <Controls showInteractive={false} className="!bg-white/5 !border-white/10" />
      </ReactFlow>
    </div>
  )
}
