import { create } from 'zustand'

export type ThemePref = 'light' | 'dark' | 'system'

const STORAGE_KEY = 'themePref'

function systemIsLight(): boolean {
  return typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-color-scheme: light)').matches
}

function resolve(pref: ThemePref): 'light' | 'dark' {
  return pref === 'system' ? (systemIsLight() ? 'light' : 'dark') : pref
}

export function initialThemePref(): ThemePref {
  try {
    const v = localStorage.getItem(STORAGE_KEY)
    return v === 'light' || v === 'dark' || v === 'system' ? v : 'dark'
  } catch {
    return 'dark' // localStorage indisponible (Safari privé) : défaut sombre
  }
}

function applyToDom(resolved: 'light' | 'dark') {
  const el = document.documentElement
  el.classList.toggle('light', resolved === 'light')
  el.classList.toggle('dark', resolved === 'dark')
}

interface ThemeState {
  themePref: ThemePref
  resolvedTheme: 'light' | 'dark'
  setThemePref: (pref: ThemePref) => void
}

const pref = initialThemePref()

export const useThemeStore = create<ThemeState>((set) => ({
  themePref: pref,
  resolvedTheme: resolve(pref),
  setThemePref: (pref) => {
    try {
      localStorage.setItem(STORAGE_KEY, pref)
    } catch { /* localStorage indisponible (Safari privé) : pas de persistance */ }
    const resolved = resolve(pref)
    applyToDom(resolved)
    set({ themePref: pref, resolvedTheme: resolved })
  },
}))

// Init à l'import : aligne le DOM (l'anti-flash d'index.html a déjà posé la classe
// pour les utilisateurs en clair ; ici on couvre aussi le cas « system »).
applyToDom(resolve(pref))

// Suit les changements de thème OS quand la préférence est « system ».
if (typeof window.matchMedia === 'function') {
  window.matchMedia('(prefers-color-scheme: light)').addEventListener('change', () => {
    const { themePref } = useThemeStore.getState()
    if (themePref !== 'system') return
    const resolved = resolve('system')
    applyToDom(resolved)
    useThemeStore.setState({ resolvedTheme: resolved })
  })
}
