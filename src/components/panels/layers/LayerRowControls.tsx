import { Eye, EyeOff, Trash2 } from 'lucide-react'
import { useLayers } from '@/features/editor/useLayers'
import type { CanvasObjectProps } from '@/stores/editor.store'

interface Props {
  obj: CanvasObjectProps
}

export function LayerRowControls({ obj }: Props) {
  const { deleteLayer, toggleVisibility } = useLayers()

  return (
    <>
      <button
        onClick={(e) => { e.stopPropagation(); toggleVisibility(obj.id) }}
        className="p-0.5 text-white/40 hover:text-white/80 transition-colors shrink-0"
        title={obj.visible ? 'Masquer' : 'Afficher'}
      >
        {obj.visible ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3 text-white/20" />}
      </button>

      <button
        onClick={(e) => { e.stopPropagation(); deleteLayer(obj.id) }}
        className="p-0.5 text-white/20 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all shrink-0"
        title="Supprimer"
      >
        <Trash2 className="w-3 h-3" />
      </button>
    </>
  )
}
