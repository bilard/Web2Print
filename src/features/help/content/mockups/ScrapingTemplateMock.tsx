import { MousePointer2, FileCode2, CheckCircle2 } from 'lucide-react'

export function ScrapingTemplateMock() {
  return (
    <div className="w-full max-w-[440px] bg-[#1a1a1a] border border-white/10 rounded-md overflow-hidden pointer-events-none">
      <div className="h-9 px-3 flex items-center gap-2 border-b border-white/5">
        <span className="text-[11px] font-medium text-white">Nicoll</span>
        <span className="text-[10px] text-white/40 font-mono">nicoll.fr</span>
        <div className="flex-1" />
        <div className="flex items-center gap-1 text-[10px] text-emerald-300">
          <CheckCircle2 className="w-3 h-3" />
          score 87
        </div>
      </div>
      <div className="flex border-b border-white/5">
        <div className="flex items-center gap-1.5 text-[10px] px-3 py-1.5 text-indigo-300 border-b-2 border-indigo-400">
          <MousePointer2 className="w-3 h-3" />
          Pointer & cliquer
        </div>
        <div className="flex items-center gap-1.5 text-[10px] px-3 py-1.5 text-white/40">
          <FileCode2 className="w-3 h-3" />
          Avancé (JSON)
        </div>
      </div>
      <div className="grid grid-cols-[1fr_120px]">
        <div className="p-3 bg-[#0a0a0a] border-r border-white/5">
          <div className="text-[9px] uppercase text-white/30 mb-1.5">Aperçu page</div>
          <div className="space-y-1.5">
            <div className="h-2 rounded bg-indigo-500/40 w-2/3" />
            <div className="h-1.5 rounded bg-white/10 w-1/3" />
            <div className="h-3 rounded bg-emerald-500/30 w-1/4 my-2" />
            <div className="h-1 rounded bg-white/10 w-full" />
            <div className="h-1 rounded bg-white/10 w-5/6" />
            <div className="h-1 rounded bg-white/10 w-4/6" />
          </div>
        </div>
        <div className="p-2 flex flex-col gap-1">
          <Field label="title" color="bg-indigo-500/30" />
          <Field label="brand" color="bg-violet-500/30" />
          <Field label="price" color="bg-emerald-500/30" />
          <Field label="description" color="bg-white/10" />
        </div>
      </div>
    </div>
  )
}

function Field({ label, color }: { label: string; color: string }) {
  return (
    <div className="flex items-center gap-1.5 px-1.5 py-1 rounded bg-white/[0.03] border border-white/5">
      <span className={`w-2 h-2 rounded-full ${color}`} />
      <span className="text-[10px] font-mono text-white/70 truncate">{label}</span>
    </div>
  )
}
