// src/features/access/admin/PermissionMindMap.tsx
import { useCallback, useEffect, useMemo, useRef } from 'react'
import {
  ReactFlow, Background, Panel, Handle, Position, useReactFlow, useStore,
  type Node, type Edge, type NodeProps, type NodeMouseHandler, type ReactFlowInstance,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { Check, Lock, Maximize } from 'lucide-react'
import { permissionParent, type PermissionDef } from '@/features/access/permissions'
import { moduleHex } from '@/features/access/moduleMeta'

interface MindData {
  kind: 'root' | 'module' | 'perm'
  label: string
  hex: string
  selected: boolean
  locked: boolean
  count?: string
  /** Clé de permission à basculer au clic (gérée par onNodeClick). Absente = racine. */
  permKey?: string
  [k: string]: unknown
}

// Layout TOP-DOWN : racine en haut → modules (largeur fixe) sur une ligne → actions
// en colonne indentée sous chaque module, reliées par une épine verticale + équerre.
const MOD_W = 158
const LEAF_W = 188

function MindNode({ data }: NodeProps) {
  const d = data as MindData
  if (d.kind === 'root') {
    return (
      <div className="px-4 py-2 rounded-full bg-indigo-500 text-white text-sm font-bold shadow-[0_0_24px_rgba(99,102,241,0.4)] border border-indigo-300/40">
        {d.label || 'Rôle'}
        <Handle type="source" position={Position.Bottom} className="!w-1.5 !h-1.5 !border-0 !bg-indigo-300" />
      </div>
    )
  }
  if (d.kind === 'module') {
    return (
      <div
        style={{ width: MOD_W, borderColor: d.hex, background: d.selected ? `${d.hex}26` : 'rgba(255,255,255,0.025)' }}
        className="cursor-pointer px-3 py-2 rounded-lg border text-[13px] font-semibold flex items-center justify-center gap-1.5 hover:brightness-125 transition">
        <Handle type="target" position={Position.Top} className="!w-1.5 !h-1.5 !border-0" style={{ background: d.hex }} />
        {d.selected && <Check className="w-3.5 h-3.5 shrink-0" style={{ color: d.hex }} />}
        <span style={{ color: d.selected ? d.hex : 'rgba(255,255,255,0.6)' }}>{d.label}</span>
        {d.count && <span className="text-[9px] text-white/35 tabular-nums">{d.count}</span>}
        <Handle type="source" position={Position.Bottom} className="!w-1.5 !h-1.5 !border-0" style={{ background: d.hex }} />
      </div>
    )
  }
  // perm leaf — largeur fixe, handle à GAUCHE (épine). Cliquable ; si verrouillé, le clic
  // active aussi le module parent (cascade).
  return (
    <div
      title={d.locked ? "Active aussi l'accès au module" : undefined}
      style={{ width: LEAF_W, ...(d.selected ? { borderColor: d.hex, background: `${d.hex}1f`, color: '#fff' } : {}) }}
      className={`cursor-pointer pl-2.5 pr-2 py-1.5 rounded-md border text-[11px] flex items-center gap-1.5 transition ${
        d.selected ? ''
          : d.locked ? 'border-white/[0.08] text-white/35 hover:text-white/70 hover:border-white/25'
            : 'border-white/12 text-white/55 hover:text-white/85 hover:border-white/30'
      }`}>
      <Handle type="target" position={Position.Left} className="!w-1 !h-1 !border-0" style={{ background: d.selected || !d.locked ? d.hex : '#3a3a3a' }} />
      {d.selected ? <Check className="w-2.5 h-2.5 shrink-0" style={{ color: d.hex }} />
        : d.locked ? <Lock className="w-2.5 h-2.5 opacity-50 shrink-0" /> : null}
      <span className="truncate">{d.label}</span>
    </div>
  )
}

const nodeTypes = { mind: MindNode }

const COL_W = 300
const Y_MOD = 120        // écart racine → module
const LEAF_GAP_TOP = 78  // écart module → 1re feuille
const ROW = 36           // espacement vertical compact entre options

/** Contrôles : curseur de zoom + recadrer (dark). */
function MindControls() {
  const { zoomTo, fitView } = useReactFlow()
  const zoom = useStore((s) => s.transform[2])
  return (
    <Panel position="bottom-left" className="!m-2 flex items-center gap-2 bg-[#161616]/95 border border-white/10 rounded-lg px-2.5 py-1.5 backdrop-blur">
      <button onClick={() => fitView({ padding: 0.18, duration: 250 })} title="Recadrer"
        className="text-white/50 hover:text-white transition-colors"><Maximize className="w-3.5 h-3.5" /></button>
      <input
        type="range" min={0.25} max={2} step={0.05} value={zoom}
        onChange={(e) => zoomTo(Number(e.target.value), { duration: 0 })}
        title="Zoom" className="w-36 accent-indigo-500 cursor-pointer" />
      <span className="text-[10px] text-white/40 tabular-nums w-8 text-right">{Math.round(zoom * 100)}%</span>
    </Panel>
  )
}

/** Carte mentale (mind map) horizontale de la matrice de rôle : racine « Rôle » en haut →
 *  branches par module (couleur) sur une ligne → feuilles par action en colonne dessous.
 *  Clic sur un nœud = bascule la permission (via onNodeClick de React Flow). */
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
  const wrapRef = useRef<HTMLDivElement>(null)
  const rfRef = useRef<ReactFlowInstance | null>(null)

  const { nodes, edges, contentW } = useMemo(() => {
    const has = (k: string) => permissions.has(k)
    const nodes: Node[] = []
    const edges: Edge[] = []
    const rowCenter = (i: number) => i * COL_W + MOD_W / 2 // épine verticale = centre du module
    // Étendue réelle du contenu : bord gauche = module 0 (x=0) ; bord droit = feuilles du dernier module.
    const contentW = Math.max((entries.length - 1) * COL_W + MOD_W / 2 + 22 + LEAF_W, MOD_W)
    const yLeaf0 = Y_MOD + LEAF_GAP_TOP

    nodes.push({
      id: 'root', type: 'mind', position: { x: contentW / 2 - 44, y: 0 }, draggable: false, selectable: false,
      data: { kind: 'root', label: roleName.trim() || 'Rôle', hex: '#6366f1', selected: false, locked: false } satisfies MindData,
    })

    entries.forEach(([module, defs], i) => {
      const spineX = rowCenter(i)
      const leafX = spineX + 22 // bord gauche des feuilles, juste à droite de l'épine
      const c = moduleHex(module)
      const viewDef = defs.find((d) => permissionParent(d.key) === null)
      const children = defs.filter((d) => permissionParent(d.key) !== null)
      const viewKey = viewDef?.key
      const viewOn = viewKey ? has(viewKey) : true
      const sel = children.filter((d) => has(d.key)).length + (viewOn ? 1 : 0)
      const modId = `m-${module}`
      nodes.push({
        id: modId, type: 'mind', position: { x: i * COL_W, y: Y_MOD }, draggable: false,
        data: { kind: 'module', label: module, hex: c, selected: viewOn, locked: false, count: `${sel}/${children.length + 1}`, permKey: viewKey } satisfies MindData,
      })
      edges.push({ id: `e-root-${modId}`, source: 'root', target: modId, type: 'smoothstep', style: { stroke: c, strokeWidth: 2, opacity: viewOn ? 0.9 : 0.3 } })

      children.forEach((d, j) => {
        const pid = `p-${d.key}`
        nodes.push({
          id: pid, type: 'mind', position: { x: leafX, y: yLeaf0 + j * ROW }, draggable: false,
          data: { kind: 'perm', label: d.label, hex: c, selected: has(d.key), locked: !viewOn, permKey: d.key } satisfies MindData,
        })
        edges.push({ id: `e-${modId}-${pid}`, source: modId, target: pid, type: 'smoothstep', style: { stroke: c, strokeWidth: 1.5, opacity: has(d.key) ? 0.7 : 0.22 } })
      })
    })
    return { nodes, edges, contentW }
  }, [entries, permissions, roleName])

  const onNodeClick: NodeMouseHandler = (_, node) => {
    const k = (node.data as MindData).permKey
    if (k) onToggle(k)
  }

  // Canvas plein écran (cf. CSS). L'arbre est calé à 100 % de la LARGEUR (modules
  // bord à bord, marge minime) et centré verticalement. Le curseur de zoom ajuste.
  const fitWidth = useCallback(() => {
    const el = wrapRef.current
    if (!el) return
    const w = el.clientWidth
    const m = 8
    const zoom = Math.min(Math.max((w - 2 * m) / contentW, 0.15), 1.6)
    const x = (w - contentW * zoom) / 2
    const y = 30 // ancré près du haut (pas centré bas)
    rfRef.current?.setViewport({ x, y, zoom }, { duration: 0 })
  }, [contentW])

  const onInit = useCallback((rf: ReactFlowInstance) => { rfRef.current = rf; fitWidth() }, [fitWidth])

  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const ro = new ResizeObserver(() => fitWidth())
    ro.observe(el)
    return () => ro.disconnect()
  }, [fitWidth])

  return (
    <div ref={wrapRef} className="rounded-xl border border-white/[0.06] bg-[#0c0c0c] overflow-hidden h-[calc(100vh-215px)] min-h-[520px]">
      <ReactFlow
        nodes={nodes} edges={edges} nodeTypes={nodeTypes}
        onNodeClick={onNodeClick}
        onInit={onInit}
        nodesDraggable={false} nodesConnectable={false}
        zoomOnScroll={false} panOnScroll={false} preventScrolling={false} minZoom={0.25} maxZoom={2}
        proOptions={{ hideAttribution: true }}
      >
        <Background color="#242424" gap={20} />
        <MindControls />
      </ReactFlow>
    </div>
  )
}
