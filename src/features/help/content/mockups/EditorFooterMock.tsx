import { ZoomIn, ZoomOut, Grid3X3, Magnet, Settings2 } from 'lucide-react'

export function EditorFooterMock() {
  return (
    <div className="w-full max-w-[440px] bg-[#1a1a1a] border border-white/10 rounded-md pointer-events-none">
      <div className="h-9 flex items-center px-3 gap-3">
        <div className="flex items-center gap-1">
          <div className="p-1 rounded text-white/30">
            <ZoomOut className="w-3.5 h-3.5" />
          </div>
          <div className="text-[11px] text-white/60 w-12 text-center font-mono">5%</div>
          <div className="p-1 rounded text-white/30">
            <ZoomIn className="w-3.5 h-3.5" />
          </div>
        </div>
        <div className="w-px h-4 bg-white/10" />
        <div className="flex items-center gap-1.5 text-[11px] font-mono px-2 py-1 rounded text-white/30">
          <Settings2 className="w-3 h-3" />
          3856 x 13641 px
        </div>
        <div className="flex-1" />
        <div className="flex items-center gap-1.5 text-[11px] px-2 py-1 rounded text-indigo-400 bg-indigo-500/10">
          <Grid3X3 className="w-3.5 h-3.5" />
          Grille
        </div>
        <div className="flex items-center gap-1.5 text-[11px] px-2 py-1 rounded text-white/30">
          <Magnet className="w-3.5 h-3.5" />
          Snap
        </div>
      </div>
    </div>
  )
}
