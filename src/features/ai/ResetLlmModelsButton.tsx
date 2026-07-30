import { RefreshCw } from 'lucide-react'
import { toast } from 'sonner'
import { useAiSettingsStore } from '@/stores/aiSettings.store'
import { useTranslation } from '@/lib/i18n'

/**
 * Bouton « Mettre à jour tous les LLM » : sélectionne le dernier modèle phare de
 * chaque provider. Partagé entre l'onglet IA des Réglages et l'étape « Modèles »
 * du wizard d'onboarding (évite la duplication du handler + libellé).
 */
export function ResetLlmModelsButton() {
  const { t } = useTranslation()
  const resetToLatest = useAiSettingsStore((s) => s.resetToLatestModels)
  return (
    <button
      onClick={() => {
        resetToLatest()
        toast.success(t('aiProvider.resetModels.done'))
      }}
      title={t('aiProvider.resetModels')}
      className="flex items-center justify-center gap-1.5 text-xs font-medium text-violet-200 bg-violet-500/15 hover:bg-violet-500/25 border border-violet-500/30 rounded-lg px-3 py-2 transition-colors"
    >
      <RefreshCw className="w-3.5 h-3.5" />
      {t('resetLlmModelsButton.updateEveryLlm')}
    </button>
  )
}
