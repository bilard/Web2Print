// src/features/data-graph/EntityNode.tsx
import { Handle, Position, type NodeProps } from '@xyflow/react'
import { useThemeStore } from '@/stores/theme.store'
import { DOMAIN_HEX, type EntityNodeData } from './dataModel'

const SIDES = [
  { side: 'top', pos: Position.Top },
  { side: 'right', pos: Position.Right },
  { side: 'bottom', pos: Position.Bottom },
  { side: 'left', pos: Position.Left },
] as const

const HANDLE_CLASS = '!w-1.5 !h-1.5 !border-0 !opacity-0'

/** Carte d'entité du graphe de relations (style réseau). Ancres invisibles sur les 4
 *  côtés (source + cible) pour router les arêtes selon la géométrie. Lecture seule. */
export function EntityNode({ data }: NodeProps) {
  const d = data as EntityNodeData
  const isLight = useThemeStore((s) => s.resolvedTheme === 'light')
  const hex = DOMAIN_HEX[d.domain]
  const Icon = d.icon
  const hasCount = typeof d.count === 'number'

  return (
    <div
      style={{ borderColor: `${hex}55`, background: isLight ? 'rgb(var(--surface))' : `${hex}14` }}
      className="w-[176px] rounded-xl border px-3 py-2.5 shadow-[0_2px_12px_rgba(0,0,0,0.18)] backdrop-blur-sm"
    >
      {SIDES.map(({ side, pos }) => (
        <div key={side}>
          <Handle id={`s-${side}`} type="source" position={pos} className={HANDLE_CLASS} isConnectable={false} />
          <Handle id={`t-${side}`} type="target" position={pos} className={HANDLE_CLASS} isConnectable={false} />
        </div>
      ))}

      <div className="flex items-center gap-2">
        <span
          style={{ background: `${hex}26`, color: hex }}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg"
        >
          <Icon className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[13px] font-semibold text-white">{d.label}</div>
          <div className="truncate text-[10px] text-white/40">{d.subtitle}</div>
        </div>
        {hasCount && (
          <span
            title="Éléments chargés en mémoire (pas un total global)"
            style={{ color: hex }}
            className="shrink-0 rounded-md bg-white/[0.06] px-1.5 py-0.5 text-[11px] font-bold tabular-nums"
          >
            {d.count}
          </span>
        )}
      </div>
    </div>
  )
}
