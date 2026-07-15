import { RefreshCw } from 'lucide-react'
import { toast } from 'sonner'
import { useAiSettingsStore } from '@/stores/aiSettings.store'

/**
 * Bouton « Mettre à jour tous les LLM » : sélectionne le dernier modèle phare de
 * chaque provider. Partagé entre l'onglet IA des Réglages et l'étape « Modèles »
 * du wizard d'onboarding (évite la duplication du handler + libellé).
 */
export function ResetLlmModelsButton() {
  const resetToLatest = useAiSettingsStore((s) => s.resetToLatestModels)
  return (
    <button
      onClick={() => {
        resetToLatest()
        toast.success('Tous les LLM mis à jour vers leur dernière version')
      }}
      title="Sélectionne le dernier modèle phare de chaque provider (Claude, Gemini, OpenAI, DeepSeek, Qwen, Kimi, GLM, OpenRouter)"
      className="flex items-center justify-center gap-1.5 text-xs font-medium text-violet-200 bg-violet-500/15 hover:bg-violet-500/25 border border-violet-500/30 rounded-lg px-3 py-2 transition-colors"
    >
      <RefreshCw className="w-3.5 h-3.5" />
      Mettre à jour tous les LLM (dernières versions)
    </button>
  )
}
