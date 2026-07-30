import { useLocaleStore, BCP47, type Locale } from '@/stores/locale.store'
import { useI18nOverridesStore } from '@/stores/i18nOverrides.store'
import { fr, type TranslationKey } from './fr'
import { en } from './en'

export type { TranslationKey } from './fr'
export type { Locale } from '@/stores/locale.store'

/**
 * Langues à CATALOGUE COMPILÉ — les seules dont la couverture est garantie par
 * `tsc -b` (`en` est typé `Record<TranslationKey, string>`) et par le test de
 * parité de `i18n.test.ts`.
 *
 * ⚠️ Les autres langues de `Locale` (es, de, it) sont *activables* par un compte
 * mais n'ont pas de catalogue : elles s'affichent depuis les surcharges du
 * compte et retombent clé par clé sur le FRANÇAIS. C'est volontaire — mieux
 * vaut un écran partiellement français qu'un écran vide. Le garde-fou de
 * complétude ne vaut donc QUE pour fr/en, et c'est le test qui le tient.
 */
export const COMPILED_LOCALES: readonly Locale[] = ['fr', 'en'] as const

const CATALOGS: Partial<Record<Locale, Record<TranslationKey, string>>> = { fr, en }

/** Nombre de libellés du catalogue — dénominateur de l'avancement d'une langue. */
export const CATALOG_SIZE = Object.keys(fr).length

/** Valeurs interpolables dans une traduction : `{count}`, `{name}`… */
export type TransParams = Record<string, string | number>

function interpolate(template: string, params?: TransParams): string {
  if (!params) return template
  return template.replace(/\{(\w+)\}/g, (match, key: string) =>
    key in params ? String(params[key]) : match,
  )
}

/**
 * Texte affiché pour une clé, surcharges du compte comprises.
 *
 * Ordre de résolution — le premier qui répond gagne :
 *   1. surcharge de compte pour cette langue (vocabulaire métier du client)
 *   2. catalogue compilé de la langue
 *   3. français (repli universel)
 */
function resolve(locale: Locale, key: TranslationKey): string {
  const override = useI18nOverridesStore.getState().overrides[locale]?.[key]
  if (override !== undefined) return override
  return CATALOGS[locale]?.[key] ?? fr[key]
}

/**
 * Texte d'ORIGINE d'une clé, surcharges ignorées.
 *
 * Sert à montrer « avant → après » dans l'écran de vocabulaire : sans ce
 * court-circuit, `translate` rendrait la surcharge des deux côtés et la colonne
 * de gauche n'apprendrait rien.
 */
export function catalogText(locale: Locale, key: TranslationKey): string {
  return CATALOGS[locale]?.[key] ?? fr[key]
}

/** Traduit une clé dans une langue donnée, surcharges de compte appliquées. */
export function translate(locale: Locale, key: TranslationKey, params?: TransParams): string {
  return interpolate(resolve(locale, key), params)
}

/**
 * Traduction HORS composant React (services, stores, helpers).
 *
 * ⚠️ Rend le texte de la langue COURANTE au moment de l'appel : la chaîne
 * produite ne se retraduit pas si l'utilisateur change de langue ensuite.
 * Réservé aux messages transitoires (résultat d'un test, toast). Pour tout ce
 * qui reste affiché, mémoriser la CLÉ et traduire au rendu — cf. LoginPage.
 *
 * ⚠️ Même réserve pour les SURCHARGES de compte, en pire : elles arrivent de
 * Firestore *après* le premier rendu. Un `t()` figé dans une constante de
 * module aura donc été évalué avant leur hydratation et n'en tiendra jamais
 * compte. Tout ce qui doit refléter le vocabulaire du compte passe par
 * `useTranslation`.
 */
export function t(key: TranslationKey, params?: TransParams): string {
  return translate(useLocaleStore.getState().locale, key, params)
}

/**
 * Traduction DANS un composant React : re-rend au changement de langue.
 *
 * ⚠️ `t` est recréé à chaque changement de langue — ne pas l'omettre des
 * dépendances d'un `useMemo`/`useCallback` qui produit du texte affiché.
 *
 * L'abonnement à `version` (et pas seulement à `locale`) est ce qui fait
 * apparaître les surcharges du compte : sans lui, elles arriveraient après le
 * premier rendu sans jamais le déclencher à nouveau.
 */
export function useTranslation() {
  const locale = useLocaleStore((s) => s.locale)
  const version = useI18nOverridesStore((s) => s.version)
  void version
  const translateFn = (key: TranslationKey, params?: TransParams) => translate(locale, key, params)
  return { t: translateFn, locale }
}

/** Étiquette BCP 47 de la langue — pour `Intl.*`. `en` ⇒ `en-GB`. */
export function intlLocale(locale: Locale): string {
  return BCP47[locale]
}

/** Date localisée. En-GB comme en FR : JJ/MM/AAAA (contrairement à en-US). */
export function formatDate(value: Date | number, locale: Locale, options?: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat(intlLocale(locale), options).format(value)
}

/**
 * Guillemets de chaque langue. Ce sont des choix TYPOGRAPHIQUES, pas de la
 * ponctuation neutre : l'allemand ouvre en bas, l'anglais utilise les doubles
 * courbes, le français encadre d'espaces insécables.
 */
/** Espace insécable — le caractère littéral est refusé par `no-irregular-whitespace`. */
const NBSP = '\u00a0'
const QUOTES: Record<Locale, readonly [string, string]> = {
  fr: ['«' + NBSP, NBSP + '»'],
  en: ['“', '”'],
  es: ['«', '»'],
  de: ['„', '“'],
  it: ['«', '»'],
}

/**
 * Encadre un texte des guillemets de la langue COURANTE.
 *
 * ⚠️ Trouvé par la passe visuelle : `« {t('node.x.label')} »` écrit en dur dans
 * le JSX affichait des guillemets FRANÇAIS au milieu d'une phrase anglaise.
 */
export function quote(text: string | number): string {
  const [open, close] = QUOTES[useLocaleStore.getState().locale]
  return `${open}${text}${close}`
}
