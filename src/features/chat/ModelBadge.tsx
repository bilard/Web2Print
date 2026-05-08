import { useState } from 'react'
import { ChevronDown, Sparkles } from 'lucide-react'
import { useAiSettingsStore, type ReasoningProvider } from '@/stores/aiSettings.store'
import { AI_MODELS, type AiProvider } from '@/lib/aiModels'
import { ModelPickerDropdown } from './ModelPickerDropdown'

const PROVIDER_LABEL: Record<AiProvider, string> = {
  claude: 'Claude',
  gemini: 'Gemini',
  openai: 'OpenAI',
  deepseek: 'DeepSeek',
  qwen: 'Qwen',
  kimi: 'Kimi',
  openrouter: 'OpenRouter',
}

function getModelLabel(provider: AiProvider, modelId: string): string {
  const found = AI_MODELS[provider].find((m) => m.id === modelId)
  if (found) return found.label
  return modelId
}

interface ModelBadgeProps {
  /** Active = il y a une réponse en cours / déjà reçue. Affiche le pulse. */
  pulsing?: boolean
}

/**
 * Badge cliquable qui ouvre un picker des modèles de la cascade.
 * Au clic sur un modèle : `setSelectedModel` + reorder cascade pour mettre
 * le provider en tête.
 */
export function ModelBadge({ pulsing }: ModelBadgeProps) {
  const cascade = useAiSettingsStore((s) => s.reasoningCascade)
  const selectedModel = useAiSettingsStore((s) => s.selectedModel)
  const setSelectedModel = useAiSettingsStore((s) => s.setSelectedModel)
  const setCascade = useAiSettingsStore((s) => s.setReasoningCascade)
  const [open, setOpen] = useState(false)

  const primary = cascade[0]
  if (!primary) {
    return (
      <div className="flex items-center gap-1.5 text-[12px] text-rose-300 bg-rose-500/10 border border-rose-500/30 rounded-full px-2.5 py-1.5">
        <Sparkles className="w-3 h-3" />
        Aucun provider — Réglages → IA
      </div>
    )
  }

  const modelId = selectedModel[primary as AiProvider]

  const handlePick = (provider: ReasoningProvider, pickedModelId: string) => {
    setSelectedModel(provider as AiProvider, pickedModelId)
    if (cascade[0] !== provider) {
      // Met le provider en tête de cascade ; conserve l'ordre relatif des autres.
      const next: ReasoningProvider[] = [provider, ...cascade.filter((p) => p !== provider)]
      setCascade(next)
    }
    setOpen(false)
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`flex items-center gap-1.5 text-[12px] border rounded-full px-2.5 py-1.5 transition-colors ${
          open
            ? 'bg-violet-500/[0.1] border-violet-500/30 text-white'
            : 'bg-white/[0.04] hover:bg-white/[0.06] border-white/10 text-white/90'
        }`}
        title={`Provider primaire — modèle ${modelId}. Cliquer pour changer.`}
      >
        {pulsing && <span className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-pulse" />}
        <span className="font-semibold">{getModelLabel(primary as AiProvider, modelId)}</span>
        <span className="text-white/40">{PROVIDER_LABEL[primary as AiProvider]}</span>
        <ChevronDown className={`w-3 h-3 text-white/40 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      <ModelPickerDropdown
        open={open}
        onClose={() => setOpen(false)}
        primaryProvider={primary}
        selectedModel={modelId}
        onPick={handlePick}
      />
    </div>
  )
}

interface ResponseProviderBadgeProps {
  provider: string
  model: string
}

/** Badge compact affiché sous une réponse assistant : provider + modèle réels. */
export function ResponseProviderBadge({ provider, model }: ResponseProviderBadgeProps) {
  const providerLabel = PROVIDER_LABEL[provider as AiProvider] ?? provider
  const modelLabel = getModelLabel(provider as AiProvider, model)
  return (
    <div className="flex items-center gap-1.5 text-[10.5px] text-white/35 mt-1.5">
      <Sparkles className="w-2.5 h-2.5" />
      <span>via {providerLabel}</span>
      <span className="text-white/20">·</span>
      <span className="font-mono">{modelLabel}</span>
    </div>
  )
}
