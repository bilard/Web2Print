import { useEffect, useRef } from 'react'
import { doc, getDoc, setDoc } from 'firebase/firestore'
import { db } from '@/lib/firebase/config'
import { useAuthStore } from '@/stores/auth.store'
import { useAiSettingsStore } from '@/stores/aiSettings.store'
import type { AiProvider } from '@/lib/aiModels'

const DEBOUNCE_MS = 500

export function useAiSettingsSync() {
  const user = useAuthStore((s) => s.user)
  const hydratedRef = useRef(false)
  const debounceTimerRef = useRef<number | null>(null)

  // Hydrate from Firestore on login
  useEffect(() => {
    hydratedRef.current = false
    if (!user) return

    const ref = doc(db, 'users', user.uid)
    getDoc(ref)
      .then((snap) => {
        const remote = snap.data()?.aiSettings?.selectedModel as
          | Partial<Record<AiProvider, string>>
          | undefined
        if (remote) {
          const current = useAiSettingsStore.getState().selectedModel
          useAiSettingsStore.setState({
            selectedModel: { ...current, ...remote },
          })
        }
      })
      .catch((e) => console.warn('[useAiSettingsSync] hydrate failed:', e))
      .finally(() => { hydratedRef.current = true })
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
