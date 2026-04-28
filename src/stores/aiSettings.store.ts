import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { AI_MODELS, getModel, getDefaultModel, type AiProvider, type AiModelInfo } from '@/lib/aiModels'

/** Providers supportés pour les tâches de raisonnement texte/JSON
 *  (extraction scraping, Art Director, amélioration de prompt). Tous les
 *  providers de cette liste sont câblés dans les fonctions concernées. */
export type ReasoningProvider = 'gemini' | 'claude' | 'deepseek' | 'qwen'

export const REASONING_PROVIDERS: ReasoningProvider[] = ['gemini', 'claude', 'deepseek', 'qwen']

interface AiSettingsState {
  selectedModel: Record<AiProvider, string>
  fetchedModels: Record<AiProvider, AiModelInfo[]>
  /** Cascade ordonnée des providers à essayer, du primaire au dernier
   *  fallback. Le premier qui répond gagne. Min 1, max REASONING_PROVIDERS.length. */
  reasoningCascade: ReasoningProvider[]
  setSelectedModel: (provider: AiProvider, id: string) => void
  setFetchedModels: (provider: AiProvider, models: AiModelInfo[]) => void
  setReasoningCascade: (cascade: ReasoningProvider[]) => void
}

export const initialSelected = (): Record<AiProvider, string> => ({
  claude: getDefaultModel('claude').id,
  gemini: getDefaultModel('gemini').id,
  openai: getDefaultModel('openai').id,
  deepseek: getDefaultModel('deepseek').id,
  qwen: getDefaultModel('qwen').id,
  kimi: getDefaultModel('kimi').id,
})

function sanitizeCascade(cascade: unknown): ReasoningProvider[] {
  if (!Array.isArray(cascade)) return ['gemini', 'claude']
  const seen = new Set<ReasoningProvider>()
  const valid = cascade.filter((p): p is ReasoningProvider => REASONING_PROVIDERS.includes(p as ReasoningProvider))
  for (const p of valid) seen.add(p)
  if (seen.size === 0) return ['gemini', 'claude']
  return Array.from(seen)
}

export const useAiSettingsStore = create<AiSettingsState>()(
  persist(
    (set) => ({
      selectedModel: initialSelected(),
      fetchedModels: { claude: [], gemini: [], openai: [], deepseek: [], qwen: [], kimi: [] },
      // Default cascade : Gemini (free tier) puis Claude Opus en fallback. Les
      // providers chinois sont disponibles mais non activés par défaut.
      reasoningCascade: ['gemini', 'claude'],
      setSelectedModel: (provider, id) =>
        set((s) => ({ selectedModel: { ...s.selectedModel, [provider]: id } })),
      setFetchedModels: (provider, models) =>
        set((s) => ({ fetchedModels: { ...s.fetchedModels, [provider]: models } })),
      setReasoningCascade: (cascade) => set({ reasoningCascade: sanitizeCascade(cascade) }),
    }),
    {
      name: 'designstudio_ai_settings',
      partialize: (s) => ({
        selectedModel: s.selectedModel,
        reasoningCascade: s.reasoningCascade,
      }),
      // Migration depuis l'ancien champ primaryReasoningProvider (single value)
      // vers reasoningCascade (array). Garde Claude en fallback automatique.
      migrate: (persisted: unknown) => {
        if (!persisted || typeof persisted !== 'object') return persisted
        const obj = persisted as Record<string, unknown>
        if (!Array.isArray(obj.reasoningCascade) && typeof obj.primaryReasoningProvider === 'string') {
          const primary = obj.primaryReasoningProvider as ReasoningProvider
          obj.reasoningCascade = primary === 'claude' ? ['claude', 'gemini'] : ['gemini', 'claude']
          delete obj.primaryReasoningProvider
        }
        return obj
      },
      version: 2,
    },
  ),
)

/** Lecture synchrone de la cascade. Utilisable hors React. */
export function getReasoningCascade(): ReasoningProvider[] {
  return useAiSettingsStore.getState().reasoningCascade
}

export function getSelectedModel(provider: AiProvider): string {
  const id = useAiSettingsStore.getState().selectedModel[provider]
  const fromCatalog = getModel(provider, id)
  if (fromCatalog) return id
  const fromFetched = useAiSettingsStore.getState().fetchedModels[provider].find((m) => m.id === id)
  if (fromFetched) return id
  return getDefaultModel(provider).id
}

export function getEffectiveModelList(provider: AiProvider): AiModelInfo[] {
  const catalog = AI_MODELS[provider]
  const fetched = useAiSettingsStore.getState().fetchedModels[provider]
  const seen = new Set(catalog.map((m) => m.id))
  const extras = fetched.filter((m) => !seen.has(m.id))
  return [...catalog, ...extras]
}
