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

  // Hydrate depuis Firestore au login.
  useEffect(() => {
    hydratedRef.current = false
    if (!user) return

    let cancelled = false
    getDoc(doc(db, 'users', user.uid))
      .then((snap) => {
        if (cancelled) return
        const tg = snap.data()?.telegram as TelegramRemote | undefined
        if (tg) {
          const cur = useTelegramStore.getState()
          useTelegramStore.setState({
            botToken: tg.botToken ?? cur.botToken,
            chatId: tg.chatId ?? cur.chatId,
          })
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
