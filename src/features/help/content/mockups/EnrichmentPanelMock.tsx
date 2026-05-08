import { Sparkles, Wand2, CheckCircle2 } from 'lucide-react'

export function EnrichmentPanelMock() {
  return (
    <div className="w-full max-w-[320px] bg-[#1a1a1a] border border-white/10 rounded-md overflow-hidden pointer-events-none">
      <div className="h-9 px-3 flex items-center gap-2 border-b border-white/5">
        <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
        <span className="text-[11px] font-medium text-white/80">Enrichi par IA</span>
        <div className="flex-1" />
        <span className="text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-300 border border-emerald-500/20">
          Template
        </span>
      </div>
      <div className="p-3 flex flex-col gap-2.5">
        <div>
          <div className="text-[10px] uppercase tracking-wider text-white/40 mb-1">Source</div>
          <div className="text-[11px] text-white/70 truncate font-mono">nicoll.fr/connecto-3501</div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wider text-white/40 mb-1">Description</div>
          <div className="text-[11px] text-white/80 leading-relaxed bg-white/[0.03] rounded p-2 border border-white/5">
            Caniveau de jardin polypropylène anti-UV, classe A15, longueur 100 cm…
          </div>
        </div>
        <div className="flex items-center gap-1.5 text-[10px] text-emerald-400">
          <CheckCircle2 className="w-3 h-3" />
          12 champs extraits · score 87
        </div>
        <div className="flex items-center justify-center gap-1.5 bg-indigo-500 text-white text-[11px] font-medium py-1.5 rounded">
          <Wand2 className="w-3 h-3" />
          Réenrichir
        </div>
      </div>
    </div>
  )
}
