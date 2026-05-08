import { ChevronDown, ChevronRight, Folder, FolderOpen, Tag } from 'lucide-react'

type Node = { label: string; level: number; expanded?: boolean; active?: boolean; ancestor?: boolean; leaf?: boolean }

const nodes: Node[] = [
  { label: 'Outillage', level: 0, expanded: true, ancestor: true },
  { label: 'Électroportatif', level: 1, expanded: true, ancestor: true },
  { label: 'Perceuses', level: 2, expanded: true, ancestor: true },
  { label: 'Visseuses-perceuses', level: 3, active: true, leaf: true },
  { label: 'Marteaux perforateurs', level: 3, leaf: true },
  { label: 'Scies', level: 2 },
  { label: 'Mesure', level: 1 },
  { label: 'Plomberie', level: 0 },
]

const colorByLevel = ['text-indigo-300', 'text-violet-300', 'text-fuchsia-300', 'text-pink-300']

export function TaxonomyNavMock() {
  return (
    <div className="w-full max-w-[280px] bg-[#1a1a1a] border border-white/10 rounded-md overflow-hidden pointer-events-none">
      <div className="h-9 px-3 flex items-center gap-2 border-b border-white/5">
        <Tag className="w-3.5 h-3.5 text-indigo-400" />
        <span className="text-[11px] font-medium text-white/80 uppercase tracking-wider">Catégories</span>
      </div>
      <div className="py-1.5">
        {nodes.map((n, i) => {
          const Icon = n.expanded ? FolderOpen : n.leaf ? Tag : Folder
          const Chevron = n.expanded ? ChevronDown : ChevronRight
          const baseColor = n.active
            ? 'bg-indigo-500/15 text-indigo-200 border-l-2 border-indigo-400'
            : n.ancestor
            ? `${colorByLevel[n.level] || 'text-white/70'} bg-white/[0.02]`
            : 'text-white/50'
          return (
            <div
              key={i}
              className={`flex items-center gap-1.5 px-2 py-1 text-[11px] ${baseColor}`}
              style={{ paddingLeft: `${8 + n.level * 12}px` }}
            >
              {!n.leaf ? <Chevron className="w-3 h-3 text-white/30" /> : <span className="w-3" />}
              <Icon className="w-3 h-3 shrink-0" />
              <span className="truncate flex-1">{n.label}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
