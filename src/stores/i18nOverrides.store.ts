import { create } from 'zustand'
import type { Locale } from '@/stores/locale.store'

/**
 * Surcharges de VOCABULAIRE propres à un compte.
 *
 * Un distributeur GSA parle de « volume » là où un GSB parle de « contenance » :
 * plutôt que de figer un mot dans le catalogue, chaque compte réécrit les
 * libellés d'interface qui ne collent pas à son métier. La surcharge se pose
 * PAR-DESSUS le catalogue compilé, elle ne le remplace pas.
 *
 * Portée : uniquement les éléments d'INTERFACE, c'est-à-dire ce qui possède une
 * `TranslationKey`. Une donnée importée, scrapée ou générée par IA n'a pas de
 * clé — elle n'est donc pas surchargeable, par construction.
 *
 * ⚠️ Ce store n'importe aucun catalogue (même règle que `locale.store`) : c'est
 * `lib/i18n` qui le lit. Les clés sont typées `string` ici et re-typées
 * `TranslationKey` à la lecture, pour garder ce module en feuille du graphe.
 */

/** Surcharges d'une langue : `TranslationKey` → texte réécrit par le compte. */
export type LocaleOverrides = Record<string, string>

/** Langues actives par défaut : les deux seules à disposer d'un catalogue compilé. */
export const DEFAULT_ACTIVE_LOCALES: readonly Locale[] = ['fr', 'en'] as const

interface I18nOverridesState {
  /** Compte porteur des surcharges (`accounts/{accountId}`). `null` avant hydratation. */
  accountId: string | null
  /** Langues proposées par ce compte dans les sélecteurs de langue. */
  activeLocales: Locale[]
  /**
   * Métier du compte en clair (« GSB bricolage », « distributeur agroalimentaire »).
   * Passé au modèle de traduction : c'est ce qui lui fait rendre le terme du
   * métier plutôt que le synonyme de dictionnaire.
   */
  businessContext: string
  overrides: Partial<Record<Locale, LocaleOverrides>>
  /**
   * Compteur incrémenté à CHAQUE mutation.
   *
   * ⚠️ C'est la clé de voûte du rendu : `useTranslation` s'y abonne, ce qui
   * re-rend l'arbre quand les surcharges arrivent de Firestore ou changent
   * pendant l'édition live. Sans lui, une surcharge hydratée après le premier
   * rendu ne s'afficherait jamais.
   */
  version: number
  /** Mode « édition des libellés » : arme le Alt+clic dans toute l'application. */
  editing: boolean

  setAccount: (accountId: string | null) => void
  setActiveLocales: (locales: Locale[]) => void
  setBusinessContext: (context: string) => void
  /** Remplace EN BLOC les surcharges d'une langue (instantané venu de Firestore). */
  applyRemote: (locale: Locale, entries: LocaleOverrides) => void
  /** Pose ou retire une surcharge. `null` ⇒ retour au texte du catalogue. */
  setOverride: (locale: Locale, key: string, value: string | null) => void
  setEditing: (editing: boolean) => void
  reset: () => void
}

const EMPTY = {
  accountId: null,
  activeLocales: [...DEFAULT_ACTIVE_LOCALES],
  businessContext: '',
  overrides: {},
  editing: false,
}

export const useI18nOverridesStore = create<I18nOverridesState>((set) => ({
  ...EMPTY,
  version: 0,

  setAccount: (accountId) => set((s) => ({ accountId, version: s.version + 1 })),

  setActiveLocales: (locales) =>
    // Le français reste toujours actif : c'est la langue de repli de la
    // résolution, un compte qui la désactiverait n'aurait plus de filet.
    set((s) => ({
      activeLocales: locales.includes('fr') ? locales : ['fr', ...locales],
      version: s.version + 1,
    })),

  setBusinessContext: (businessContext) => set({ businessContext }),

  applyRemote: (locale, entries) =>
    set((s) => ({
      overrides: { ...s.overrides, [locale]: entries },
      version: s.version + 1,
    })),

  setOverride: (locale, key, value) =>
    set((s) => {
      const next = { ...(s.overrides[locale] ?? {}) }
      if (value === null || value === '') delete next[key]
      else next[key] = value
      return { overrides: { ...s.overrides, [locale]: next }, version: s.version + 1 }
    }),

  setEditing: (editing) => set({ editing }),

  reset: () => set((s) => ({ ...EMPTY, version: s.version + 1 })),
}))

/**
 * Exposé pour le test E2E `i18n-live-rerender.spec.ts`, qui vérifie qu'un mot
 * réécrit apparaît SANS rechargement jusque dans les écrans dont la page racine
 * ne s'abonne pas à la traduction. Ce test doit poser une surcharge dans l'état
 * exact où l'écouteur temps réel place l'application — le faire par l'interface
 * passerait par Firestore et mesurerait la persistance, pas le rendu.
 */
;(window as unknown as { __i18nOverridesStore?: typeof useI18nOverridesStore })
  .__i18nOverridesStore = useI18nOverridesStore
