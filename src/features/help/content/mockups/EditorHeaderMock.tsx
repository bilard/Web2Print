import { ChevronLeft, Save, Download, Undo2, Redo2 } from 'lucide-react'

export function EditorHeaderMock() {
  return (
    <div className="w-full max-w-[480px] bg-[#1a1a1a] border border-white/10 rounded-md pointer-events-none">
      <div className="h-12 flex items-center px-3 gap-3">
        <div className="flex items-center gap-1.5 text-white/40">
          <ChevronLeft className="w-4 h-4" />
        </div>
        <div className="flex flex-col">
          <span className="text-xs text-white font-medium">Catalogue printemps 2026</span>
          <span className="text-[10px] text-white/40">Sauvegardé · à l'instant</span>
        </div>
        <div className="flex-1" />
        <div className="flex items-center gap-1 text-white/40">
          <div className="p-1.5 rounded hover:bg-white/5">
            <Undo2 className="w-3.5 h-3.5" />
          </div>
          <div className="p-1.5 rounded hover:bg-white/5">
            <Redo2 className="w-3.5 h-3.5" />
          </div>
        </div>
        <div className="w-px h-5 bg-white/10" />
        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded text-white/60 text-xs">
          <Save className="w-3.5 h-3.5" />
          Sauvegarder
        </div>
        <div className="flex items-center gap-1.5 bg-indigo-500 text-white text-xs font-medium px-3 py-1.5 rounded">
          <Download className="w-3.5 h-3.5" />
          Exporter
        </div>
      </div>
    </div>
  )
}
