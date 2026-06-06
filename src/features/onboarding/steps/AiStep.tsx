// src/features/onboarding/steps/AiStep.tsx
import { RefreshCw } from 'lucide-react'
import { toast } from 'sonner'
import { useAiSettingsStore } from '@/stores/aiSettings.store'
import { AiCascadeEditor } from '@/features/ai/AiCascadeEditor'

export function AiStep() {
  const resetToLatest = useAiSettingsStore((s) => s.resetToLatestModels)
  return (
    <div className="flex flex-col gap-3">
      <div>
        <h3 className="text-base font-semibold text-white">Modèles & cascade IA</h3>
        <p className="text-xs text-white/50 mt-0.5">
          Définissez l'ordre des providers de raisonnement (le 1ᵉʳ est essayé en priorité, les suivants en fallback). Optionnel — des valeurs par défaut sont déjà en place.
        </p>
      </div>
      <button
        onClick={() => { resetToLatest(); toast.success('Tous les LLM mis à jour vers leur dernière version') }}
        className="flex items-center justify-center gap-1.5 text-xs font-medium text-violet-200 bg-violet-500/15 hover:bg-violet-500/25 border border-violet-500/30 rounded-lg px-3 py-2 transition-colors"
      >
        <RefreshCw className="w-3.5 h-3.5" />
        Mettre à jour tous les LLM (dernières versions)
      </button>
      <AiCascadeEditor />
    </div>
  )
}
