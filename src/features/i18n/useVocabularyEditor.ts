import { useCallback, useState } from 'react'
import { toast } from 'sonner'
import { useAuthStore } from '@/stores/auth.store'
import { useCan } from '@/features/access/useAccess'
import { useI18nOverridesStore } from '@/stores/i18nOverrides.store'
import { useLocaleStore, type Locale } from '@/stores/locale.store'
import { t } from '@/lib/i18n'
import { recordAudit } from '@/lib/auditLog'
import { saveOverrides, saveActiveLocales } from './accountI18nApi'
import { translateLabel } from './translateLabels'

/**
 * Écriture du vocabulaire du compte : pose une surcharge, la traduit, la persiste.
 *
 * L'ordre compte — on écrit d'abord dans le store, puis dans Firestore. Le mot
 * change donc sous les yeux de qui l'édite avant l'aller-retour réseau, et
 * l'écouteur temps réel (`useAccountI18nSync`) confirmera la même valeur. En cas
 * d'échec d'écriture on prévient explicitement : une surcharge qui ne serait
 * appliquée qu'en local donnerait à un administrateur la certitude fausse
 * d'avoir renommé le libellé pour toute son entreprise.
 */
export function useVocabularyEditor() {
  const canEdit = useCan('settings.i18n.edit')
  const uid = useAuthStore((s) => s.user?.uid) ?? ''
  const [translating, setTranslating] = useState(false)

  /** Persiste EN BLOC la langue concernée (l'API n'écrit pas par clé). */
  const persist = useCallback(async (locale: Locale) => {
    const { accountId, overrides } = useI18nOverridesStore.getState()
    if (!accountId) throw new Error('no-account')
    await saveOverrides(accountId, locale, overrides[locale] ?? {}, uid)
  }, [uid])

  /** Réécrit un libellé. `value` vide ⇒ retour au texte d'origine du catalogue. */
  const setLabel = useCallback(
    async (key: string, locale: Locale, value: string | null): Promise<boolean> => {
      if (!canEdit) return false
      const store = useI18nOverridesStore.getState()
      const previous = store.overrides[locale]?.[key] ?? null
      store.setOverride(locale, key, value)
      try {
        await persist(locale)
        void recordAudit({
          action: value === null ? 'i18n.label.reset' : 'i18n.label.edit',
          module: 'settings',
          targetLabel: key,
          meta: { locale, value: value ?? '' },
        })
        return true
      } catch (e) {
        // Retour à l'état d'avant : mieux vaut voir le mot d'origine revenir que
        // croire le renommage partagé alors qu'il n'a jamais quitté l'onglet.
        useI18nOverridesStore.getState().setOverride(locale, key, previous)
        const tooLarge = e instanceof Error && e.message.startsWith('i18n-overrides-too-large')
        toast.error(tooLarge ? t('i18n.edit.tooLarge') : t('i18n.edit.saveFailed'))
        console.warn('[useVocabularyEditor] écriture refusée:', e)
        return false
      }
    },
    [canEdit, persist],
  )

  /**
   * Traduit un libellé vers toutes les autres langues actives et les enregistre.
   *
   * La langue source est celle affichée à l'écran au moment de l'édition : on
   * traduit ce que l'utilisateur vient réellement d'écrire.
   */
  const translateToActiveLocales = useCallback(
    async (key: string, sourceText: string, businessContext?: string): Promise<number> => {
      if (!canEdit) return 0
      const sourceLocale = useLocaleStore.getState().locale
      const { activeLocales } = useI18nOverridesStore.getState()
      const targets = activeLocales.filter((l) => l !== sourceLocale)
      if (targets.length === 0) {
        toast.info(t('i18n.edit.noOtherLocale'))
        return 0
      }

      setTranslating(true)
      try {
        const produced = await translateLabel({
          text: sourceText,
          sourceLocale,
          targets,
          key,
          businessContext,
        })
        const store = useI18nOverridesStore.getState()
        const locales = Object.keys(produced) as Locale[]
        for (const locale of locales) store.setOverride(locale, key, produced[locale] ?? null)
        // Une écriture par langue : chaque langue est un document distinct.
        await Promise.all(locales.map((locale) => persist(locale)))
        void recordAudit({
          action: 'i18n.label.translate',
          module: 'settings',
          targetLabel: key,
          meta: { locales: locales.join(','), count: locales.length },
        })
        return locales.length
      } catch (e) {
        toast.error(t('i18n.edit.translateFailed'))
        console.warn('[useVocabularyEditor] traduction échouée:', e)
        return 0
      } finally {
        setTranslating(false)
      }
    },
    [canEdit, persist],
  )

  /** Active ou désactive une langue pour tout le compte. */
  const setLocaleActive = useCallback(
    async (locale: Locale, active: boolean): Promise<void> => {
      if (!canEdit) return
      const store = useI18nOverridesStore.getState()
      const { accountId, activeLocales } = store
      const next = active
        ? Array.from(new Set([...activeLocales, locale]))
        : activeLocales.filter((l) => l !== locale)
      store.setActiveLocales(next)
      try {
        if (accountId) await saveActiveLocales(accountId, useI18nOverridesStore.getState().activeLocales)
        void recordAudit({
          action: 'i18n.locale.toggle',
          module: 'settings',
          targetLabel: locale,
          meta: { active: String(active) },
        })
      } catch (e) {
        store.setActiveLocales(activeLocales)
        toast.error(t('i18n.edit.saveFailed'))
        console.warn('[useVocabularyEditor] langues actives:', e)
      }
    },
    [canEdit],
  )

  return { canEdit, translating, setLabel, translateToActiveLocales, setLocaleActive }
}
