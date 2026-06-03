/**
 * Cookies de session par site — stockés en localStorage.
 *
 * Utile pour les sites B2B qui cachent les prix derrière un login.
 * Le cookie est injecté dans la requête Bright Data côté Cloud Function,
 * ce qui fait que le site répond comme si c'était un utilisateur connecté.
 *
 * Format du cookie : string HTTP standard "NAME=value; NAME2=value2"
 * (copier-coller depuis DevTools → Application → Cookies → copier toutes les valeurs).
 */

const PREFIX = 'designstudio_sitecookie_'

/** Émis quand un cookie change → `useSiteCookiesSync` pousse vers Firestore (debounce)
 *  et `SiteCookiesSection` rafraîchit son affichage. */
export const SITE_COOKIES_UPDATED_EVENT = 'sitecookies:updated'
/** Émis après hydratation depuis Firestore → l'UI rafraîchit la liste. */
export const SITE_COOKIES_HYDRATED_EVENT = 'sitecookies:hydrated'

function notifyUpdated() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(SITE_COOKIES_UPDATED_EVENT))
  }
}

export interface SiteCookieEntry {
  hostname: string
  cookie: string
}

export function getSiteCookie(hostname: string): string {
  return localStorage.getItem(PREFIX + hostname) || ''
}

export function setSiteCookie(hostname: string, cookie: string) {
  if (cookie.trim()) {
    localStorage.setItem(PREFIX + hostname, cookie.trim())
  } else {
    localStorage.removeItem(PREFIX + hostname)
  }
  notifyUpdated()
}

export function removeSiteCookie(hostname: string) {
  localStorage.removeItem(PREFIX + hostname)
  notifyUpdated()
}

export function listSiteCookies(): SiteCookieEntry[] {
  const out: SiteCookieEntry[] = []
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)
    if (key?.startsWith(PREFIX)) {
      const hostname = key.slice(PREFIX.length)
      const cookie = localStorage.getItem(key) || ''
      if (hostname && cookie) out.push({ hostname, cookie })
    }
  }
  return out.sort((a, b) => a.hostname.localeCompare(b.hostname))
}

/** Retourne le cookie pour l'hostname d'une URL donnée. */
export function getSiteCookieForUrl(url: string): string {
  try {
    const hostname = new URL(url).hostname
    return getSiteCookie(hostname)
  } catch {
    return ''
  }
}
