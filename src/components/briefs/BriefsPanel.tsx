import { Settings, FileText } from 'lucide-react'
import type { Taxonomy } from '@/features/taxonomy/types'
import { useBriefUIStore } from '@/stores/brief.store'
import { FormBuilderModal } from './form-builder/FormBuilderModal'

interface Props {
  taxonomy: Taxonomy
}

export function BriefsPanel({ taxonomy }: Props) {
  const { formBuilderOpen, openFormBuilder, closeFormBuilder } = useBriefUIStore()

  return (
    <>
      <div className="h-full flex flex-col">
        {/* Header de l'onglet */}
        <div className="h-11 bg-[#161616] border-b border-white/[0.06] flex items-center px-4 gap-3 shrink-0">
          <h2 className="text-[13px] font-semibold text-white/70">Briefs clients</h2>
          <div className="flex-1" />
          <button
            onClick={openFormBuilder}
            className="flex items-center gap-1.5 text-[12px] text-white/60 hover:text-white hover:bg-white/[0.06] px-3 py-1.5 rounded-md transition-colors"
          >
            <Settings className="w-3.5 h-3.5" />
            Configurer le formulaire
          </button>
        </div>

        {/* Empty state */}
        <div className="flex-1 flex flex-col items-center justify-center gap-3 text-center px-6">
          <div className="w-14 h-14 rounded-full bg-white/[0.04] flex items-center justify-center">
            <FileText className="w-6 h-6 text-white/30" />
          </div>
          <h3 className="text-[14px] text-white/70 font-medium">Aucun brief pour cette taxonomie</h3>
          <p className="text-[12px] text-white/40 max-w-sm">
            La création de briefs clients sera disponible prochainement. En attendant, vous pouvez
            configurer le formulaire client qui sera utilisé pour recueillir les demandes.
          </p>
          <button
            onClick={openFormBuilder}
            className="mt-2 text-[12px] text-indigo-400 hover:text-indigo-300 hover:bg-indigo-500/10 px-4 py-2 rounded-md transition-colors"
          >
            Configurer le formulaire →
          </button>
        </div>
      </div>

      <FormBuilderModal
        open={formBuilderOpen}
        taxonomy={taxonomy}
        onClose={closeFormBuilder}
      />
    </>
  )
}
