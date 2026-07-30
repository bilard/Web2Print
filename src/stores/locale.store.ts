import { create } from 'zustand'
import { recordAudit } from '@/lib/auditLog'

/**
 * Langues servies par l'application. `en` = anglais BRITANNIQUE (en-GB).
 *
 * ⚠️ Seules `fr` et `en` possèdent un CATALOGUE COMPILÉ (`lib/i18n/fr.ts`,
 * `en.ts`). Les autres sont des langues *activables* par un compte : elles
 * s'affichent à partir des surcharges saisies dans l'écran « Langues &
 * vocabulaire », et retombent clé par clé sur le français pour tout ce qui
 * n'a pas encore été traduit. Cf. `COMPILED_LOCALES` dans `lib/i18n`.
 */
export type Locale = 'fr' | 'en' | 'es' | 'de' | 'it'

/** Toutes les langues connues, dans l'ordre d'affichage des sélecteurs. */
export const ALL_LOCALES: readonly Locale[] = ['fr', 'en', 'es', 'de', 'it'] as const

/**
 * Étiquette BCP 47 par langue — pilote `Intl.*`, la césure et le correcteur.
 * `en-GB` et non `en` : orthographe et format de date britanniques.
 */
export const BCP47: Record<Locale, string> = {
  fr: 'fr-FR',
  en: 'en-GB',
  es: 'es-ES',
  de: 'de-DE',
  it: 'it-IT',
}

/** Nom NATIF de la langue (endonyme) — ne se traduit jamais, cf. LocaleSwitcher. */
export const LOCALE_ENDONYM: Record<Locale, string> = {
  fr: 'Français',
  en: 'English',
  es: 'Español',
  de: 'Deutsch',
  it: 'Italiano',
}

const STORAGE_KEY = 'localePref'

/**
 * ⚠️ Ce store ne connaît QUE la langue courante — il n'importe aucun catalogue.
 * C'est `lib/i18n` qui lit le store (et pas l'inverse), ce qui évite le cycle
 * store ↔ catalogue relevé par `npm run cycles`.
 */
function isLocale(v: unknown): v is Locale {
  return typeof v === 'string' && (ALL_LOCALES as readonly string[]).includes(v)
}

/** Langue initiale : préférence stockée, sinon langue du navigateur, sinon FR. */
function initialLocale(): Locale {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (isLocale(stored)) return stored
  } catch { /* localStorage indisponible (Safari privé) : on retombe sur le navigateur */ }
  // `navigator.language` vaut « en-GB », « es-419 »… : on ne garde que le préfixe.
  const nav = navigator.language?.toLowerCase().split('-')[0]
  return isLocale(nav) ? nav : 'fr'
}

interface LocaleState {
  locale: Locale
  setLocale: (locale: Locale) => void
}

const initial = initialLocale()

function applyToDom(locale: Locale) {
  document.documentElement.lang = BCP47[locale]
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

/** Exposé pour l'E2E `i18n-live-rerender.spec.ts` — cf. `i18nOverrides.store`. */
;(window as unknown as { __localeStore?: typeof useLocaleStore }).__localeStore = useLocaleStore
