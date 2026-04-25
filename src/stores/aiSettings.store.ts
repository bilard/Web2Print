import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { AI_MODELS, getModel, getDefaultModel, type AiProvider, type AiModelInfo } from '@/lib/aiModels'

interface AiSettingsState {
  selectedModel: Record<AiProvider, string>
  fetchedModels: Record<AiProvider, AiModelInfo[]>
  setSelectedModel: (provider: AiProvider, id: string) => void
  setFetchedModels: (provider: AiProvider, models: AiModelInfo[]) => void
}

export const initialSelected = (): Record<AiProvider, string> => ({
  claude: getDefaultModel('claude').id,
  gemini: getDefaultModel('gemini').id,
  openai: getDefaultModel('openai').id,
})

export const useAiSettingsStore = create<AiSettingsState>()(
  persist(
    (set) => ({
      selectedModel: initialSelected(),
      fetchedModels: { claude: [], gemini: [], openai: [] },
      setSelectedModel: (provider, id) =>
        set((s) => ({ selectedModel: { ...s.selectedModel, [provider]: id } })),
      setFetchedModels: (provider, models) =>
        set((s) => ({ fetchedModels: { ...s.fetchedModels, [provider]: models } })),
    }),
    { name: 'designstudio_ai_settings', partialize: (s) => ({ selectedModel: s.selectedModel }) },
  ),
)

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
