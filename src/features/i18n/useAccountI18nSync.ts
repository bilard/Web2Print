import { useEffect } from 'react'
import { doc, collection, onSnapshot } from 'firebase/firestore'
import { db } from '@/lib/firebase/config'
import { useAuthStore } from '@/stores/auth.store'
import { useLocaleStore, type Locale } from '@/stores/locale.store'
import { useI18nOverridesStore, DEFAULT_ACTIVE_LOCALES } from '@/stores/i18nOverrides.store'
import { fetchAccountId, DEFAULT_ACCOUNT_ID } from './accountI18nApi'
import type { LocaleOverrides } from '@/stores/i18nOverrides.store'

/**
 * Branche le vocabulaire du COMPTE sur l'interface.
 *
 * Deux écoutes temps réel plutôt qu'une lecture unique : quand un administrateur
 * renomme « Volume » en « Contenance » depuis l'édition live, le changement doit
 * atteindre les écrans de ses collègues sans qu'ils rechargent la page — c'est
 * tout l'intérêt d'un vocabulaire d'ENTREPRISE plutôt que de préférence perso.
 *
 * ⚠️ À monter UNE FOIS, au-dessus de l'application (cf. `useLocaleSync`).
 */
export function useAccountI18nSync() {
  // [uid] et non [user] : évite le re-run à chaque refresh de token.
  const uid = useAuthStore((s) => s.user?.uid)

  useEffect(() => {
    const store = useI18nOverridesStore.getState()
    if (!uid) {
      store.reset()
      return
    }

    let cancelled = false
    let unsubSettings: (() => void) | null = null
    let unsubOverrides: (() => void) | null = null

    void fetchAccountId(uid)
      .catch((e) => {
        // Profil illisible (règles, réseau) : on retombe sur le compte par
        // défaut plutôt que de priver l'utilisateur de son vocabulaire.
        console.warn('[useAccountI18nSync] accountId illisible, repli sur le compte par défaut:', e)
        return DEFAULT_ACCOUNT_ID
      })
      .then((accountId) => {
        if (cancelled) return
        store.setAccount(accountId)

        unsubSettings = onSnapshot(
          doc(db, 'accounts', accountId),
          (snap) => {
            const context = snap.data()?.businessContext
            useI18nOverridesStore
              .getState()
              .setBusinessContext(typeof context === 'string' ? context : '')
            const active = snap.data()?.activeLocales
            const locales: Locale[] =
              Array.isArray(active) && active.length > 0
                ? (active as Locale[])
                : [...DEFAULT_ACTIVE_LOCALES]
            useI18nOverridesStore.getState().setActiveLocales(locales)
            // Langue courante retirée des langues actives : on la ramène au
            // français, sinon l'utilisateur reste bloqué sur une langue que le
            // compte ne sert plus (et que le sélecteur n'affiche même plus).
            const current = useLocaleStore.getState().locale
            if (!locales.includes(current)) useLocaleStore.getState().setLocale('fr')
          },
          (e) => console.warn('[useAccountI18nSync] réglages du compte:', e),
        )

        unsubOverrides = onSnapshot(
          collection(db, 'accounts', accountId, 'i18nOverrides'),
          (snap) => {
            const overrides = useI18nOverridesStore.getState()
            for (const change of snap.docChanges()) {
              const locale = change.doc.id as Locale
              if (change.type === 'removed') {
                overrides.applyRemote(locale, {})
                continue
              }
              const entries = change.doc.data().entries
              overrides.applyRemote(
                locale,
                entries && typeof entries === 'object' ? (entries as LocaleOverrides) : {},
              )
            }
          },
          (e) => console.warn('[useAccountI18nSync] surcharges:', e),
        )
      })

    return () => {
      cancelled = true
      unsubSettings?.()
      unsubOverrides?.()
    }
  }, [uid])
}
