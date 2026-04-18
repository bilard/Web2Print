import { Eye, EyeOff, Trash2, Lock, Unlock, Circle, CircleDot } from 'lucide-react'
import { useLayers } from '@/features/editor/useLayers'
import type { CanvasObjectProps } from '@/stores/editor.store'

interface Props {
  obj: CanvasObjectProps
  isSelected: boolean
}

export function LayerRowControls({ obj, isSelected }: Props) {
  const { deleteLayer, toggleVisibility, lockLayer, toggleSelectionTarget } = useLayers()

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
        onClick={(e) => { e.stopPropagation(); lockLayer(obj.id, !obj.locked) }}
        className={`p-0.5 transition-all shrink-0 ${
          obj.locked
            ? 'text-amber-400/80 hover:text-amber-400'
            : 'text-white/30 hover:text-white/70 opacity-0 group-hover:opacity-100'
        }`}
        title={obj.locked ? 'Déverrouiller' : 'Verrouiller'}
      >
        {obj.locked ? <Lock className="w-3 h-3" /> : <Unlock className="w-3 h-3" />}
      </button>

      <button
        onClick={(e) => { e.stopPropagation(); toggleSelectionTarget(obj.id, e.shiftKey || e.metaKey || e.ctrlKey) }}
        className={`p-0.5 transition-colors shrink-0 ${isSelected ? 'text-indigo-400' : 'text-white/30 hover:text-white/60'}`}
        title="Cibler / multi-sélectionner (Shift ou Cmd)"
      >
        {isSelected ? <CircleDot className="w-3 h-3" /> : <Circle className="w-3 h-3" />}
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
