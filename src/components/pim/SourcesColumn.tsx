// src/components/pim/SourcesColumn.tsx
import { useState, useMemo, useCallback } from 'react'
import { Search, X } from 'lucide-react'
import { usePimStore } from '@/stores/pim.store'
import { useRemoveSource } from '@/features/pim/useSources'
import { SourceItem } from './SourceItem'
import { SourceGroup } from './SourceGroup'
import { AddSourceMenu } from './AddSourceMenu'
import { SourceContextMenu } from './SourceContextMenu'
import { ScrapingModal } from '@/features/scraping/ScrapingModal'
import type { Source } from '@/features/pim/types'

interface Props {
  onPickImport: () => void
  onPickScrape: () => void
  onPickManual: () => void
}

const UNGROUPED = '__ungrouped__'

export function SourcesColumn({ onPickImport, onPickScrape, onPickManual }: Props) {
  const project = usePimStore((s) => {
    const id = s.currentProjectId
    return id ? s.projects.find((p) => p.id === id) : null
  })
  const selectedIds = usePimStore((s) => s.selectedSourceIds)
  const toggleSelected = usePimStore((s) => s.toggleSelectedSource)
  const removeSource = useRemoveSource(project?.id ?? '')

  const [filter, setFilter] = useState('')
  const [menu, setMenu] = useState<{ source: Source; x: number; y: number } | null>(null)
  const [resyncSource, setResyncSource] = useState<Source | null>(null)

  const grouped = useMemo(() => {
    if (!project) return new Map<string, Source[]>()
    const sources = project.sources.filter(
      (s) => !filter || s.name.toLowerCase().includes(filter.toLowerCase()),
    )
    const map = new Map<string, Source[]>()
    for (const s of sources) {
      const key = s.group ?? UNGROUPED
      const arr = map.get(key) ?? []
      arr.push(s)
      map.set(key, arr)
    }
    return map
  }, [project, filter])

  if (!project) {
    return (
      <aside className="w-[240px] shrink-0 border-r border-white/[0.06] bg-[#0f0f0f] p-3">
        <p className="text-[11px] text-white/30">Sélectionne un projet</p>
      </aside>
    )
  }

  const handleSelect = useCallback((sourceId: string) => {
    toggleSelected(sourceId)
  }, [toggleSelected])

  const handleContext = useCallback((source: Source) => (e: React.MouseEvent) => {
    setMenu({ source, x: e.clientX, y: e.clientY })
  }, [])

  const totalCount = project.sources.length

  return (
    <aside className="w-[240px] shrink-0 border-r border-white/[0.06] bg-[#0f0f0f] flex flex-col">
      <div className="p-2 border-b border-white/[0.06] space-y-2">
        <AddSourceMenu onPickImport={onPickImport} onPickScrape={onPickScrape} onPickManual={onPickManual} />
        <div className="flex items-center gap-1.5 bg-white/[0.04] border border-white/[0.06] rounded-md px-2 py-1">
          <Search className="w-3 h-3 text-white/30" />
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder={`Filtrer ${totalCount} sources…`}
            className="bg-transparent text-[11px] text-white/70 placeholder:text-white/25 outline-none flex-1"
          />
          {filter && (
            <button onClick={() => setFilter('')} className="text-white/30 hover:text-white/60">
              <X className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-2 py-2">
        {Array.from(grouped.entries()).map(([groupKey, sources]) => {
          const label = groupKey === UNGROUPED ? 'Sans groupe' : groupKey
          return (
            <SourceGroup key={groupKey} label={label} count={sources.length}>
              {sources.map((src) => (
                <SourceItem
                  key={src.id}
                  source={src}
                  selected={selectedIds.includes(src.id)}
                  onSelect={() => handleSelect(src.id)}
                  onContextMenu={handleContext(src)}
                />
              ))}
            </SourceGroup>
          )
        })}
        {project.sources.length === 0 && (
          <p className="text-[11px] text-white/30 px-2">Aucune source. Ajoutes-en une avec « + Source ».</p>
        )}
      </div>

      {resyncSource && (
        <ScrapingModal
          open={true}
          onClose={() => setResyncSource(null)}
          resyncSource={resyncSource}
        />
      )}

      {menu && (
        <SourceContextMenu
          x={menu.x}
          y={menu.y}
          onClose={() => setMenu(null)}
          onRename={() => alert('TODO: prompt rename — branché Phase 7')}
          onResync={() => setResyncSource(menu.source)}
          onMove={() => alert('TODO: move group — branché Phase 7')}
          onDelete={async () => {
            if (!confirm(`Supprimer la source « ${menu.source.name} » ? Les produits sans autre source seront perdus.`)) return
            await removeSource.mutateAsync(menu.source.id)
          }}
        />
      )}
    </aside>
  )
}
