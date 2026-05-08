import { useEffect, useRef } from 'react'
import { Check, Settings, ExternalLink } from 'lucide-react'
import { useAiSettingsStore, getEffectiveModelList } from '@/stores/aiSettings.store'
import type { AiProvider, AiModelInfo } from '@/lib/aiModels'
import type { ReasoningProvider } from '@/stores/aiSettings.store'

const PROVIDER_LABEL: Record<AiProvider, string> = {
  claude: 'Claude (Anthropic)',
  gemini: 'Gemini (Google)',
  openai: 'OpenAI',
  deepseek: 'DeepSeek',
  qwen: 'Qwen',
  kimi: 'Kimi',
  openrouter: 'OpenRouter',
}

interface ModelPickerDropdownProps {
  open: boolean
  onClose: () => void
  /** Provider primaire actuel — modèles affichés en premier. */
  primaryProvider: ReasoningProvider
  selectedModel: string
  /** Au clic sur un modèle : set le modèle ET met le provider en tête de cascade. */
  onPick: (provider: ReasoningProvider, modelId: string) => void
}

/** Formate "in/out $X/$Y per M" pour l'item — si gratuit, ne rien afficher. */
function priceTag(m: AiModelInfo): string {
  const { input, output } = m.pricing
  if (input === 0 && output === 0) return 'free'
  return `$${input}/$${output}`
}

export function ModelPickerDropdown({
  open,
  onClose,
  primaryProvider,
  selectedModel,
  onPick,
}: ModelPickerDropdownProps) {
  const cascade = useAiSettingsStore((s) => s.reasoningCascade)
  const ref = useRef<HTMLDivElement>(null)

  // Click outside / Escape pour fermer
  useEffect(() => {
    if (!open) return
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('mousedown', handleClick)
    document.addEventListener('keydown', handleKey)
    return () => {
      document.removeEventListener('mousedown', handleClick)
      document.removeEventListener('keydown', handleKey)
    }
  }, [open, onClose])

  if (!open) return null

  // Ordre d'affichage : primary en haut, puis le reste de la cascade.
  const orderedProviders: ReasoningProvider[] = [
    primaryProvider,
    ...cascade.filter((p) => p !== primaryProvider),
  ]

  return (
    <div
      ref={ref}
      className="absolute bottom-full right-0 mb-2 w-[340px] max-h-[440px] bg-[#1c1c1c] border border-white/[0.1] rounded-xl shadow-2xl shadow-black/50 overflow-hidden flex flex-col z-50"
    >
      <div className="overflow-y-auto flex-1 py-1.5">
        {orderedProviders.map((provider, providerIdx) => {
          const models = getEffectiveModelList(provider as AiProvider)
          const isPrimary = providerIdx === 0
          return (
            <div key={provider} className={providerIdx > 0 ? 'border-t border-white/[0.06] mt-1 pt-1' : ''}>
              <div className="px-3 py-1.5 flex items-center justify-between">
                <span className="text-[10px] uppercase tracking-wider text-white/40 font-semibold">
                  {PROVIDER_LABEL[provider as AiProvider]}
                </span>
                {isPrimary && (
                  <span className="text-[9px] text-violet-300 bg-violet-500/15 px-1.5 py-0.5 rounded">
                    primaire
                  </span>
                )}
              </div>
              {models.map((m) => {
                const isSelected = isPrimary && m.id === selectedModel
                return (
                  <button
                    key={`${provider}:${m.id}`}
                    type="button"
                    onClick={() => onPick(provider, m.id)}
                    className={`w-full flex items-center gap-2 px-3 py-1.5 text-left transition-colors ${
                      isSelected
                        ? 'bg-violet-500/[0.08] text-white'
                        : 'text-white/75 hover:bg-white/[0.04] hover:text-white'
                    }`}
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-[12.5px] font-medium truncate">{m.label}</p>
                      <p className="text-[10px] font-mono text-white/30 truncate">{m.id}</p>
                    </div>
                    <span className="text-[10px] text-white/35 font-mono shrink-0">{priceTag(m)}</span>
                    {isSelected && <Check className="w-3.5 h-3.5 text-violet-400 shrink-0" />}
                  </button>
                )
              })}
            </div>
          )
        })}
      </div>
      <a
        href="#settings"
        onClick={(e) => {
          e.preventDefault()
          onClose()
          // L'event "open-settings" sera capturé par le DashboardPage si on
          // l'a câblé. Sinon, fallback : on demande à l'user d'ouvrir Réglages
          // manuellement via un toast informatif.
          window.dispatchEvent(new CustomEvent('app:open-settings', { detail: { tab: 'ai' } }))
        }}
        className="flex items-center justify-between px-3 py-2 border-t border-white/[0.08] text-[11.5px] text-white/55 hover:text-violet-300 hover:bg-white/[0.04] transition-colors"
      >
        <span className="flex items-center gap-1.5">
          <Settings className="w-3 h-3" />
          Cascade & clés API → Réglages
        </span>
        <ExternalLink className="w-3 h-3 opacity-50" />
      </a>
    </div>
  )
}
