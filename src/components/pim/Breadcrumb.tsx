import { ChevronRight, X } from 'lucide-react'
import { usePimStore } from '@/stores/pim.store'

export function Breadcrumb() {
  const project = usePimStore((s) => {
    const id = s.currentProjectId
    return id ? s.projects.find((p) => p.id === id) : null
  })
  const selectedSourceIds = usePimStore((s) => s.selectedSourceIds)
  const setSelectedSourceIds = usePimStore((s) => s.setSelectedSourceIds)
  const taxoFilter = usePimStore((s) => s.taxonomyNavFilter)
  const setTaxoFilter = usePimStore((s) => s.setTaxonomyNavFilter)

  if (!project) return null

  const sources = selectedSourceIds
    .map((id) => project.sources.find((s) => s.id === id)?.name)
    .filter(Boolean) as string[]

  const sourcesLabel =
    sources.length === 0 ? null
    : sources.length === 1 ? sources[0]
    : `${sources.length} sources`

  return (
    <div className="px-4 py-2 border-b border-white/[0.06] flex items-center gap-2 text-[12px] flex-wrap">
      <span className="text-white/85">{project.name}</span>
      {sourcesLabel && (
        <>
          <ChevronRight className="w-3 h-3 text-white/30" />
          <span className="text-white/60">{sourcesLabel}</span>
          <button
            onClick={() => setSelectedSourceIds([])}
            className="text-white/30 hover:text-white/70"
            title="Retirer le filtre source"
          >
            <X className="w-3 h-3" />
          </button>
        </>
      )}
      {taxoFilter.map((seg, i) => (
        <span key={i} className="flex items-center gap-1">
          <ChevronRight className="w-3 h-3 text-white/30" />
          <span className="text-white/60">{seg}</span>
          {i === taxoFilter.length - 1 && (
            <button
              onClick={() => setTaxoFilter(taxoFilter.slice(0, -1))}
              className="text-white/30 hover:text-white/70"
              title="Remonter d'un niveau"
            >
              <X className="w-3 h-3" />
            </button>
          )}
        </span>
      ))}
    </div>
  )
}
