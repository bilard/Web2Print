import { Handle, Position, type NodeProps } from '@xyflow/react'
import { useThemeStore } from '@/stores/theme.store'
import { DOMAIN_HEX, type FieldSchema, type TableSchema } from './firestoreSchema'
import { useOpenSchema } from './TableSchemaPanel'
import type { TableNodeData } from './buildDiagram'
import { tableDescription } from './firestoreSchema'

const SIDES = [
  { side: 'top', pos: Position.Top },
  { side: 'right', pos: Position.Right },
  { side: 'bottom', pos: Position.Bottom },
  { side: 'left', pos: Position.Left },
] as const
const HANDLE_CLASS = '!w-1.5 !h-1.5 !border-0 !opacity-0'

function FieldRow({ f, table }: { f: FieldSchema; table: TableSchema }) {
  const openSchema = useOpenSchema()
  return (
    <button
      type="button"
      // `nodrag` : empêche ReactFlow de démarrer un déplacement de table au clic sur le champ.
      className="nodrag flex w-full items-center gap-2 border-t border-white/[0.06] px-3 py-1.5 text-left transition-colors hover:bg-white/[0.04]"
      onClick={(e) => {
        e.stopPropagation()
        openSchema(table.id, f.name)
      }}
    >
      {f.pk && <span className="rounded bg-amber-500/90 px-1 py-0.5 text-[8px] font-bold text-[#1a1206] tracking-wide">PK</span>}
      {f.fk && <span className="rounded bg-indigo-500/90 px-1 py-0.5 text-[8px] font-bold text-[#fff] tracking-wide">FK</span>}
      <span className={`flex-1 truncate font-mono text-[12px] ${f.pk ? 'text-white underline decoration-dotted underline-offset-2' : 'text-white/75'}`}>
        {f.name}
      </span>
      <span className="shrink-0 font-mono text-[11px] italic text-white/35">{f.type}</span>
    </button>
  )
}

/** Carte de table ERD : en-tête (icône + nom, indice double-clic si interrogeable),
 *  liste de TOUS les champs (PK/FK + type), pied = description. Lecture seule. */
export function TableNode({ data, selected }: NodeProps) {
  const { table } = data as TableNodeData
  const isLight = useThemeStore((s) => s.resolvedTheme === 'light')
  const hex = DOMAIN_HEX[table.domain]
  const Icon = table.icon
  const queryable = Boolean(table.query)

  return (
    <div
      style={{ borderColor: selected ? hex : `${hex}40`, boxShadow: selected ? `0 0 0 1px ${hex}, 0 8px 30px rgba(0,0,0,0.35)` : undefined }}
      className={`w-[252px] overflow-hidden rounded-2xl border bg-surface shadow-[0_4px_24px_rgba(0,0,0,0.28)] ${isLight ? '' : 'bg-surface/95'}`}
    >
      {SIDES.map(({ side, pos }) => (
        <div key={side}>
          <Handle id={`s-${side}`} type="source" position={pos} className={HANDLE_CLASS} isConnectable={false} />
          <Handle id={`t-${side}`} type="target" position={pos} className={HANDLE_CLASS} isConnectable={false} />
        </div>
      ))}

      {/* En-tête */}
      <div className="flex items-center gap-2 px-3 py-2.5" style={{ background: `${hex}1f` }}>
        <Icon className="h-4 w-4 shrink-0" style={{ color: hex }} />
        <span className="flex-1 truncate text-[14px] font-bold text-white">{table.label}</span>
        {queryable ? (
          <span className="shrink-0 text-[8px] font-bold tracking-widest text-white/30">DOUBLE-CLIC</span>
        ) : table.serverNote ? (
          <span className="shrink-0 rounded bg-white/[0.06] px-1.5 py-0.5 text-[8px] font-semibold text-white/35">{table.serverNote}</span>
        ) : null}
      </div>

      {/* Champs */}
      <div>
        {table.fields.map((f) => <FieldRow key={f.name} f={f} table={table} />)}
      </div>

      {/* Description */}
      <div className="border-t border-white/[0.06] px-3 py-2 text-[10px] italic text-white/35">{tableDescription(table)}</div>
    </div>
  )
}
