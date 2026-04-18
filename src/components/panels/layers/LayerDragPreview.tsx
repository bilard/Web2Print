import { LayerSwatch } from './LayerSwatch'
import { getDisplayName } from '@/features/editor/getDisplayName'
import type { CanvasObjectProps } from '@/stores/editor.store'

interface Props {
  obj: CanvasObjectProps
  columns: { key: string; label: string }[]
}

export function LayerDragPreview({ obj, columns }: Props) {
  const displayName = getDisplayName(obj, columns)
  return (
    <div className="flex items-center gap-1.5 px-3 py-1.5 bg-[#1a1a1a] border border-indigo-500/60 rounded shadow-2xl shadow-indigo-500/20 w-64">
      <LayerSwatch obj={obj} />
      <span className={`text-xs truncate flex-1 ${!obj.name ? 'italic text-white/50' : 'text-white/90'}`}>
        {displayName}
      </span>
    </div>
  )
}
