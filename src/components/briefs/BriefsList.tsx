import { Plus, FileText, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { useBriefs } from '@/features/briefs/useBriefs'
import { useCreateBrief, useDeleteBrief } from '@/features/briefs/useBriefMutations'
import { useBriefUIStore } from '@/stores/brief.store'
import { createDefaultFormTemplate } from '@/features/briefs/defaults'
import type { Taxonomy } from '@/features/taxonomy/types'

interface Props {
  taxonomy: Taxonomy
}

export function BriefsList({ taxonomy }: Props) {
  const { data: briefs = [], isLoading } = useBriefs({ taxonomyId: taxonomy.id })
  const create = useCreateBrief()
  const remove = useDeleteBrief()
  const openBriefEditor = useBriefUIStore((s) => s.openBriefEditor)

  const handleNew = async () => {
    try {
      const id = await create.mutateAsync({
        taxonomyId: taxonomy.id,
        clientName: 'Nouveau brief',
        formTemplateSnapshot: taxonomy.formTemplate ?? createDefaultFormTemplate(),
      })
      openBriefEditor(id)
    } catch (err) {
      toast.error('Erreur lors de la création')
      console.error(err)
    }
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
        <button
          onClick={handleNew}
          disabled={create.isPending}
          className="flex items-center gap-1.5 text-[12px] text-white bg-indigo-500 hover:bg-indigo-600 px-3 py-1.5 rounded-md disabled:opacity-50"
        >
          <Plus className="w-3.5 h-3.5" />
          Nouveau brief
        </button>
      </div>

      {isLoading && <p className="text-[12px] text-white/40">Chargement…</p>}

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

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
        {briefs.map((b) => (
          <div
            key={b.id}
            onClick={() => openBriefEditor(b.id)}
            className="group bg-[#141414] border border-white/[0.06] rounded-md p-4 cursor-pointer hover:border-indigo-500/40 transition-colors"
          >
            <div className="flex items-start justify-between gap-2 mb-2">
              <h4 className="text-[13px] text-white/90 font-medium truncate flex-1">{b.clientName}</h4>
              <button
                onClick={(e) => handleDelete(b.id, e)}
                className="text-white/20 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
                aria-label="Supprimer"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
            <div className="flex items-center gap-2 text-[11px] text-white/40">
              <span className="px-1.5 py-0.5 rounded bg-white/[0.04]">{b.status}</span>
              <span>Étape {b.currentStep}/5</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
