import { MousePointer2, Type, Square, Circle, Image as ImageIcon } from 'lucide-react'

const tools = [
  { Icon: MousePointer2, label: 'Sélection' },
  { Icon: Type, label: 'Texte' },
  { Icon: Square, label: 'Rectangle' },
  { Icon: Circle, label: 'Ellipse' },
  { Icon: ImageIcon, label: 'Image' },
]

export function ToolBarMock() {
  return (
    <div className="w-11 bg-[#1a1a1a] border border-white/10 rounded-md flex flex-col items-center py-2 gap-0.5 pointer-events-none">
      {tools.map((t, i) => (
        <div
          key={i}
          className="w-[34px] h-[34px] flex items-center justify-center rounded-md text-white/60"
          title={t.label}
        >
          <t.Icon className="w-4 h-4" />
        </div>
      ))}
    </div>
  )
}
