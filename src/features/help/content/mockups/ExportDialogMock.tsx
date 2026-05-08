import { FileText, Image as ImageIcon, Layout, FileCode2, Presentation, Scissors } from 'lucide-react'

const formats = [
  { Icon: FileText, label: 'PDF', desc: 'Imprimeur · BAT', active: true },
  { Icon: Layout, label: 'IDML', desc: 'InDesign' },
  { Icon: Presentation, label: 'PPTX', desc: 'Présentation' },
  { Icon: FileCode2, label: 'SVG', desc: 'Web · vectoriel' },
  { Icon: ImageIcon, label: 'PNG', desc: 'Vignette · social' },
]

export function ExportDialogMock() {
  return (
    <div className="w-full max-w-[360px] bg-[#1a1a1a] border border-white/10 rounded-lg overflow-hidden pointer-events-none">
      <div className="px-4 py-2.5 border-b border-white/10">
        <span className="text-xs font-medium text-white">Exporter</span>
      </div>
      <div className="p-3 grid grid-cols-2 gap-1.5">
        {formats.map((f, i) => (
          <div
            key={i}
            className={`flex items-center gap-2 p-2 rounded border ${
              f.active
                ? 'border-indigo-400/40 bg-indigo-500/10'
                : 'border-white/5 bg-white/[0.02]'
            }`}
          >
            <f.Icon className={`w-3.5 h-3.5 ${f.active ? 'text-indigo-300' : 'text-white/40'}`} />
            <div className="flex flex-col">
              <span className={`text-[11px] font-medium ${f.active ? 'text-indigo-200' : 'text-white/70'}`}>
                {f.label}
              </span>
              <span className="text-[9px] text-white/40">{f.desc}</span>
            </div>
          </div>
        ))}
      </div>
      <div className="border-t border-white/10 px-3 py-2.5 flex flex-col gap-1.5 bg-[#161616]">
        <Option Icon={Scissors} label="Marques de coupe" enabled />
        <Option Icon={Layout} label="Bleed 3 mm" enabled />
      </div>
      <div className="px-3 py-2 flex justify-end gap-2 border-t border-white/10">
        <div className="text-[11px] text-white/50 px-2.5 py-1 rounded">Annuler</div>
        <div className="text-[11px] text-white font-medium bg-indigo-500 px-3 py-1 rounded">Exporter</div>
      </div>
    </div>
  )
}

function Option({ Icon, label, enabled }: { Icon: typeof Scissors; label: string; enabled?: boolean }) {
  return (
    <div className="flex items-center gap-2 text-[10px]">
      <div
        className={`w-3 h-3 rounded border flex items-center justify-center ${
          enabled ? 'bg-indigo-500 border-indigo-400' : 'border-white/20'
        }`}
      >
        {enabled && <span className="text-white text-[8px] leading-none">✓</span>}
      </div>
      <Icon className={`w-3 h-3 ${enabled ? 'text-indigo-300' : 'text-white/40'}`} />
      <span className={enabled ? 'text-white/80' : 'text-white/40'}>{label}</span>
    </div>
  )
}
