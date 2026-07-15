import { useEffect, useRef } from 'react'
import { doc, getDoc, setDoc } from 'firebase/firestore'
import { db } from '@/lib/firebase/config'
import { useAuthStore } from '@/stores/auth.store'
import { useAiSettingsStore, initialSelected, initialBudgets, DEFAULT_REASONING_CASCADE, type ReasoningProvider } from '@/stores/aiSettings.store'
import type { AiProvider, AiModelInfo } from '@/lib/aiModels'

const DEBOUNCE_MS = 500

export function useAiSettingsSync() {
  // [uid] et non [user] : évite le re-run (→ getDoc annulé) à chaque refresh de token. Cf. useTelegramSettingsSync.
  const uid = useAuthStore((s) => s.user?.uid)
  const hydratedRef = useRef(false)
  const debounceTimerRef = useRef<number | null>(null)

  // Hydrate from Firestore on login
  useEffect(() => {
    hydratedRef.current = false
    if (!uid) {
      useAiSettingsStore.setState({
        selectedModel: initialSelected(),
        fetchedModels: { claude: [], gemini: [], openai: [], deepseek: [], qwen: [], kimi: [], glm: [], openrouter: [] },
        reasoningCascade: DEFAULT_REASONING_CASCADE,
        monthlyBudgetUsd: initialBudgets(),
        brightDataBudgetUsd: null,
      })
      return
    }

    // Reset to defaults BEFORE hydration so we never inherit a previous user's state.
    // (purgeLocalUserData efface localStorage au CHANGEMENT de compte, mais pas le store
    //  en mémoire lors d'un switch sans reload → ce reset garantit l'isolation par user.)
    useAiSettingsStore.setState({
      selectedModel: initialSelected(),
      fetchedModels: { claude: [], gemini: [], openai: [], deepseek: [], qwen: [], kimi: [], glm: [], openrouter: [] },
      reasoningCascade: DEFAULT_REASONING_CASCADE,
      monthlyBudgetUsd: initialBudgets(),
      brightDataBudgetUsd: null,
    })
    // Snapshot the post-reset baseline; any divergence après ça = un clic user pendant l'hydratation.
    const s0 = useAiSettingsStore.getState()
    const baseline = {
      selectedModel: s0.selectedModel,
      reasoningCascade: s0.reasoningCascade,
      monthlyBudgetUsd: s0.monthlyBudgetUsd,
      brightDataBudgetUsd: s0.brightDataBudgetUsd,
    }

    let cancelled = false
    const ref = doc(db, 'users', uid)
    getDoc(ref)
      .then((snap) => {
        if (cancelled) return
        const ai = snap.data()?.aiSettings as
          | {
              selectedModel?: Partial<Record<AiProvider, string>>
              fetchedModels?: Partial<Record<AiProvider, AiModelInfo[]>>
              reasoningCascade?: ReasoningProvider[]
              monthlyBudgetUsd?: Partial<Record<AiProvider, number | null>>
              brightDataBudgetUsd?: number | null
            }
          | undefined
        if (!ai) return

        // Hydrate fetchedModels first so the UI has metadata when applying selectedModel.
        if (ai.fetchedModels) {
          const current = useAiSettingsStore.getState().fetchedModels
          useAiSettingsStore.setState({
            fetchedModels: {
              claude: ai.fetchedModels.claude ?? current.claude,
              gemini: ai.fetchedModels.gemini ?? current.gemini,
              openai: ai.fetchedModels.openai ?? current.openai,
              deepseek: ai.fetchedModels.deepseek ?? current.deepseek,
              qwen: ai.fetchedModels.qwen ?? current.qwen,
              kimi: ai.fetchedModels.kimi ?? current.kimi,
              glm: ai.fetchedModels.glm ?? current.glm,
              openrouter: ai.fetchedModels.openrouter ?? current.openrouter,
            },
          })
        }

        if (ai.selectedModel) {
          // For each provider: take remote unless the user already changed the value during the in-flight window.
          const live = useAiSettingsStore.getState().selectedModel
          const next = { ...live }
          for (const key of Object.keys(ai.selectedModel) as AiProvider[]) {
            if (live[key] === baseline.selectedModel[key]) {
              // User hasn't touched this provider during hydration → safe to apply remote.
              next[key] = ai.selectedModel[key]!
            }
          }
          useAiSettingsStore.setState({ selectedModel: next })
        }

        // Cascade de raisonnement (sélection des LLM) + budgets : appliqués seulement si
        // l'utilisateur n'y a pas touché pendant la fenêtre d'hydratation (égalité de
        // référence avec la baseline post-reset). Cascade routée par setReasoningCascade
        // pour passer par sanitizeCascade (ignore un tableau distant vide/corrompu).
        const store = useAiSettingsStore.getState()
        if (ai.reasoningCascade && store.reasoningCascade === baseline.reasoningCascade) {
          store.setReasoningCascade(ai.reasoningCascade)
        }
        if (ai.monthlyBudgetUsd && store.monthlyBudgetUsd === baseline.monthlyBudgetUsd) {
          useAiSettingsStore.setState({ monthlyBudgetUsd: { ...initialBudgets(), ...ai.monthlyBudgetUsd } })
        }
        if (typeof ai.brightDataBudgetUsd !== 'undefined' && store.brightDataBudgetUsd === baseline.brightDataBudgetUsd) {
          store.setBrightDataBudgetUsd(ai.brightDataBudgetUsd)
        }
      })
      .catch((e) => console.warn('[useAiSettingsSync] hydrate failed:', e))
      .finally(() => { if (!cancelled) hydratedRef.current = true })

    return () => { cancelled = true }
  }, [uid])

  // Subscribe + push to Firestore on change (debounced)
  useEffect(() => {
    if (!uid) return

    const unsubscribe = useAiSettingsStore.subscribe((state, prev) => {
      if (!hydratedRef.current) return
      if (
        state.selectedModel === prev.selectedModel &&
        state.fetchedModels === prev.fetchedModels &&
        state.reasoningCascade === prev.reasoningCascade &&
        state.monthlyBudgetUsd === prev.monthlyBudgetUsd &&
        state.brightDataBudgetUsd === prev.brightDataBudgetUsd
      ) return

      if (debounceTimerRef.current !== null) {
        window.clearTimeout(debounceTimerRef.current)
      }
      debounceTimerRef.current = window.setTimeout(() => {
        const ref = doc(db, 'users', uid)
        setDoc(
          ref,
          {
            aiSettings: {
              selectedModel: state.selectedModel,
              fetchedModels: state.fetchedModels,
              reasoningCascade: state.reasoningCascade,
              monthlyBudgetUsd: state.monthlyBudgetUsd,
              brightDataBudgetUsd: state.brightDataBudgetUsd,
            },
          },
          { merge: true },
        ).catch((e) => console.warn('[useAiSettingsSync] sync failed:', e))
      }, DEBOUNCE_MS)
    })

    return () => {
      unsubscribe()
      if (debounceTimerRef.current !== null) {
        window.clearTimeout(debounceTimerRef.current)
        debounceTimerRef.current = null
      }
    }
  }, [uid])
}
