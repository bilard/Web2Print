import { useEffect, useRef } from 'react'
import { doc, getDoc, setDoc } from 'firebase/firestore'
import { db } from '@/lib/firebase/config'
import { useAuthStore } from '@/stores/auth.store'
import { useThemeStore, type ThemePref } from '@/stores/theme.store'

const DEBOUNCE_MS = 500
const isPref = (v: unknown): v is ThemePref => v === 'light' || v === 'dark' || v === 'system'

// Note de design : `themePref` reste volontairement HORS de `purgeLocalUserData`
// (cosmétique, non sensible — évite un flash au logout ; l'hydratation au login
// suivant remet la préférence du compte).
export function useThemeSync() {
  // [uid] et non [user] : évite le re-run (→ getDoc annulé) à chaque refresh de token. Cf. useAiSettingsSync.
  const uid = useAuthStore((s) => s.user?.uid)
  const hydratedRef = useRef(false)
  const timerRef = useRef<number | null>(null)

  // Hydratation au login
  useEffect(() => {
    hydratedRef.current = false
    if (!uid) return
    const baseline = useThemeStore.getState().themePref
    let cancelled = false
    getDoc(doc(db, 'users', uid))
      .then((snap) => {
        if (cancelled) return
        const remote = (snap.data()?.uiSettings as { theme?: unknown } | undefined)?.theme
        // N'applique le distant que si l'utilisateur n'a pas basculé pendant l'hydratation.
        if (isPref(remote) && useThemeStore.getState().themePref === baseline) {
          useThemeStore.getState().setThemePref(remote)
        }
      })
      .catch((e) => console.warn('[useThemeSync] hydrate failed:', e))
      .finally(() => { if (!cancelled) hydratedRef.current = true })
    return () => { cancelled = true }
  }, [uid])

  // Push débouncé sur changement
  useEffect(() => {
    if (!uid) return
    const unsubscribe = useThemeStore.subscribe((state, prev) => {
      if (!hydratedRef.current) return
      if (state.themePref === prev.themePref) return
      if (timerRef.current !== null) window.clearTimeout(timerRef.current)
      timerRef.current = window.setTimeout(() => {
        setDoc(doc(db, 'users', uid), { uiSettings: { theme: state.themePref } }, { merge: true })
          .catch((e) => console.warn('[useThemeSync] sync failed:', e))
      }, DEBOUNCE_MS)
    })
    return () => {
      unsubscribe()
      if (timerRef.current !== null) { window.clearTimeout(timerRef.current); timerRef.current = null }
    }
  }, [uid])
}
