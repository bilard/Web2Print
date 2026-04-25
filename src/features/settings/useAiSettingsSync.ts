import { useEffect, useRef } from 'react'
import { doc, getDoc, setDoc } from 'firebase/firestore'
import { db } from '@/lib/firebase/config'
import { useAuthStore } from '@/stores/auth.store'
import { useAiSettingsStore, initialSelected } from '@/stores/aiSettings.store'
import type { AiProvider } from '@/lib/aiModels'

const DEBOUNCE_MS = 500

export function useAiSettingsSync() {
  const user = useAuthStore((s) => s.user)
  const hydratedRef = useRef(false)
  const debounceTimerRef = useRef<number | null>(null)

  // Hydrate from Firestore on login
  useEffect(() => {
    hydratedRef.current = false
    if (!user) {
      useAiSettingsStore.setState({ selectedModel: initialSelected() })
      return
    }

    // Reset to defaults BEFORE hydration so we never inherit a previous user's state.
    useAiSettingsStore.setState({ selectedModel: initialSelected() })
    // Snapshot the post-reset baseline; any divergence after this is a user click during hydration.
    const baseline = useAiSettingsStore.getState().selectedModel

    let cancelled = false
    const ref = doc(db, 'users', user.uid)
    getDoc(ref)
      .then((snap) => {
        if (cancelled) return
        const remote = snap.data()?.aiSettings?.selectedModel as
          | Partial<Record<AiProvider, string>>
          | undefined
        if (!remote) return
        // For each provider: take remote unless the user already changed the value during the in-flight window.
        const live = useAiSettingsStore.getState().selectedModel
        const next = { ...live }
        for (const key of Object.keys(remote) as AiProvider[]) {
          if (live[key] === baseline[key]) {
            // User hasn't touched this provider during hydration → safe to apply remote.
            next[key] = remote[key]!
          }
        }
        useAiSettingsStore.setState({ selectedModel: next })
      })
      .catch((e) => console.warn('[useAiSettingsSync] hydrate failed:', e))
      .finally(() => { if (!cancelled) hydratedRef.current = true })

    return () => { cancelled = true }
  }, [user])

  // Subscribe + push to Firestore on change (debounced)
  useEffect(() => {
    if (!user) return

    const unsubscribe = useAiSettingsStore.subscribe((state, prev) => {
      if (!hydratedRef.current) return
      if (state.selectedModel === prev.selectedModel) return

      if (debounceTimerRef.current !== null) {
        window.clearTimeout(debounceTimerRef.current)
      }
      debounceTimerRef.current = window.setTimeout(() => {
        const ref = doc(db, 'users', user.uid)
        setDoc(
          ref,
          { aiSettings: { selectedModel: state.selectedModel } },
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
  }, [user])
}
