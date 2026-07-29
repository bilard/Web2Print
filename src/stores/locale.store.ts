import { create } from 'zustand'
import { recordAudit } from '@/lib/auditLog'

/** Langues servies par l'application. `en` = anglais BRITANNIQUE (en-GB). */
export type Locale = 'fr' | 'en'

const STORAGE_KEY = 'localePref'

/**
 * ⚠️ Ce store ne connaît QUE la langue courante — il n'importe aucun catalogue.
 * C'est `lib/i18n` qui lit le store (et pas l'inverse), ce qui évite le cycle
 * store ↔ catalogue relevé par `npm run cycles`.
 */
function isLocale(v: unknown): v is Locale {
  return v === 'fr' || v === 'en'
}

/** Langue initiale : préférence stockée, sinon langue du navigateur, sinon FR. */
function initialLocale(): Locale {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (isLocale(stored)) return stored
  } catch { /* localStorage indisponible (Safari privé) : on retombe sur le navigateur */ }
  return navigator.language?.toLowerCase().startsWith('en') ? 'en' : 'fr'
}

interface LocaleState {
  locale: Locale
  setLocale: (locale: Locale) => void
}

const initial = initialLocale()

function applyToDom(locale: Locale) {
  // `en-GB` et non `en` : pilote les césures, guillemets et l'orthographe du correcteur.
  document.documentElement.lang = locale === 'en' ? 'en-GB' : 'fr'
}

export const useLocaleStore = create<LocaleState>((set, get) => ({
  locale: initial,
  setLocale: (locale) => {
    const before = get().locale
    if (before === locale) return
    try {
      localStorage.setItem(STORAGE_KEY, locale)
    } catch { /* localStorage indisponible (Safari privé) : pas de persistance */ }
    applyToDom(locale)
    set({ locale })
    void recordAudit({ action: 'settings.locale', module: 'settings', meta: { before, after: locale } })
  },
}))

applyToDom(initial)
