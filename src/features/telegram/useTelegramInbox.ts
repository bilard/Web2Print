// src/features/telegram/useTelegramInbox.ts
// Lecture temps réel de la boîte de réception Telegram (collection telegramInbox).
// Lecture seule : le traitement est fait par useTelegramInboxWorker.
import { useEffect, useState } from 'react'
import { collection, query, orderBy, onSnapshot } from 'firebase/firestore'
import { db } from '@/lib/firebase/config'
import { useAuthStore } from '@/stores/auth.store'

export type InboxStatus = 'pending' | 'processing' | 'done' | 'error'

export interface InboxMessage {
  updateId: number
  chatId: number
  fromUsername: string | null
  text: string
  status: InboxStatus
  errorMessage?: string
  receivedAt?: { toMillis: () => number } | null
}

export function useTelegramInbox(): { messages: InboxMessage[]; loading: boolean } {
  const user = useAuthStore((s) => s.user)
  const [messages, setMessages] = useState<InboxMessage[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!user?.uid) {
      setMessages([])
      setLoading(false)
      return
    }
    setLoading(true)
    const q = query(collection(db, 'telegramInbox'), orderBy('receivedAt', 'desc'))
    const unsub = onSnapshot(
      q,
      (snap) => {
        setMessages(snap.docs.map((d) => d.data() as InboxMessage))
        setLoading(false)
      },
      (err) => {
        console.warn('telegramInbox read error:', err.message)
        setLoading(false)
      },
    )
    return unsub
  }, [user?.uid])

  return { messages, loading }
}
