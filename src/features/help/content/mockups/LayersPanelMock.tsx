import { Eye, EyeOff, Type, Square, Image as ImageIcon, ChevronDown } from 'lucide-react'

const layers = [
  { Icon: Type, label: '{{title}}', visible: true, indent: 0, expanded: true },
  { Icon: Type, label: 'Référence', visible: true, indent: 1 },
  { Icon: Type, label: 'Prix', visible: true, indent: 1 },
  { Icon: ImageIcon, label: 'Photo produit', visible: true, indent: 0 },
  { Icon: Square, label: 'Bandeau couleur', visible: false, indent: 0 },
  { Icon: ImageIcon, label: 'Logo marque', visible: true, indent: 0 },
]

export function LayersPanelMock() {
  return (
    <div className="w-full max-w-[260px] bg-[#1a1a1a] border border-white/10 rounded-md pointer-events-none">
      <div className="h-9 px-3 flex items-center justify-between border-b border-white/5">
        <span className="text-[11px] font-medium text-white/80 uppercase tracking-wider">Calques</span>
        <span className="text-[10px] text-white/40">{layers.length}</span>
      </div>
      <div className="py-1">
        {layers.map((l, i) => (
          <div
            key={i}
            className={`flex items-center gap-2 px-3 py-1.5 text-[11px] ${
              i === 0 ? 'bg-indigo-500/10 text-indigo-300' : 'text-white/70'
            }`}
            style={{ paddingLeft: `${12 + l.indent * 14}px` }}
          >
            {l.expanded ? <ChevronDown className="w-3 h-3 text-white/40" /> : <span className="w-3" />}
            <l.Icon className="w-3 h-3 shrink-0" />
            <span className="flex-1 truncate">{l.label}</span>
            {l.visible ? (
              <Eye className="w-3 h-3 text-white/40" />
            ) : (
              <EyeOff className="w-3 h-3 text-white/20" />
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
