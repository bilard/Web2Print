import { Globe, FileText, Edit3, Sparkles, MoreVertical } from 'lucide-react'
import type { Source } from '@/features/pim/types'
import { cn } from '@/lib/utils'

interface Props {
  source: Source
  selected: boolean
  onSelect: (e: React.MouseEvent) => void
  onContextMenu: (e: React.MouseEvent) => void
}

const KIND_ICONS = {
  scrape: Globe,
  import: FileText,
  manual: Edit3,
} as const

export function SourceItem({ source, selected, onSelect, onContextMenu }: Props) {
  const Icon = KIND_ICONS[source.kind]
  return (
    <button
      onClick={onSelect}
      onContextMenu={(e) => { e.preventDefault(); onContextMenu(e) }}
      className={cn(
        'group w-full flex items-center gap-2 px-2 py-1.5 text-[12px] rounded-md transition-colors',
        selected
          ? 'bg-indigo-500/15 text-indigo-200 border border-indigo-500/25'
          : 'text-white/60 hover:bg-white/[0.04] hover:text-white/80 border border-transparent',
      )}
    >
      <Icon className="w-3.5 h-3.5 shrink-0 opacity-60" />
      <span className="flex-1 truncate text-left">{source.name}</span>
      <span className="text-[10px] tabular-nums text-white/30">{source.productCount}</span>
      {source.enrichedCount > 0 && (
        <span className="flex items-center gap-0.5 text-[10px] text-indigo-300/70">
          <Sparkles className="w-2.5 h-2.5" /> {source.enrichedCount}
        </span>
      )}
      <MoreVertical
        className="w-3 h-3 opacity-0 group-hover:opacity-60 hover:opacity-100"
        onClick={(e) => { e.stopPropagation(); onContextMenu(e) }}
      />
    </button>
  )
}
