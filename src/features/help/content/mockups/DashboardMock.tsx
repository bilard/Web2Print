import { LayoutGrid, Plus, Database, Tags, Image as ImageIcon, Settings, FileUp } from 'lucide-react'

const projects = [
  { gradient: 'from-indigo-500/30 to-violet-500/30', name: 'Catalogue printemps' },
  { gradient: 'from-emerald-500/30 to-teal-500/30', name: 'Brochure Pro' },
  { gradient: 'from-rose-500/30 to-amber-500/30', name: 'PLV magasin' },
  { gradient: 'from-sky-500/30 to-cyan-500/30', name: 'Fiches produits' },
]

export function DashboardMock() {
  return (
    <div className="w-full max-w-[480px] bg-[#0f0f0f] border border-white/10 rounded-md overflow-hidden pointer-events-none">
      <div className="grid grid-cols-[120px_1fr]">
        <div className="bg-[#1a1a1a] border-r border-white/10 py-2 flex flex-col gap-0.5">
          <SideItem Icon={LayoutGrid} label="Projets" active />
          <SideItem Icon={Database} label="PIM" />
          <SideItem Icon={Tags} label="Taxonomies" />
          <SideItem Icon={ImageIcon} label="DAM" />
          <div className="h-px bg-white/5 my-1.5" />
          <SideItem Icon={FileUp} label="Importer" />
          <SideItem Icon={Settings} label="Paramètres" />
        </div>
        <div className="p-3">
          <div className="flex items-center gap-2 mb-2.5">
            <span className="text-[11px] font-medium text-white">Mes projets</span>
            <div className="flex-1" />
            <div className="flex items-center gap-1 bg-indigo-500 text-white text-[10px] px-2 py-1 rounded">
              <Plus className="w-3 h-3" />
              Nouveau
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {projects.map((p, i) => (
              <div key={i} className="rounded border border-white/10 overflow-hidden">
                <div className={`aspect-[4/3] bg-gradient-to-br ${p.gradient}`} />
                <div className="px-2 py-1 text-[10px] text-white/70 truncate bg-[#1a1a1a]">{p.name}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

function SideItem({ Icon, label, active }: { Icon: typeof LayoutGrid; label: string; active?: boolean }) {
  return (
    <div
      className={`flex items-center gap-2 px-3 py-1.5 text-[10px] ${
        active ? 'bg-indigo-500/10 text-indigo-300 border-l-2 border-indigo-400' : 'text-white/50'
      }`}
    >
      <Icon className="w-3 h-3" />
      <span>{label}</span>
    </div>
  )
}
