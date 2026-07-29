import { useLocaleStore, type Locale } from '@/stores/locale.store'
import { fr, type TranslationKey } from './fr'
import { en } from './en'

export type { TranslationKey } from './fr'
export type { Locale } from '@/stores/locale.store'

const CATALOGS: Record<Locale, Record<TranslationKey, string>> = { fr, en }

/** Valeurs interpolables dans une traduction : `{count}`, `{name}`… */
export type TransParams = Record<string, string | number>

function interpolate(template: string, params?: TransParams): string {
  if (!params) return template
  return template.replace(/\{(\w+)\}/g, (match, key: string) =>
    key in params ? String(params[key]) : match,
  )
}

/**
 * Traduit une clé dans une langue donnée.
 *
 * Repli volontaire sur le FR si la clé manque : mieux vaut afficher le texte
 * source qu'un écran vide. En pratique `tsc -b` interdit déjà ce cas, puisque
 * `en` est typé `Record<TranslationKey, string>`.
 */
export function translate(locale: Locale, key: TranslationKey, params?: TransParams): string {
  const value = CATALOGS[locale]?.[key] ?? fr[key]
  return interpolate(value, params)
}

/**
 * Traduction HORS composant React (services, stores, helpers).
 *
 * ⚠️ Rend le texte de la langue COURANTE au moment de l'appel : la chaîne
 * produite ne se retraduit pas si l'utilisateur change de langue ensuite.
 * Réservé aux messages transitoires (résultat d'un test, toast). Pour tout ce
 * qui reste affiché, mémoriser la CLÉ et traduire au rendu — cf. LoginPage.
 */
export function t(key: TranslationKey, params?: TransParams): string {
  return translate(useLocaleStore.getState().locale, key, params)
}

/**
 * Traduction DANS un composant React : re-rend au changement de langue.
 *
 * ⚠️ `t` est recréé à chaque changement de langue — ne pas l'omettre des
 * dépendances d'un `useMemo`/`useCallback` qui produit du texte affiché.
 */
export function useTranslation() {
  const locale = useLocaleStore((s) => s.locale)
  const translateFn = (key: TranslationKey, params?: TransParams) => translate(locale, key, params)
  return { t: translateFn, locale }
}

/** Étiquette BCP 47 de la langue — pour `Intl.*`. `en` ⇒ `en-GB`. */
export function intlLocale(locale: Locale): string {
  return locale === 'en' ? 'en-GB' : 'fr-FR'
}

/** Date localisée. En-GB comme en FR : JJ/MM/AAAA (contrairement à en-US). */
export function formatDate(value: Date | number, locale: Locale, options?: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat(intlLocale(locale), options).format(value)
}
