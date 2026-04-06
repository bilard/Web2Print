import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Trash2, FileImage, MoreVertical } from 'lucide-react'
import type { ProjectData } from '@/types/project'

interface ProjectCardProps {
  project: ProjectData
  onDelete: (id: string) => void
  taxonomyLabel?: string
}

function formatDate(ts: number): string {
  return new Intl.DateTimeFormat('fr-FR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(new Date(ts))
}

export function ProjectCard({ project, onDelete, taxonomyLabel }: ProjectCardProps) {
  const navigate = useNavigate()
  const [menuOpen, setMenuOpen] = useState(false)

  return (
    <div className="group relative bg-[#1a1a1a] border border-white/10 rounded-xl overflow-hidden hover:border-indigo-500/50 transition-all cursor-pointer">
      {/* Thumbnail */}
      <div
        className="aspect-[4/3] bg-[#111] flex items-center justify-center overflow-hidden"
        onClick={() => navigate(`/editor/${project.id}`, { state: { title: project.title } })}
      >
        {project.thumbnail ? (
          <img src={project.thumbnail} alt={project.title} className="w-full h-full object-contain" />
        ) : (
          <FileImage className="w-8 h-8 text-white/10" />
        )}
      </div>

      {/* Info */}
      <div className="px-3 py-2 flex items-center justify-between gap-2 border-t border-white/5">
        <div className="min-w-0" onClick={() => navigate(`/editor/${project.id}`, { state: { title: project.title } })}>
          <p className="text-sm font-medium text-white truncate">{project.title}</p>
          {taxonomyLabel && (
            <span className="text-[9px] text-teal-400/70 bg-teal-500/10 px-1.5 py-0.5 rounded-full truncate max-w-full block mt-0.5">
              {taxonomyLabel}
            </span>
          )}
          <p className="text-[10px] text-white/30 mt-0.5">{formatDate(project.updatedAt)}</p>
        </div>

        {/* Menu */}
        <div className="relative">
          <button
            onClick={(e) => { e.stopPropagation(); setMenuOpen((v) => !v) }}
            className="p-1 rounded-md text-white/30 hover:text-white hover:bg-white/10 transition-colors opacity-0 group-hover:opacity-100"
          >
            <MoreVertical className="w-3.5 h-3.5" />
          </button>

          {menuOpen && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
              <div className="absolute right-0 bottom-8 z-20 bg-[#252525] border border-white/10 rounded-lg shadow-xl py-1 min-w-[140px]">
                <button
                  onClick={() => { onDelete(project.id); setMenuOpen(false) }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-400 hover:bg-white/5 transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                  Supprimer
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
