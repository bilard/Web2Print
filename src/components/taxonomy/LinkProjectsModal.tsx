import { useState } from 'react'
import { X, Search } from 'lucide-react'
import { useLinkProject, useUnlinkProject } from '@/features/taxonomy/useTaxonomyMutations'
import { useTaxonomies } from '@/features/taxonomy/useTaxonomies'
import { useProjects } from '@/features/projects/useProjects'

interface LinkProjectsModalProps {
  open: boolean
  taxonomyId: string
  nodeId: string
  onClose: () => void
}

export function LinkProjectsModal({ open, taxonomyId, nodeId, onClose }: LinkProjectsModalProps) {
  const [search, setSearch] = useState('')
  const { data: projects } = useProjects()
  const { data: taxonomies } = useTaxonomies()
  const linkProject = useLinkProject()
  const unlinkProject = useUnlinkProject()

  if (!open) return null

  const taxonomy = taxonomies?.find((t) => t.id === taxonomyId)
  const node = taxonomy?.nodes[nodeId]
  const linkedIds = node?.linkedProjectIds ?? []

  const filtered = (projects ?? []).filter((p) =>
    p.title.toLowerCase().includes(search.toLowerCase())
  )

  const toggle = (projectId: string) => {
    if (linkedIds.includes(projectId)) {
      unlinkProject.mutate({ taxonomyId, nodeId, projectId })
    } else {
      linkProject.mutate({ taxonomyId, nodeId, projectId })
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" role="dialog" aria-labelledby="link-projects-title">
      <div className="bg-[#1a1a1a] border border-white/10 rounded-xl shadow-2xl w-[440px] max-h-[70vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.06]">
          <h2 id="link-projects-title" className="text-[14px] font-semibold text-white/90">
            Lier des projets
          </h2>
          <button onClick={onClose} className="text-white/30 hover:text-white/70 transition-colors" aria-label="Fermer">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="px-5 py-3 border-b border-white/[0.06]">
          <div className="flex items-center gap-2 bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-2">
            <Search className="w-3.5 h-3.5 text-white/25 flex-shrink-0" />
            <input
              type="text"
              placeholder="Filtrer les projets…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="flex-1 bg-transparent text-[12px] text-white/70 placeholder:text-white/25 outline-none"
            />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto py-1">
          {filtered.length === 0 ? (
            <p className="text-[11px] text-white/25 text-center py-6">Aucun projet</p>
          ) : (
            filtered.map((project) => {
              const isLinked = linkedIds.includes(project.id)
              return (
                <label
                  key={project.id}
                  className="flex items-center gap-3 px-5 py-2.5 hover:bg-white/[0.04] cursor-pointer transition-colors"
                >
                  <input
                    type="checkbox"
                    checked={isLinked}
                    onChange={() => toggle(project.id)}
                    className="w-4 h-4 rounded accent-teal-500"
                  />
                  <span className="text-[12px] text-white/70 flex-1 truncate">{project.title}</span>
                  {isLinked && (
                    <span className="text-[10px] text-teal-400/60 bg-teal-500/10 px-1.5 rounded-full">lié</span>
                  )}
                </label>
              )
            })
          )}
        </div>
        <div className="px-5 py-3 border-t border-white/[0.06]">
          <p className="text-[11px] text-white/30">
            {linkedIds.length} projet{linkedIds.length !== 1 ? 's' : ''} lié{linkedIds.length !== 1 ? 's' : ''}
          </p>
        </div>
      </div>
    </div>
  )
}
