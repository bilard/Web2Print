import { Settings } from 'lucide-react'
import type { Taxonomy } from '@/features/taxonomy/types'
import { useBriefUIStore } from '@/stores/brief.store'
import { FormBuilderModal } from './form-builder/FormBuilderModal'
import { BriefsList } from './BriefsList'
import { BriefEditorModal } from './editor/BriefEditorModal'

interface Props {
  taxonomy: Taxonomy
}

export function BriefsPanel({ taxonomy }: Props) {
  const { formBuilderOpen, openFormBuilder, closeFormBuilder } = useBriefUIStore()

  return (
    <>
      <div className="h-full flex flex-col">
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

        <BriefsList taxonomy={taxonomy} />
      </div>

      <FormBuilderModal open={formBuilderOpen} taxonomy={taxonomy} onClose={closeFormBuilder} />
      <BriefEditorModal taxonomy={taxonomy} />
    </>
  )
}
