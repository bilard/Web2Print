import { useState } from 'react'
import { Briefcase, ImageIcon, LayoutGrid, List } from 'lucide-react'
import { useProjects } from '@/features/projects/useProjects'
import { useDamStore } from '@/stores/dam.store'
import type { ProjectData } from '@/types/project'

function formatDate(ts: number): string {
  try {
    const d = new Date(ts)
    return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })
  } catch {
    return ''
  }
}

function ProjectCard({ project, onOpen }: { project: ProjectData; onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="group relative text-left rounded-lg overflow-hidden bg-white/5 hover:bg-white/10 border border-white/5 hover:border-white/15 transition"
    >
      <div className="aspect-[4/3] bg-[#111] relative overflow-hidden">
        {project.thumbnail ? (
          <img
            src={project.thumbnail}
            alt={project.title}
            className="w-full h-full object-cover"
            loading="lazy"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <ImageIcon className="w-10 h-10 text-white/10" />
          </div>
        )}
      </div>
      <div className="p-2.5">
        <div className="text-sm text-white/80 font-medium truncate">{project.title || 'Sans titre'}</div>
        <div className="text-[10px] text-white/40 mt-0.5">Modifié {formatDate(project.updatedAt)}</div>
      </div>
    </button>
  )
}

function ProjectRow({ project, onOpen }: { project: ProjectData; onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="group w-full flex items-center gap-3 px-3 py-2 rounded-lg bg-white/5 hover:bg-white/10 border border-white/5 hover:border-white/15 transition text-left"
    >
      <div className="w-12 h-12 rounded bg-[#111] overflow-hidden shrink-0 flex items-center justify-center">
        {project.thumbnail ? (
          <img
            src={project.thumbnail}
            alt={project.title}
            className="w-full h-full object-cover"
            loading="lazy"
          />
        ) : (
          <ImageIcon className="w-5 h-5 text-white/10" />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm text-white/80 font-medium truncate">{project.title || 'Sans titre'}</div>
        <div className="text-[10px] text-white/40 mt-0.5">Modifié {formatDate(project.updatedAt)}</div>
      </div>
    </button>
  )
}

export function DamProjects() {
  const { data: projects = [], isLoading } = useProjects()
  const setSelectedProjectId = useDamStore((s) => s.setSelectedProjectId)
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid')

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center text-white/30 text-sm">
        Chargement des projets...
      </div>
    )
  }

  if (projects.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-3 text-white/30">
        <Briefcase className="w-10 h-10 text-white/10" />
        <p className="text-sm">Aucun projet</p>
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="flex items-center justify-end mb-4">
        <div
          className="flex items-center gap-0.5 bg-white/[0.04] border border-white/[0.08] rounded-lg p-0.5"
          role="group"
          aria-label="Mode d'affichage"
        >
          <button
            type="button"
            onClick={() => setViewMode('grid')}
            aria-pressed={viewMode === 'grid'}
            title="Vue vignettes"
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[12px] font-medium transition-colors ${
              viewMode === 'grid'
                ? 'bg-indigo-500/15 text-indigo-300'
                : 'text-white/40 hover:text-white/70 hover:bg-white/[0.04]'
            }`}
          >
            <LayoutGrid className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Vignettes</span>
          </button>
          <button
            type="button"
            onClick={() => setViewMode('list')}
            aria-pressed={viewMode === 'list'}
            title="Vue liste"
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[12px] font-medium transition-colors ${
              viewMode === 'list'
                ? 'bg-indigo-500/15 text-indigo-300'
                : 'text-white/40 hover:text-white/70 hover:bg-white/[0.04]'
            }`}
          >
            <List className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Liste</span>
          </button>
        </div>
      </div>

      {viewMode === 'grid' ? (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          {projects.map((project) => (
            <ProjectCard
              key={project.id}
              project={project}
              onOpen={() => setSelectedProjectId(project.id)}
            />
          ))}
        </div>
      ) : (
        <div className="flex flex-col gap-1.5">
          {projects.map((project) => (
            <ProjectRow
              key={project.id}
              project={project}
              onOpen={() => setSelectedProjectId(project.id)}
            />
          ))}
        </div>
      )}
    </div>
  )
}
