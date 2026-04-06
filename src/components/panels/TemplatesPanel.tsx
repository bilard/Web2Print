import { useNavigate } from 'react-router-dom'
import { FileImage, Loader2 } from 'lucide-react'
import { useProjects } from '@/features/projects/useProjects'

export function TemplatesPanel() {
  const navigate = useNavigate()
  const { data: projects, isLoading } = useProjects()

  if (isLoading) {
    return (
      <div className="p-3 flex items-center justify-center py-8">
        <Loader2 className="w-5 h-5 text-indigo-500 animate-spin" />
      </div>
    )
  }

  if (!projects || projects.length === 0) {
    return (
      <div className="p-3 text-center py-8">
        <p className="text-xs text-white/30">Aucun projet</p>
      </div>
    )
  }

  return (
    <div className="p-2 flex flex-col gap-1.5">
      {projects.map((project) => (
        <button
          key={project.id}
          onClick={() => navigate(`/editor/${project.id}`)}
          className="flex items-center gap-2.5 p-1.5 rounded-lg hover:bg-white/5 border border-transparent hover:border-white/10 transition-all group text-left"
        >
          {/* Thumbnail */}
          <div className="w-12 h-9 rounded bg-[#111] border border-white/10 overflow-hidden shrink-0 flex items-center justify-center">
            {project.thumbnail ? (
              <img src={project.thumbnail} alt={project.title} className="w-full h-full object-cover" />
            ) : (
              <FileImage className="w-4 h-4 text-white/10" />
            )}
          </div>
          {/* Name */}
          <p className="text-xs text-white/60 group-hover:text-white transition-colors truncate">
            {project.title}
          </p>
        </button>
      ))}
    </div>
  )
}
