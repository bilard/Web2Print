import { ZoomIn, ZoomOut, Grid3X3, Magnet, Settings2 } from 'lucide-react'
import { useUIStore } from '@/stores/ui.store'
import { PagesBar } from './PagesBar'
import { PageSettingsPopover } from '@/components/shared/PageSettingsPopover'

export function EditorFooter() {
  const { zoom, setZoom, gridVisible, setGridVisible, snapEnabled, setSnapEnabled, canvasWidth, canvasHeight, pageSettingsOpen, setPageSettingsOpen } = useUIStore()

  return (
    <footer className="shrink-0 bg-[#1a1a1a] border-t border-white/10 z-20">
      {/* Pages bar */}
      <div className="h-[70px] border-b border-white/5">
        <PagesBar />
      </div>

      {/* Controls bar */}
      <div className="h-9 flex items-center px-4 gap-4">
        <div className="flex items-center gap-1">
          <button onClick={() => setZoom(zoom - 10)}
            className="p-1 rounded text-white/30 hover:text-white hover:bg-white/10 transition-colors">
            <ZoomOut className="w-3.5 h-3.5" />
          </button>
          <button onClick={() => setZoom(100)}
            className="text-xs text-white/50 hover:text-white w-14 text-center font-mono hover:bg-white/5 rounded py-0.5 transition-colors">
            {zoom}%
          </button>
          <button onClick={() => setZoom(zoom + 10)}
            className="p-1 rounded text-white/30 hover:text-white hover:bg-white/10 transition-colors">
            <ZoomIn className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="w-px h-4 bg-white/10" />

        {/* Page settings trigger */}
        <div className="relative">
          <button onClick={() => setPageSettingsOpen(!pageSettingsOpen)}
            className={`flex items-center gap-1.5 text-xs font-mono px-2 py-1 rounded transition-colors ${pageSettingsOpen ? 'text-indigo-400 bg-indigo-500/10' : 'text-white/30 hover:text-white hover:bg-white/10'}`}
            title="Parametres de la page">
            <Settings2 className="w-3 h-3" />
            {canvasWidth} x {canvasHeight} px
          </button>
          <PageSettingsPopover />
        </div>

        <div className="flex-1" />

        <button onClick={() => setGridVisible(!gridVisible)}
          className={`flex items-center gap-1.5 text-xs px-2 py-1 rounded transition-colors ${gridVisible ? 'text-indigo-400 bg-indigo-500/10' : 'text-white/30 hover:text-white hover:bg-white/10'}`}>
          <Grid3X3 className="w-3.5 h-3.5" />
          Grille
        </button>

        <button onClick={() => setSnapEnabled(!snapEnabled)}
          className={`flex items-center gap-1.5 text-xs px-2 py-1 rounded transition-colors ${snapEnabled ? 'text-indigo-400 bg-indigo-500/10' : 'text-white/30 hover:text-white hover:bg-white/10'}`}>
          <Magnet className="w-3.5 h-3.5" />
          Snap
        </button>
      </div>
    </footer>
  )
}
