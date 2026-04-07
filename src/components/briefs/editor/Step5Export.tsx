import { Download, CheckCircle2, Presentation } from 'lucide-react'
import { toast } from 'sonner'
import { useExportBriefPptx } from '@/features/briefs/pptx/useExportBriefPptx'
import { useBriefImages } from '@/features/briefs/useBriefImages'
import type { Brief } from '@/features/briefs/types'

interface Props {
  brief: Brief
}

export function Step5Export({ brief }: Props) {
  const exportPptx = useExportBriefPptx()
  const { data: images = [] } = useBriefImages(brief.id)
  const slideCount = brief.deck?.slides.length ?? 0
  const completed = brief.status === 'completed'

  const handleExport = async () => {
    try {
      const r = await exportPptx.mutateAsync({ brief })
      toast.success(`PPTX généré : ${r.filename}`)
    } catch (err) {
      toast.error((err as Error).message || 'Échec de l\'export')
    }
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-2xl mx-auto">
          <h2 className="text-[14px] font-semibold text-white/80 mb-1">Export PowerPoint</h2>
          <p className="text-[12px] text-white/40 mb-6">
            Le fichier sera téléchargé directement dans votre navigateur.
          </p>

          <div className="bg-[#141414] border border-white/[0.06] rounded-md p-5 flex flex-col gap-4">
            <div className="flex items-center gap-3">
              <Presentation className="w-5 h-5 text-indigo-400" />
              <div className="flex-1">
                <p className="text-[13px] text-white/90 font-medium">{brief.clientName || 'Brief'}</p>
                <p className="text-[11px] text-white/40">
                  {slideCount} slide{slideCount > 1 ? 's' : ''} • {images.length} image{images.length > 1 ? 's' : ''}
                </p>
              </div>
              {completed && <CheckCircle2 className="w-4 h-4 text-emerald-400" />}
            </div>

            <button
              onClick={handleExport}
              disabled={exportPptx.isPending || slideCount === 0}
              className="flex items-center justify-center gap-2 text-[13px] text-white bg-indigo-500 hover:bg-indigo-600 px-4 py-2.5 rounded-md disabled:opacity-50"
            >
              <Download className="w-4 h-4" />
              {exportPptx.isPending ? 'Génération…' : 'Télécharger le PPTX'}
            </button>

            {slideCount === 0 && (
              <p className="text-[11px] text-amber-400/80 text-center">
                Aucune slide générée. Retournez à l'étape 4 pour générer le deck.
              </p>
            )}

            {completed && (
              <p className="text-[11px] text-emerald-400/80 text-center">
                Brief marqué comme terminé. Vous pouvez régénérer le PPTX à tout moment.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
