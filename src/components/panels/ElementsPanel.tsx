import { Square, Circle, Minus, Type, Image as ImageIcon } from 'lucide-react'
import { useAddObject } from '@/features/editor/useAddObject'

const shapes = [
  { icon: Square, label: 'Rectangle', type: 'rect' },
  { icon: Circle, label: 'Ellipse', type: 'ellipse' },
  { icon: Minus, label: 'Ligne', type: 'line' },
  { icon: Type, label: 'Texte', type: 'text' },
  { icon: ImageIcon, label: 'Image', type: 'image' },
]

export function ElementsPanel() {
  const { addObject } = useAddObject()

  return (
    <div className="p-3 flex flex-col gap-4">
      <p className="text-xs font-medium text-white/40 uppercase tracking-wider">Formes</p>
      <div className="grid grid-cols-2 gap-2">
        {shapes.map(({ icon: Icon, label, type }) => (
          <button
            key={type}
            onClick={() => addObject(type)}
            className="flex flex-col items-center gap-2 p-3 bg-white/5 hover:bg-white/10 border border-white/10 hover:border-indigo-500/50 rounded-lg transition-all group"
          >
            <Icon className="w-5 h-5 text-white/50 group-hover:text-indigo-400 transition-colors" />
            <span className="text-xs text-white/40 group-hover:text-white/70 transition-colors">{label}</span>
          </button>
        ))}
      </div>

    </div>
  )
}
