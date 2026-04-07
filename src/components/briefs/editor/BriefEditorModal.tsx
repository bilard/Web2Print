import { X } from 'lucide-react'
import { useBriefUIStore } from '@/stores/brief.store'
import { useBrief } from '@/features/briefs/useBrief'
import { BriefStepper } from './BriefStepper'
import { Step1Form } from './Step1Form'
import { Step2Questions } from './Step2Questions'
import { Step3Cart } from './Step3Cart'
import { Step4Deck } from './Step4Deck'
import type { Taxonomy } from '@/features/taxonomy/types'

interface Props {
  taxonomy: Taxonomy
}

export function BriefEditorModal({ taxonomy }: Props) {
  const { briefEditorOpen, currentBriefId, closeBriefEditor } = useBriefUIStore()
  const { data: brief, isLoading } = useBrief(currentBriefId)

  if (!briefEditorOpen) return null

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-stretch p-6">
      <div className="flex-1 bg-[#0f0f0f] border border-white/[0.06] rounded-lg flex flex-col overflow-hidden">
        <div className="h-14 bg-[#161616] border-b border-white/[0.06] flex items-center px-4 gap-4 shrink-0">
          <h2 className="text-[13px] font-semibold text-white/80 truncate max-w-[240px]">
            {brief?.clientName || 'Nouveau brief'}
          </h2>
          <div className="flex-1 flex justify-center">
            {brief && <BriefStepper current={brief.currentStep} />}
          </div>
          <button
            onClick={closeBriefEditor}
            aria-label="Fermer"
            className="text-white/40 hover:text-white/80 p-1.5 rounded-md hover:bg-white/[0.06]"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-hidden">
          {isLoading && (
            <div className="h-full flex items-center justify-center text-[12px] text-white/40">
              Chargement…
            </div>
          )}
          {brief && brief.currentStep === 1 && (
            <Step1Form brief={brief} onAdvance={() => {}} />
          )}
          {brief && brief.currentStep === 2 && (
            <Step2Questions brief={brief} taxonomy={taxonomy} onAdvance={() => {}} />
          )}
          {brief && brief.currentStep === 3 && (
            <Step3Cart brief={brief} onAdvance={() => {}} />
          )}
          {brief && brief.currentStep === 4 && (
            <Step4Deck brief={brief} onAdvance={() => {}} />
          )}
          {brief && brief.currentStep >= 5 && (
            <div className="h-full flex items-center justify-center text-[12px] text-white/40">
              Étape 5 (export PPTX) disponible dans le prochain lot.
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
