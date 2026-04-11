// src/components/taxonomy/LinkProjectsModal.tsx
import { useEffect, useMemo, useState } from 'react'
import { X, FileImage, Search, Link as LinkIcon, Check } from 'lucide-react'
import { useProjects } from '@/features/projects/useProjects'
import {
  useLinkProject,
  useUnlinkProject,
} from '@/features/taxonomy/useTaxonomyMutations'
import type { Taxonomy } from '@/features/taxonomy/types'
import type { ProjectData } from '@/types/project'

interface LinkProjectsModalProps {
  open: boolean
  taxonomyId: string
  nodeId: string | null
  taxonomy: Taxonomy | null
  onClose: () => void
}

type FilterMode = 'all' | 'linked' | 'unlinked'

const dateFormatter = new Intl.DateTimeFormat('fr-FR', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
})

export function LinkProjectsModal({
  open,
  taxonomyId,
  nodeId,
  taxonomy,
  onClose,
}: LinkProjectsModalProps) {
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<FilterMode>('all')
  const { data: projects } = useProjects()
  const link = useLinkProject()
  const unlink = useUnlinkProject()

  // Reset state à chaque ouverture — on bascule sur "Liés" si des projets sont déjà liés
  useEffect(() => {
    if (open) {
      setSearch('')
      const hasLinked = !!(taxonomy && nodeId && (taxonomy.nodes[nodeId]?.linkedProjectIds.length ?? 0) > 0)
      setFilter(hasLinked ? 'linked' : 'all')
    }
  }, [open, nodeId, taxonomy])

  // ESC pour fermer
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  const node = taxonomy && nodeId ? taxonomy.nodes[nodeId] : null

  const linkedSet = useMemo(
    () => new Set(node?.linkedProjectIds ?? []),
    [node?.linkedProjectIds]
  )

  const { visible, counts } = useMemo(() => {
    const loaded: ProjectData[] = projects ?? []
    const loadedIds = new Set(loaded.map((p) => p.id))
    // Inclut les projets liés absents de la liste courante (orphelins / autres propriétaires)
    // sous forme de stub pour qu'ils apparaissent quand même cochés.
    const orphanLinked: ProjectData[] = (node?.linkedProjectIds ?? [])
      .filter((id) => !loadedIds.has(id))
      .map((id) => ({
        id,
        title: 'Projet introuvable',
        thumbnail: null,
        createdAt: 0,
        updatedAt: 0,
        ownerId: '',
        canvasData: null,
      } as ProjectData))
    const all: ProjectData[] = [...loaded, ...orphanLinked]
    const q = search.trim().toLowerCase()

    const matchesSearch = (p: ProjectData) =>
      q.length === 0 || p.title.toLowerCase().includes(q)

    const linkedAll = all.filter((p) => linkedSet.has(p.id))
    const unlinkedAll = all.filter((p) => !linkedSet.has(p.id))

    let pool: ProjectData[] = all
    if (filter === 'linked') pool = linkedAll
    else if (filter === 'unlinked') pool = unlinkedAll

    const filtered = pool.filter(matchesSearch)

    // Tri : liés d'abord (en mode 'all'), puis date desc
    filtered.sort((a, b) => {
      if (filter === 'all') {
        const al = linkedSet.has(a.id) ? 0 : 1
        const bl = linkedSet.has(b.id) ? 0 : 1
        if (al !== bl) return al - bl
      }
      return (b.updatedAt ?? 0) - (a.updatedAt ?? 0)
    })

    return {
      visible: filtered,
      counts: {
        all: all.length,
        linked: linkedAll.length,
        unlinked: unlinkedAll.length,
      },
    }
  }, [projects, search, filter, linkedSet, node?.linkedProjectIds])

  if (!open || !nodeId || !taxonomy || !node) return null

  const handleToggle = (projectId: string) => {
    if (linkedSet.has(projectId)) {
      unlink.mutate({ taxonomyId, nodeId, projectId })
    } else {
      link.mutate({ taxonomyId, nodeId, projectId })
    }
  }

  const visibleUnlinked = visible.filter((p) => !linkedSet.has(p.id))
  const canSelectAll = visibleUnlinked.length > 0
  const handleSelectAllVisible = () => {
    visibleUnlinked.forEach((p) =>
      link.mutate({ taxonomyId, nodeId, projectId: p.id })
    )
  }

  const visibleLinked = visible.filter((p) => linkedSet.has(p.id))
  const canDeselectAll = visibleLinked.length > 0
  const handleDeselectAllVisible = () => {
    visibleLinked.forEach((p) =>
      unlink.mutate({ taxonomyId, nodeId, projectId: p.id })
    )
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-labelledby="link-modal-title"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
        className="bg-[#1a1a1a] border border-white/10 rounded-xl shadow-2xl w-[560px] max-h-[82vh] flex flex-col"
      >
        {/* Header */}
        <div className="flex items-start justify-between px-5 py-4 border-b border-white/[0.06]">
          <div className="min-w-0">
            <h2
              id="link-modal-title"
              className="text-[14px] font-semibold text-white/90 flex items-center gap-2"
            >
              <LinkIcon className="w-4 h-4 text-teal-400" />
              Lier des projets
            </h2>
            <p className="text-[11px] text-white/35 mt-0.5 truncate max-w-[420px]">
              {node.label}
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-white/30 hover:text-white/70 transition-colors shrink-0"
            aria-label="Fermer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Search */}
        <div className="px-4 pt-3">
          <div className="flex items-center gap-2 bg-white/[0.04] border border-white/[0.08] focus-within:border-teal-500/40 rounded-lg px-3 py-2 transition-colors">
            <Search className="w-3.5 h-3.5 text-white/25 shrink-0" />
            <input
              type="text"
              placeholder="Rechercher un projet…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              autoFocus
              className="flex-1 bg-transparent text-[12px] text-white/80 placeholder:text-white/25 outline-none"
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                className="text-white/30 hover:text-white/70"
                aria-label="Effacer la recherche"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Filtres */}
        <div className="px-4 pt-3 pb-2 flex items-center gap-1">
          {(
            [
              ['all', 'Tous', counts.all],
              ['linked', 'Liés', counts.linked],
              ['unlinked', 'Non liés', counts.unlinked],
            ] as const
          ).map(([key, label, count]) => {
            const active = filter === key
            return (
              <button
                key={key}
                onClick={() => setFilter(key)}
                className={`text-[11px] font-medium px-2.5 py-1 rounded-md transition-colors flex items-center gap-1.5 ${
                  active
                    ? 'bg-teal-500/15 text-teal-300'
                    : 'text-white/50 hover:text-white/80 hover:bg-white/[0.04]'
                }`}
              >
                {label}
                <span
                  className={`text-[10px] px-1.5 rounded ${
                    active ? 'bg-teal-500/20 text-teal-200' : 'bg-white/[0.06] text-white/40'
                  }`}
                >
                  {count}
                </span>
              </button>
            )
          })}
        </div>

        {/* Barre d'actions de masse */}
        <div className="px-5 py-2 border-y border-white/[0.06] flex items-center justify-between">
          <span className="text-[11px] text-white/40">
            {visible.length} résultat{visible.length !== 1 ? 's' : ''}
          </span>
          <div className="flex items-center gap-3">
            {canSelectAll && (
              <button
                onClick={handleSelectAllVisible}
                className="text-[11px] text-teal-300/80 hover:text-teal-300 transition-colors"
              >
                Tout lier ({visibleUnlinked.length})
              </button>
            )}
            {canDeselectAll && (
              <button
                onClick={handleDeselectAllVisible}
                className="text-[11px] text-white/40 hover:text-white/70 transition-colors"
              >
                Tout délier ({visibleLinked.length})
              </button>
            )}
          </div>
        </div>

        {/* Liste */}
        <div className="flex-1 overflow-y-auto px-2 py-2 min-h-[200px]">
          {visible.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <FileImage className="w-8 h-8 text-white/10 mb-2" />
              <p className="text-[12px] text-white/35">
                {search ? 'Aucun projet trouvé' : 'Aucun projet disponible'}
              </p>
            </div>
          ) : (
            <ul className="space-y-0.5">
              {visible.map((project) => {
                const linked = linkedSet.has(project.id)
                return (
                  <li key={project.id}>
                    <button
                      type="button"
                      onClick={() => handleToggle(project.id)}
                      className={`w-full flex items-center gap-3 p-2 rounded-lg transition-colors text-left group ${
                        linked
                          ? 'bg-teal-500/[0.08] hover:bg-teal-500/[0.14]'
                          : 'hover:bg-white/[0.04]'
                      }`}
                    >
                      {/* Checkbox custom */}
                      <span
                        className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors ${
                          linked
                            ? 'bg-teal-500 border-teal-500'
                            : 'border-white/20 group-hover:border-white/40'
                        }`}
                      >
                        {linked && <Check className="w-3 h-3 text-white" strokeWidth={3} />}
                      </span>

                      {/* Thumbnail */}
                      <div className="w-10 h-10 bg-[#111] rounded-md flex items-center justify-center shrink-0 overflow-hidden border border-white/[0.06]">
                        {project.thumbnail ? (
                          <img
                            src={project.thumbnail}
                            alt=""
                            className="w-full h-full object-cover"
                            loading="lazy"
                          />
                        ) : (
                          <FileImage className="w-4 h-4 text-white/15" />
                        )}
                      </div>

                      {/* Infos */}
                      <div className="flex-1 min-w-0">
                        <p
                          className={`text-[12px] truncate ${
                            linked ? 'text-white/90' : 'text-white/70'
                          }`}
                        >
                          {project.title}
                        </p>
                        {project.updatedAt && (
                          <p className="text-[10px] text-white/30 mt-0.5">
                            {dateFormatter.format(project.updatedAt)}
                          </p>
                        )}
                      </div>

                      {linked && (
                        <span className="text-[10px] text-teal-400/80 font-medium px-1.5 py-0.5 rounded bg-teal-500/10 shrink-0">
                          Lié
                        </span>
                      )}
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-white/[0.06] flex justify-between items-center">
          <span className="text-[11px] text-white/40">
            <span className="text-teal-300/90 font-medium">
              {node.linkedProjectIds.length}
            </span>{' '}
            projet{node.linkedProjectIds.length !== 1 ? 's' : ''} lié
            {node.linkedProjectIds.length !== 1 ? 's' : ''} au total
          </span>
          <button
            onClick={onClose}
            className="text-[12px] font-medium text-white/70 hover:text-white bg-white/[0.06] hover:bg-white/10 px-4 py-2 rounded-lg transition-colors"
          >
            Fermer
          </button>
        </div>
      </div>
    </div>
  )
}
