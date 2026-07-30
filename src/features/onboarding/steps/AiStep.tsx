import { AiCascadeEditor } from '@/features/ai/AiCascadeEditor'
import { ResetLlmModelsButton } from '@/features/ai/ResetLlmModelsButton'
import { t } from '@/lib/i18n'

export function AiStep() {
  return (
    <div className="flex flex-col gap-3">
      <div>
        <h3 className="text-base font-semibold text-white">{t('ob.aiModels')}</h3>
        <p className="text-xs text-white/50 mt-0.5">
          {t('ob.aiHint')}
        </p>
      </div>
      <ResetLlmModelsButton />
      <AiCascadeEditor />
    </div>
  )
}
