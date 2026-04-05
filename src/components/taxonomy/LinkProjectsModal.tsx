// src/components/taxonomy/LinkProjectsModal.tsx
import { useState } from 'react'
import { X, FileImage, Search, Link } from 'lucide-react'
import { useProjects } from '@/features/projects/useProjects'
import {
  useLinkProject,
  useUnlinkProject,
} from '@/features/taxonomy/useTaxonomyMutations'
import type { Taxonomy } from '@/features/taxonomy/types'

interface LinkProjectsModalProps {
  open: boolean
  taxonomyId: string
  nodeId: string | null
  taxonomy: Taxonomy | null
  onClose: () => void
}

export function LinkProjectsModal({
  open,
  taxonomyId,
  nodeId,
  taxonomy,
  onClose,
}: LinkProjectsModalProps) {
  const [search, setSearch] = useState('')
  const { data: projects } = useProjects()
  const link = useLinkProject()
  const unlink = useUnlinkProject()

  if (!open || !nodeId || !taxonomy) return null

  const node = taxonomy.nodes[nodeId]
  if (!node) return null

  const filtered = (projects ?? []).filter((p) =>
    p.title.toLowerCase().includes(search.toLowerCase())
  )

  const isLinked = (projectId: string) =>
    node.linkedProjectIds.includes(projectId)

  const handleToggle = (projectId: string) => {
    if (isLinked(projectId)) {
      unlink.mutate({ taxonomyId, nodeId, projectId })
    } else {
      link.mutate({ taxonomyId, nodeId, projectId })
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div
        role="dialog"
        aria-labelledby="link-modal-title"
        aria-modal="true"
        className="bg-[#1a1a1a] border border-white/10 rounded-xl shadow-2xl w-[440px] max-h-[70vh] flex flex-col"
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.06]">
          <div>
            <h2
              id="link-modal-title"
              className="text-[14px] font-semibold text-white/90 flex items-center gap-2"
            >
              <Link className="w-4 h-4 text-teal-400" />
              Lier des projets
            </h2>
            <p className="text-[11px] text-white/35 mt-0.5 truncate max-w-[320px]">
              {node.label}
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-white/30 hover:text-white/70 transition-colors"
            aria-label="Fermer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="px-4 py-3 border-b border-white/[0.06]">
          <div className="flex items-center gap-2 bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-2">
            <Search className="w-3.5 h-3.5 text-white/25" />
            <input
              type="text"
              placeholder="Rechercher un projet…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="flex-1 bg-transparent text-[12px] text-white/70 placeholder:text-white/25 outline-none"
            />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto px-4 py-2">
          {filtered.length === 0 ? (
            <p className="text-[12px] text-white/30 text-center py-6">Aucun projet trouvé</p>
          ) : (
            filtered.map((project) => {
              const linked = isLinked(project.id)
              return (
                <label
                  key={project.id}
                  className={`flex items-center gap-3 p-2.5 rounded-lg cursor-pointer transition-colors ${
                    linked ? 'bg-teal-500/10 hover:bg-teal-500/15' : 'hover:bg-white/[0.04]'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={linked}
                    onChange={() => handleToggle(project.id)}
                    className="w-3.5 h-3.5 rounded accent-teal-500"
                  />
                  <div className="w-8 h-8 bg-[#111] rounded-md flex items-center justify-center flex-shrink-0 overflow-hidden">
                    {(project as { thumbnail?: string }).thumbnail ? (
                      <img src={(project as { thumbnail?: string }).thumbnail} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <FileImage className="w-4 h-4 text-white/15" />
                    )}
                  </div>
                  <span className="text-[12px] text-white/70 truncate">{project.title}</span>
                </label>
              )
            })
          )}
        </div>
        <div className="px-5 py-3 border-t border-white/[0.06] flex justify-between items-center">
          <span className="text-[11px] text-white/30">
            {node.linkedProjectIds.length} projet{node.linkedProjectIds.length !== 1 ? 's' : ''} lié{node.linkedProjectIds.length !== 1 ? 's' : ''}
          </span>
          <button
            onClick={onClose}
            className="text-[12px] font-medium text-white/60 hover:text-white/90 bg-white/[0.06] hover:bg-white/10 px-4 py-2 rounded-lg transition-colors"
          >
            Fermer
          </button>
        </div>
      </div>
    </div>
  )
}
