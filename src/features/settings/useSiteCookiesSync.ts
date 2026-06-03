import { useEffect, useRef } from 'react'
import { doc, getDoc, setDoc } from 'firebase/firestore'
import { db } from '@/lib/firebase/config'
import { useAuthStore } from '@/stores/auth.store'
import {
  listSiteCookies,
  setSiteCookie,
  SITE_COOKIES_UPDATED_EVENT,
  SITE_COOKIES_HYDRATED_EVENT,
  type SiteCookieEntry,
} from '@/lib/siteCookies'

/**
 * Synchronise les cookies de session B2B (`designstudio_sitecookie_*` en localStorage)
 * avec Firestore `users/{uid}.siteCookies` (tableau d'entrées). Calqué sur useApiKeysSync.
 *
 * Indispensable car le localStorage est purgé au changement de compte (sécurité multi-user) :
 * sans copie Firestore, les cookies seraient perdus à chaque déconnexion. Avec ce hook ils
 * sont re-hydratés au login — et restent isolés par utilisateur (doc privé `users/{uid}`).
 */
export function useSiteCookiesSync() {
  const user = useAuthStore((s) => s.user)
  const hydratedRef = useRef(false)
  const debounceRef = useRef<number | null>(null)

  // Hydrate depuis Firestore au login : le localStorage reflète EXACTEMENT les cookies
  // du user courant (ajoute les distants, retire les locaux absents du doc).
  useEffect(() => {
    hydratedRef.current = false
    if (!user) return

    let cancelled = false
    getDoc(doc(db, 'users', user.uid))
      .then((snap) => {
        if (cancelled) return
        const remote = (snap.data()?.siteCookies as SiteCookieEntry[] | undefined) ?? []
        const remoteHosts = new Set(remote.map((e) => e.hostname))
        // Restaure les cookies distants.
        for (const { hostname, cookie } of remote) {
          if (hostname && typeof cookie === 'string' && cookie.trim()) {
            setSiteCookie(hostname, cookie)
          }
        }
        // Cookies présents UNIQUEMENT en localStorage (jamais synchronisés) → on les
        // SAUVEGARDE dans Firestore au lieu de les supprimer (l'isolation entre comptes est
        // déjà assurée par purgeLocalUserData() qui vide le localStorage au changement de compte).
        const hasLocalOnly = listSiteCookies().some((e) => !remoteHosts.has(e.hostname))
        if (hasLocalOnly) {
          setDoc(doc(db, 'users', user.uid), { siteCookies: listSiteCookies() }, { merge: true })
            .catch((e) => console.warn('[useSiteCookiesSync] backfill failed:', e))
        }
        window.dispatchEvent(new CustomEvent(SITE_COOKIES_HYDRATED_EVENT))
      })
      .catch((e) => console.warn('[useSiteCookiesSync] hydrate failed:', e))
      .finally(() => { if (!cancelled) hydratedRef.current = true })

    return () => { cancelled = true }
  }, [user])

  // Pousse vers Firestore à chaque changement local (debounced). Garde anti-boucle :
  // ne pousse pas pendant l'hydratation (qui émet aussi `sitecookies:updated`).
  useEffect(() => {
    if (!user) return

    const handler = () => {
      if (!hydratedRef.current) return
      if (debounceRef.current !== null) window.clearTimeout(debounceRef.current)
      debounceRef.current = window.setTimeout(() => {
        setDoc(
          doc(db, 'users', user.uid),
          { siteCookies: listSiteCookies() },
          { merge: true },
        ).catch((e) => console.warn('[useSiteCookiesSync] sync failed:', e))
      }, 500)
    }

    window.addEventListener(SITE_COOKIES_UPDATED_EVENT, handler)
    return () => {
      window.removeEventListener(SITE_COOKIES_UPDATED_EVENT, handler)
      if (debounceRef.current !== null) window.clearTimeout(debounceRef.current)
    }
  }, [user])
}
