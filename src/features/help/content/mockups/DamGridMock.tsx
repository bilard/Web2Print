import { Image as ImageIcon, Search, Sparkles, Upload } from 'lucide-react'

const tiles = [
  { gradient: 'from-rose-500/40 to-amber-500/40', label: 'Logo' },
  { gradient: 'from-emerald-500/40 to-teal-500/40', label: 'Photo' },
  { gradient: 'from-sky-500/40 to-indigo-500/40', label: 'IA' },
  { gradient: 'from-fuchsia-500/40 to-pink-500/40', label: 'Variant' },
  { gradient: 'from-orange-500/40 to-red-500/40', label: 'Photo' },
  { gradient: 'from-violet-500/40 to-purple-500/40', label: 'IA' },
]

export function DamGridMock() {
  return (
    <div className="w-full max-w-[400px] bg-[#1a1a1a] border border-white/10 rounded-md overflow-hidden pointer-events-none">
      <div className="h-9 px-3 flex items-center gap-2 border-b border-white/5">
        <ImageIcon className="w-3.5 h-3.5 text-indigo-400" />
        <span className="text-[11px] font-medium text-white/80">Bibliothèque</span>
        <div className="flex-1" />
        <div className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded text-white/50 bg-white/[0.04]">
          <Search className="w-2.5 h-2.5" />
          Rechercher
        </div>
        <div className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded text-indigo-300 bg-indigo-500/10">
          <Sparkles className="w-2.5 h-2.5" />
          Générer
        </div>
        <div className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded text-emerald-300 bg-emerald-500/10">
          <Upload className="w-2.5 h-2.5" />
          Upload
        </div>
      </div>
      <div className="p-2 grid grid-cols-3 gap-1.5">
        {tiles.map((t, i) => (
          <div key={i} className={`aspect-square rounded bg-gradient-to-br ${t.gradient} border border-white/10 flex items-end p-1`}>
            <span className="text-[9px] text-white/80 px-1 py-0.5 rounded bg-black/30">{t.label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
