import { useEffect, useRef } from 'react'
import { doc, getDoc, setDoc } from 'firebase/firestore'
import { db } from '@/lib/firebase/config'
import { useAuthStore } from '@/stores/auth.store'
import { API_KEYS } from '@/lib/apiKeys'

const STORAGE_PREFIX = 'designstudio_apikey_'

/** Clés synchronisables : on exclut les clés Firebase elles-mêmes (firebase_*)
 *  pour éviter le bootstrap : la connexion Firestore sert à hydrater… les
 *  credentials Firestore. */
const SYNCABLE_IDS = API_KEYS
  .filter((k) => !k.id.startsWith('firebase_'))
  .map((k) => k.id)

/** Event émis après hydratation depuis Firestore — SettingsPanel s'y abonne
 *  pour rafraîchir les inputs/tests sans nécessiter un reload navigateur. */
export const API_KEYS_HYDRATED_EVENT = 'apikeys:hydrated'
export const API_KEYS_UPDATED_EVENT = 'apikeys:updated'

interface ApiKeysDoc {
  /** Map id → valeur (string). Vide = pas d'override. */
  overrides?: Record<string, string>
  updatedAt?: number
}

/**
 * Synchronise les clés API entre localStorage et Firestore (`users/{uid}.apiKeys`).
 *
 * - Au login : récupère les overrides depuis Firestore → écrit dans localStorage
 *   → émet `apikeys:hydrated` pour que l'UI rafraîchisse les inputs/tests.
 * - À chaque changement (via `setApiKey()` qui dispatch `apikeys:updated`) :
 *   debounce puis push vers Firestore.
 *
 * Les clés Firebase (firebase_api / firebase_project / firebase_storage) sont
 * exclues — leur valeur sert à connecter Firestore, on ne peut pas l'y stocker.
 */
export function useApiKeysSync() {
  const user = useAuthStore((s) => s.user)
  const hydratedRef = useRef(false)
  const debounceRef = useRef<number | null>(null)

  // Hydrate depuis Firestore au login
  useEffect(() => {
    hydratedRef.current = false
    if (!user) return

    let cancelled = false
    const ref = doc(db, 'users', user.uid)
    getDoc(ref)
      .then((snap) => {
        if (cancelled) return
        const data = snap.data()?.apiKeys as ApiKeysDoc | undefined
        if (data?.overrides) {
          for (const id of SYNCABLE_IDS) {
            const remote = data.overrides[id]
            if (typeof remote === 'string' && remote.trim()) {
              localStorage.setItem(`${STORAGE_PREFIX}${id}`, remote.trim())
            }
            // Si Firestore dit explicitement "vide string" → reset local override.
            // (On ne fait pas ça pour les clés absentes — elles peuvent simplement
            // n'avoir jamais été synchronisées depuis cet appareil.)
          }
          window.dispatchEvent(new CustomEvent(API_KEYS_HYDRATED_EVENT))
        }
      })
      .catch((e) => console.warn('[useApiKeysSync] hydrate failed:', e))
      .finally(() => { if (!cancelled) hydratedRef.current = true })

    return () => { cancelled = true }
  }, [user])

  // Push vers Firestore à chaque update local (debounced)
  useEffect(() => {
    if (!user) return

    const handler = () => {
      if (!hydratedRef.current) return
      if (debounceRef.current !== null) window.clearTimeout(debounceRef.current)
      debounceRef.current = window.setTimeout(() => {
        const overrides: Record<string, string> = {}
        for (const id of SYNCABLE_IDS) {
          const v = localStorage.getItem(`${STORAGE_PREFIX}${id}`)
          if (v) overrides[id] = v
        }
        const ref = doc(db, 'users', user.uid)
        setDoc(
          ref,
          { apiKeys: { overrides, updatedAt: Date.now() } },
          { merge: true },
        ).catch((e) => console.warn('[useApiKeysSync] sync failed:', e))
      }, 500)
    }

    window.addEventListener(API_KEYS_UPDATED_EVENT, handler)
    return () => {
      window.removeEventListener(API_KEYS_UPDATED_EVENT, handler)
      if (debounceRef.current !== null) window.clearTimeout(debounceRef.current)
    }
  }, [user])
}
