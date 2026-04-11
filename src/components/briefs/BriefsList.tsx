import { useEffect, useState } from 'react'
import { Plus, FileText, Trash2, Sparkles, LayoutGrid, List } from 'lucide-react'
import { toast } from 'sonner'
import { useBriefs } from '@/features/briefs/useBriefs'
import { useBriefImages } from '@/features/briefs/useBriefImages'
import { useCreateBrief, useDeleteBrief } from '@/features/briefs/useBriefMutations'
import { useBriefUIStore } from '@/stores/brief.store'
import { createDefaultFormTemplate } from '@/features/briefs/defaults'
import type { Brief } from '@/features/briefs/types'
import type { Taxonomy } from '@/features/taxonomy/types'

type ViewMode = 'list' | 'thumbnail'
const VIEW_MODE_KEY = 'briefsList.viewMode'

interface Props {
  taxonomy: Taxonomy
}

export function BriefsList({ taxonomy }: Props) {
  const { data: briefs = [], isLoading, error } = useBriefs({ taxonomyId: taxonomy.id })
  const create = useCreateBrief()
  const remove = useDeleteBrief()
  const openBriefEditor = useBriefUIStore((s) => s.openBriefEditor)

  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    if (typeof window === 'undefined') return 'thumbnail'
    return (localStorage.getItem(VIEW_MODE_KEY) as ViewMode) || 'thumbnail'
  })
  useEffect(() => {
    localStorage.setItem(VIEW_MODE_KEY, viewMode)
  }, [viewMode])

  const handleNew = async () => {
    try {
      const id = await create.mutateAsync({
        taxonomyId: taxonomy.id,
        clientName: '',
        formTemplateSnapshot: taxonomy.formTemplate ?? createDefaultFormTemplate(),
      })
      openBriefEditor(id)
    } catch (err) {
      toast.error('Erreur lors de la création')
      console.error(err)
    }
  }

  const ghosts = briefs.filter((b) => {
    if (b.status !== 'draft') return false
    if ((b.currentStep ?? 1) > 1) return false
    if (b.clientName?.trim()) return false
    const v = b.client?.values ?? {}
    const meaningful = Object.values(v).some((val) => {
      if (typeof val === 'string') return val.trim().length > 0
      if (val === null || val === undefined) return false
      if (typeof val === 'object' && Object.keys(val as object).length === 0) return false
      return true
    })
    return !meaningful
  })

  const handlePurgeGhosts = async () => {
    if (ghosts.length === 0) return
    if (!confirm(`Supprimer ${ghosts.length} brouillon${ghosts.length > 1 ? 's' : ''} vide${ghosts.length > 1 ? 's' : ''} ?`))
      return
    let ok = 0
    for (const g of ghosts) {
      try {
        await remove.mutateAsync(g.id)
        ok++
      } catch (err) {
        console.error('[purge] échec', g.id, err)
      }
    }
    toast.success(`${ok} brouillon${ok > 1 ? 's' : ''} purgé${ok > 1 ? 's' : ''}`)
  }

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    if (!confirm('Supprimer ce brief ?')) return
    try {
      await remove.mutateAsync(id)
      toast.success('Brief supprimé')
    } catch {
      toast.error('Erreur lors de la suppression')
    }
  }

  return (
    <div className="flex-1 overflow-y-auto p-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-[12px] uppercase tracking-wide text-white/40 font-semibold">
          {briefs.length} brief{briefs.length > 1 ? 's' : ''}
        </h3>
        <div className="flex items-center gap-2">
          <div className="flex items-center border border-white/[0.08] rounded-md overflow-hidden">
            <button
              onClick={() => setViewMode('list')}
              title="Mode liste"
              className={`p-1.5 ${viewMode === 'list' ? 'bg-white/[0.08] text-white' : 'text-white/40 hover:text-white/70'}`}
            >
              <List className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setViewMode('thumbnail')}
              title="Mode vignette"
              className={`p-1.5 ${viewMode === 'thumbnail' ? 'bg-white/[0.08] text-white' : 'text-white/40 hover:text-white/70'}`}
            >
              <LayoutGrid className="w-3.5 h-3.5" />
            </button>
          </div>
          {ghosts.length > 0 && (
            <button
              onClick={handlePurgeGhosts}
              disabled={remove.isPending}
              title={`${ghosts.length} brouillon(s) vide(s) à purger`}
              className="flex items-center gap-1.5 text-[12px] text-white/60 hover:text-white border border-white/[0.08] hover:border-white/[0.16] px-3 py-1.5 rounded-md disabled:opacity-50"
            >
              <Sparkles className="w-3.5 h-3.5" />
              Purger {ghosts.length} fantôme{ghosts.length > 1 ? 's' : ''}
            </button>
          )}
          <button
            onClick={handleNew}
            disabled={create.isPending}
            className="flex items-center gap-1.5 text-[12px] text-white bg-indigo-500 hover:bg-indigo-600 px-3 py-1.5 rounded-md disabled:opacity-50"
          >
            <Plus className="w-3.5 h-3.5" />
            Nouveau brief
          </button>
        </div>
      </div>

      {isLoading && <p className="text-[12px] text-white/40">Chargement…</p>}

      {error && (
        <div className="mb-4 px-4 py-3 border border-red-500/40 bg-red-500/10 rounded-md">
          <p className="text-[12px] text-red-300 font-semibold mb-1">Erreur de chargement des briefs</p>
          <p className="text-[11px] text-red-200/80 break-words">{(error as Error).message}</p>
        </div>
      )}

      {!isLoading && briefs.length === 0 && (
        <div className="flex flex-col items-center justify-center gap-3 text-center px-6 py-16 border border-dashed border-white/[0.08] rounded-md">
          <div className="w-12 h-12 rounded-full bg-white/[0.04] flex items-center justify-center">
            <FileText className="w-5 h-5 text-white/30" />
          </div>
          <p className="text-[12px] text-white/40 max-w-sm">
            Aucun brief pour cette taxonomie. Cliquez sur « Nouveau brief » pour démarrer.
          </p>
        </div>
      )}

      {viewMode === 'thumbnail' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {briefs.map((b) => (
            <BriefThumbnailCard
              key={b.id}
              brief={b}
              onOpen={() => openBriefEditor(b.id)}
              onDelete={(e) => handleDelete(b.id, e)}
            />
          ))}
        </div>
      ) : (
        <div className="flex flex-col gap-1">
          {briefs.map((b) => (
            <div
              key={b.id}
              onClick={() => openBriefEditor(b.id)}
              className="group flex items-center gap-3 bg-[#141414] border border-white/[0.06] rounded-md px-3 py-2 cursor-pointer hover:border-indigo-500/40 transition-colors"
            >
              <FileText className="w-3.5 h-3.5 text-white/30 shrink-0" />
              <h4 className="text-[13px] text-white/90 font-medium truncate flex-1">
                {b.clientName || <span className="text-white/30 italic">Sans nom</span>}
              </h4>
              <span className="text-[11px] px-1.5 py-0.5 rounded bg-white/[0.04] text-white/50">{b.status}</span>
              <span className="text-[11px] text-white/40">Étape {b.currentStep}/5</span>
              <button
                onClick={(e) => handleDelete(b.id, e)}
                className="text-white/20 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
                aria-label="Supprimer"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

interface BriefThumbnailCardProps {
  brief: Brief
  onOpen: () => void
  onDelete: (e: React.MouseEvent) => void
}

function BriefThumbnailCard({ brief, onOpen, onDelete }: BriefThumbnailCardProps) {
  const { data: images } = useBriefImages(brief.id)
  const hero = images?.find((i) => i.type === 'hero') ?? images?.[0]
  const thumb = hero?.thumbnailUrl ?? hero?.url

  return (
    <div
      onClick={onOpen}
      className="group bg-[#141414] border border-white/[0.06] rounded-md overflow-hidden cursor-pointer hover:border-indigo-500/40 transition-colors"
    >
      <div className="aspect-video bg-white/[0.03] flex items-center justify-center overflow-hidden">
        {thumb ? (
          <img src={thumb} alt={brief.clientName} className="w-full h-full object-cover" />
        ) : (
          <FileText className="w-6 h-6 text-white/20" />
        )}
      </div>
      <div className="p-3">
        <div className="flex items-start justify-between gap-2 mb-2">
          <h4 className="text-[13px] text-white/90 font-medium truncate flex-1">
            {brief.clientName || <span className="text-white/30 italic">Sans nom</span>}
          </h4>
          <button
            onClick={onDelete}
            className="text-white/20 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
            aria-label="Supprimer"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
        <div className="flex items-center gap-2 text-[11px] text-white/40">
          <span className="px-1.5 py-0.5 rounded bg-white/[0.04]">{brief.status}</span>
          <span>Étape {brief.currentStep}/5</span>
        </div>
      </div>
    </div>
  )
}
