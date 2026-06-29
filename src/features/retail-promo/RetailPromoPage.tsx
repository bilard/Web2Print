import { useRetailPromoStore } from './retailPromo.store'
import { useModuleIntent } from '@/features/navigation/useModuleIntent'
import { StepSource } from './steps/StepSource'
import { StepMapping } from './steps/StepMapping'
import { StepRender } from './steps/StepRender'

const STEP_LABELS = {
  source: 'Source',
  mapping: 'Correspondance',
  template: 'Aperçu & export',
} as const

const STEPS = ['source', 'mapping', 'template'] as const

export function RetailPromoPage() {
  const { step, reset } = useRetailPromoStore()

  // Intent module : reset sur « action:new »
  useModuleIntent('retail-promo', (action) => {
    if (action === 'action:new') reset()
  })

  const currentStepIndex = STEPS.indexOf(step)

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Indicateur d'étapes */}
      <div className="flex items-center gap-0 px-6 pt-6 pb-4 border-b border-white/5">
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
              ].join(' ')}>{STEP_LABELS[s]}</span>
            </div>
            {i < STEPS.length - 1 && (
              <div className="w-6 h-px bg-white/10 mx-2" />
            )}
          </div>
        ))}
      </div>

      {/* Contenu de l'étape courante */}
      <div className="flex-1 overflow-y-auto px-6 py-6">
        {step === 'source' && <StepSource />}
        {step === 'mapping' && <StepMapping />}
        {step === 'template' && <StepRender />}
      </div>
    </div>
  )
}
