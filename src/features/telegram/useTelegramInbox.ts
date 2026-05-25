// src/features/telegram/useTelegramInbox.ts
// Lecture temps réel de la boîte de réception Telegram (collection telegramInbox).
// Lecture seule : le traitement est fait par useTelegramInboxWorker.
import { useEffect, useState } from 'react'
import {
  collection,
  query,
  orderBy,
  onSnapshot,
  doc,
  deleteDoc,
  updateDoc,
  setDoc,
  serverTimestamp,
  writeBatch,
} from 'firebase/firestore'
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
  generatedWorkflowId?: string
  generatedWorkflowName?: string
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

/** Supprime un message de la boîte de réception. */
export function deleteInboxMessage(updateId: number): Promise<void> {
  return deleteDoc(doc(db, 'telegramInbox', String(updateId)))
}

/** Modifie le texte d'un message existant. */
export function updateInboxText(updateId: number, text: string): Promise<void> {
  return updateDoc(doc(db, 'telegramInbox', String(updateId)), { text })
}

/**
 * Ajoute un message manuellement (test / note). id = timestamp pour éviter toute
 * collision avec les update_id réels de Telegram. status 'done' : pas de retraitement.
 */
export function addInboxMessage(chatId: number, text: string): Promise<void> {
  const id = Date.now()
  return setDoc(doc(db, 'telegramInbox', String(id)), {
    updateId: id,
    chatId,
    fromUsername: null,
    text,
    status: 'done',
    receivedAt: serverTimestamp(),
  })
}

/** Supprime tous les messages fournis (par lots de 450 — limite Firestore 500/batch). */
export async function deleteAllInboxMessages(updateIds: number[]): Promise<void> {
  for (let i = 0; i < updateIds.length; i += 450) {
    const batch = writeBatch(db)
    for (const id of updateIds.slice(i, i + 450)) {
      batch.delete(doc(db, 'telegramInbox', String(id)))
    }
    await batch.commit()
  }
}

/** Métadonnées d'affichage d'un statut (label + classes Tailwind du badge). */
export function statusMeta(status: InboxStatus): { label: string; cls: string } {
  switch (status) {
    case 'done':
      return { label: 'traité', cls: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30' }
    case 'processing':
      return { label: 'en cours', cls: 'bg-cyan-500/15 text-cyan-300 border-cyan-500/30' }
    case 'error':
      return { label: 'erreur', cls: 'bg-red-500/15 text-red-300 border-red-500/30' }
    case 'pending':
    default:
      return { label: 'en attente', cls: 'bg-amber-500/15 text-amber-300 border-amber-500/30' }
  }
}
