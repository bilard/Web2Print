import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Trash2, FileImage, MoreVertical, Copy } from 'lucide-react'
import type { ProjectData } from '@/types/project'
import { EditorTaxonomyPicker } from '@/components/panels/EditorTaxonomyPicker'

export type ProjectViewMode = 'grid' | 'list'

interface ProjectCardProps {
  project: ProjectData
  onDelete: (id: string) => void
  onDuplicate?: (id: string) => void
  taxonomyLabel?: string
  view?: ProjectViewMode
}

function formatDate(ts: number): string {
  return new Intl.DateTimeFormat('fr-FR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(new Date(ts))
}

export function ProjectCard({
  project,
  onDelete,
  onDuplicate,
  taxonomyLabel,
  view = 'grid',
}: ProjectCardProps) {
  const navigate = useNavigate()
  const [menuOpen, setMenuOpen] = useState(false)
  const [pickerOpen, setPickerOpen] = useState(false)

  const taxonomyBadgeProps = {
    onClick: (e: React.MouseEvent) => {
      e.stopPropagation()
      setPickerOpen(true)
    },
    title: taxonomyLabel
      ? `${taxonomyLabel} — Cliquez pour modifier`
      : 'Lier à une taxonomie',
  }

  const open = () =>
    navigate(`/editor/${project.id}`, { state: { title: project.title } })

  const pickerNode = (
    <EditorTaxonomyPicker
      open={pickerOpen}
      projectId={project.id}
      onClose={() => setPickerOpen(false)}
    />
  )

  // ─── Mode LISTE ───────────────────────────────────────────────────────────
  if (view === 'list') {
    return (
      <>
      <div
        className="group relative flex items-center gap-3 bg-[#1a1a1a] border border-white/10 rounded-lg px-2 py-2 hover:border-indigo-500/50 hover:bg-[#1f1f1f] transition-all cursor-pointer"
        onClick={open}
      >
        {/* Thumbnail */}
        <div className="w-12 h-12 bg-[#111] rounded-md flex items-center justify-center overflow-hidden shrink-0 border border-white/[0.06]">
          {project.thumbnail ? (
            <img
              src={project.thumbnail}
              alt={project.title}
              className="w-full h-full object-cover"
              loading="lazy"
            />
          ) : (
            <FileImage className="w-4 h-4 text-white/15" />
          )}
        </div>

        {/* Title */}
        <div className="flex-1 min-w-0">
          <p className="text-[13px] font-medium text-white truncate">
            {project.title}
          </p>
          <p className="text-[10px] text-white/30 mt-0.5">
            {formatDate(project.updatedAt)}
          </p>
        </div>

        {/* Taxonomy badge / bouton de liaison */}
        <button
          type="button"
          {...taxonomyBadgeProps}
          className={`hidden sm:inline-block text-[10px] px-2 py-0.5 rounded-full truncate max-w-[180px] shrink-0 transition-colors ${
            taxonomyLabel
              ? 'text-teal-400/80 bg-teal-500/10 hover:bg-teal-500/20 hover:text-teal-300'
              : 'text-white/40 border border-dashed border-white/10 hover:border-indigo-500/40 hover:text-indigo-300 hover:bg-indigo-500/10'
          }`}
        >
          {taxonomyLabel ?? '+ Lier à une taxonomie'}
        </button>

        {/* Actions inline */}
        <div className="flex items-center gap-0.5 shrink-0">
          {onDuplicate && (
            <button
              onClick={(e) => {
                e.stopPropagation()
                onDuplicate(project.id)
              }}
              className="p-1.5 rounded-md text-white/40 hover:text-indigo-300 hover:bg-indigo-500/10 transition-colors"
              title="Dupliquer"
              aria-label="Dupliquer"
            >
              <Copy className="w-4 h-4" />
            </button>
          )}
          <button
            onClick={(e) => {
              e.stopPropagation()
              if (window.confirm(`Supprimer "${project.title}" ?`)) {
                onDelete(project.id)
              }
            }}
            className="p-1.5 rounded-md text-white/40 hover:text-red-400 hover:bg-red-500/10 transition-colors"
            title="Supprimer"
            aria-label="Supprimer"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>
      {pickerNode}
      </>
    )
  }

  // ─── Mode GRID (par défaut) ───────────────────────────────────────────────
  return (
    <>
    <div className="group relative bg-[#1a1a1a] border border-white/10 rounded-xl overflow-hidden hover:border-indigo-500/50 transition-all cursor-pointer">
      {/* Thumbnail */}
      <div
        className="aspect-[4/3] bg-[#111] flex items-center justify-center overflow-hidden"
        onClick={open}
      >
        {project.thumbnail ? (
          <img src={project.thumbnail} alt={project.title} className="w-full h-full object-contain" />
        ) : (
          <FileImage className="w-8 h-8 text-white/10" />
        )}
      </div>

      {/* Info */}
      <div className="px-3 py-2 flex items-center justify-between gap-2 border-t border-white/5">
        <div className="min-w-0" onClick={open}>
          <p className="text-sm font-medium text-white truncate">{project.title}</p>
          <button
            type="button"
            {...taxonomyBadgeProps}
            className={`text-[9px] px-1.5 py-0.5 rounded-full truncate max-w-full block mt-0.5 transition-colors ${
              taxonomyLabel
                ? 'text-teal-400/70 bg-teal-500/10 hover:bg-teal-500/20 hover:text-teal-300'
                : 'text-white/40 border border-dashed border-white/10 hover:border-indigo-500/40 hover:text-indigo-300'
            }`}
          >
            {taxonomyLabel ?? '+ Lier à une taxonomie'}
          </button>
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
                {onDuplicate && (
                  <button
                    onClick={(e) => { e.stopPropagation(); onDuplicate(project.id); setMenuOpen(false) }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-white/70 hover:text-white hover:bg-white/5 transition-colors"
                  >
                    <Copy className="w-4 h-4" />
                    Dupliquer
                  </button>
                )}
                <button
                  onClick={(e) => { e.stopPropagation(); onDelete(project.id); setMenuOpen(false) }}
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
    {pickerNode}
    </>
  )
}
