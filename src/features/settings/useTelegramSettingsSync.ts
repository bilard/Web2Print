// src/features/settings/useTelegramSettingsSync.ts
// Synchronise la config Telegram globale (bot token + chat id) avec Firestore
// users/{uid}.telegram : hydrate au login, pousse les changements (debounce).
// Calqué sur useAiSettingsSync. Le bot token est un secret : il vit dans le document
// privé de l'utilisateur (règle users/{uid} = owner-only).
import { useEffect, useRef } from 'react'
import { doc, getDoc, setDoc } from 'firebase/firestore'
import { db } from '@/lib/firebase/config'
import { useAuthStore } from '@/stores/auth.store'
import { useTelegramStore } from '@/stores/telegram.store'

const DEBOUNCE_MS = 500

interface TelegramRemote {
  botToken?: string
  chatId?: string
}

export function useTelegramSettingsSync() {
  const user = useAuthStore((s) => s.user)
  const hydratedRef = useRef(false)
  const timerRef = useRef<number | null>(null)
  const prevUidRef = useRef<string | null | undefined>(undefined)

  // Hydrate depuis Firestore au login.
  useEffect(() => {
    hydratedRef.current = false
    // ⚠️ NE PAS écrire prevUidRef ici. L'auth Firebase passe transitoirement à `null`
    // (refresh de token, double-fire de onAuthStateChanged). Si on remettait prevUidRef
    // à null, le retour `null → uid` (MÊME compte) serait vu comme un changement de
    // compte → reset du store → push `{}` vide → EFFACEMENT de la config en Firestore.
    // En gardant le dernier uid connu, `uid → null → uid` ne déclenche aucun reset.
    if (!user) return

    const accountChanged = prevUidRef.current !== undefined && prevUidRef.current !== user.uid
    prevUidRef.current = user.uid

    let cancelled = false
    const ref = doc(db, 'users', user.uid)
    getDoc(ref)
      .then((snap) => {
        if (cancelled) return
        const tg = snap.data()?.telegram as TelegramRemote | undefined
        if (tg && (tg.botToken || tg.chatId)) {
          // Firestore = source de vérité → toujours restaurer (jamais d'effacement ici).
          useTelegramStore.setState({ botToken: tg.botToken ?? '', chatId: tg.chatId ?? '' })
        } else if (accountChanged) {
          // VRAI changement de compte ET Firestore vide → vider le store (isolation).
          useTelegramStore.setState({ botToken: '', chatId: '' })
        } else {
          // Même compte, Firestore vide : config présente seulement en localStorage
          // (jamais synchronisée) → on la SAUVEGARDE au lieu de la perdre.
          const cur = useTelegramStore.getState()
          if (cur.botToken || cur.chatId) {
            setDoc(ref, { telegram: { botToken: cur.botToken, chatId: cur.chatId } }, { merge: true })
              .catch((e) => console.warn('[useTelegramSettingsSync] backfill failed:', e))
          }
        }
      })
      .catch((e) => console.warn('[useTelegramSettingsSync] hydrate failed:', e))
      .finally(() => {
        if (!cancelled) hydratedRef.current = true
      })

    return () => {
      cancelled = true
    }
  }, [user])

  // Pousse vers Firestore sur changement (debounce).
  useEffect(() => {
    if (!user) return

    const unsubscribe = useTelegramStore.subscribe((state, prev) => {
      if (!hydratedRef.current) return
      if (state.botToken === prev.botToken && state.chatId === prev.chatId) return
      // Filet de sécurité : ne JAMAIS effacer une config distante via un push vide
      // automatique. Un vidage volontaire passe par un autre chemin (non implémenté).
      if (!state.botToken && !state.chatId) return

      if (timerRef.current !== null) window.clearTimeout(timerRef.current)
      timerRef.current = window.setTimeout(() => {
        setDoc(
          doc(db, 'users', user.uid),
          { telegram: { botToken: state.botToken, chatId: state.chatId } },
          { merge: true },
        ).catch((e) => console.warn('[useTelegramSettingsSync] sync failed:', e))
      }, DEBOUNCE_MS)
    })

    return () => {
      unsubscribe()
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current)
        timerRef.current = null
      }
    }
  }, [user])
}
