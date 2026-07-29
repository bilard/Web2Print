import { useEffect, useRef } from 'react'
import { doc, getDoc, setDoc } from 'firebase/firestore'
import { db } from '@/lib/firebase/config'
import { useAuthStore } from '@/stores/auth.store'
import { useLocaleStore, type Locale } from '@/stores/locale.store'

const DEBOUNCE_MS = 500
const isLocale = (v: unknown): v is Locale => v === 'fr' || v === 'en'

/**
 * Synchronise la langue avec `users/{uid}.uiSettings.locale`.
 *
 * Calqué sur `useThemeSync` — MAIS pour une raison de plus que le confort
 * multi-appareils : les workflows exécutés par le CRON tournent dans Cloud
 * Functions, sans navigateur ni localStorage. Leurs messages de run
 * atterrissent dans la même console que ceux du client ; sans cette valeur
 * en base, le serveur n'a aucun moyen de savoir dans quelle langue écrire.
 *
 * Même politique que le thème : pas de backfill local → Firestore. Un compte
 * qui n'a jamais choisi hérite de la langue de la machine, et le serveur
 * retombe sur le français.
 */
export function useLocaleSync() {
  // [uid] et non [user] : évite le re-run à chaque refresh de token. Cf. useThemeSync.
  const uid = useAuthStore((s) => s.user?.uid)
  const hydratedRef = useRef(false)
  const timerRef = useRef<number | null>(null)

  // Hydratation au login
  useEffect(() => {
    hydratedRef.current = false
    if (!uid) return
    const baseline = useLocaleStore.getState().locale
    let cancelled = false
    getDoc(doc(db, 'users', uid))
      .then((snap) => {
        if (cancelled) return
        const remote = (snap.data()?.uiSettings as { locale?: unknown } | undefined)?.locale
        // N'applique le distant que si l'utilisateur n'a pas basculé pendant l'hydratation.
        if (isLocale(remote) && useLocaleStore.getState().locale === baseline) {
          useLocaleStore.getState().setLocale(remote)
        }
      })
      .catch((e) => console.warn('[useLocaleSync] hydrate failed:', e))
      .finally(() => { if (!cancelled) hydratedRef.current = true })
    return () => { cancelled = true }
  }, [uid])

  // Push débouncé sur changement
  useEffect(() => {
    if (!uid) return
    const unsubscribe = useLocaleStore.subscribe((state, prev) => {
      if (!hydratedRef.current) return
      if (state.locale === prev.locale) return
      if (timerRef.current !== null) window.clearTimeout(timerRef.current)
      timerRef.current = window.setTimeout(() => {
        setDoc(doc(db, 'users', uid), { uiSettings: { locale: state.locale } }, { merge: true })
          .catch((e) => console.warn('[useLocaleSync] sync failed:', e))
      }, DEBOUNCE_MS)
    })
    return () => {
      unsubscribe()
      if (timerRef.current !== null) { window.clearTimeout(timerRef.current); timerRef.current = null }
    }
  }, [uid])
}
