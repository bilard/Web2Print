import { useState } from 'react'
import { useRetailPromoStore } from './retailPromo.store'
import { useModuleIntent } from '@/features/navigation/useModuleIntent'
import { StepSource } from './steps/StepSource'
import { StepMapping } from './steps/StepMapping'
import { StepRender } from './steps/StepRender'
import { PromoSavedList } from './PromoSavedList'
import { t, type TranslationKey } from '@/lib/i18n'

// ⚠️ CLÉS, pas `t()` : objet évalué au chargement du module — la langue y
// restait figée à celle du premier rendu du bundle.
const STEP_LABELS: Record<'source' | 'mapping' | 'template', TranslationKey> = {
  source: 'rp.step.source',
  mapping: 'rp.step.mapping',
  template: 'rp.step.template',
}

const STEPS = ['source', 'mapping', 'template'] as const

export function RetailPromoPage() {
  const { step, reset } = useRetailPromoStore()
  const [mode, setMode] = useState<'wizard' | 'list'>('wizard')

  // Intent module : reset sur « action:new », liste sur « action:list ».
  useModuleIntent('retail-promo', (action) => {
    if (action === 'action:new') { reset(); setMode('wizard') }
    if (action === 'action:list') setMode('list')
  })

  if (mode === 'list') {
    return (
      <div className="flex h-full flex-col bg-background">
        <div className="flex-1 overflow-y-auto px-6 py-6">
          <PromoSavedList onOpened={() => setMode('wizard')} onNew={() => { reset(); setMode('wizard') }} />
        </div>
      </div>
    )
  }

  const currentStepIndex = STEPS.indexOf(step)

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Indicateur d'étapes */}
      <div className="flex items-center gap-0 px-6 pt-3 pb-3 border-b border-white/5">
        {STEPS.map((s, i) => (
          <div key={s} className="flex items-center gap-0">
            <div className="flex items-center gap-2">
              <div className={[
                'w-6 h-6 rounded-full flex items-center justify-center text-xs font-semibold transition-colors',
                i < currentStepIndex
                  ? 'bg-[#6366f1]/30 text-[#6366f1]'
                  : i === currentStepIndex
                  ? 'bg-[#6366f1] text-[#fff]'
                  : 'bg-white/10 text-white/40',
              ].join(' ')}>{i + 1}</div>
              <span className={[
                'text-sm',
                i === currentStepIndex ? 'text-white font-medium' : 'text-white/40',
              ].join(' ')}>{t(STEP_LABELS[s])}</span>
            </div>
            {i < STEPS.length - 1 && (
              <div className="w-6 h-px bg-white/10 mx-2" />
            )}
          </div>
        ))}
      </div>

      {/* Contenu de l'étape courante */}
      <div className="flex-1 overflow-y-auto px-6 py-4">
        {step === 'source' && <StepSource />}
        {step === 'mapping' && <StepMapping />}
        {step === 'template' && <StepRender />}
      </div>
    </div>
  )
}
