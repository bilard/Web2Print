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
  where,
  getDocs,
  Timestamp,
} from 'firebase/firestore'
import { db } from '@/lib/firebase/config'
import { useAuthStore } from '@/stores/auth.store'
import { deleteTelegramMessage, deleteTelegramMessages } from '@/lib/telegramApi'
import { classifyDeletable, withinDeleteWindow, type DeleteOutcome } from './inboxDelete'

export type { DeleteOutcome } from './inboxDelete'

export type InboxStatus = 'pending' | 'processing' | 'done' | 'error'

/** 'in' = reçu depuis Telegram (worker). 'out' = poussé par l'app (composer / réponse worker). */
export type InboxDirection = 'in' | 'out'

export interface InboxMessage {
  // string pour les messages sortants (id synthétique `out-…`), number pour les update_id Telegram.
  updateId: number | string
  // number pour les chats Telegram réels ; string possible pour un @canal (envoi depuis un node).
  chatId: number | string
  fromUsername: string | null
  text: string
  status: InboxStatus
  /** Absent sur les anciens docs → traité comme 'in'. */
  direction?: InboxDirection
  /** message_id Telegram — requis pour supprimer le message côté Telegram. Absent sur les docs antérieurs. */
  messageId?: number
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
export function deleteInboxMessage(updateId: number | string): Promise<void> {
  return deleteDoc(doc(db, 'telegramInbox', String(updateId)))
}

/** Modifie le texte d'un message existant. */
export function updateInboxText(updateId: number | string, text: string): Promise<void> {
  return updateDoc(doc(db, 'telegramInbox', String(updateId)), { text })
}

/**
 * Journalise un message SORTANT (App → Telegram) dans la même collection pour qu'il apparaisse
 * dans la boîte. id synthétique `out-<ts>-<rand>` : non-collisionnel avec les update_id Telegram
 * (entiers). status 'done' + direction 'out' → ignoré par le worker (qui ne traite que 'pending').
 */
export function addOutboxMessage(
  chatId: number | string,
  text: string,
  messageId?: number,
): Promise<void> {
  const id = `out-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  // Normalise un chat_id numérique en number (cohérence avec les docs entrants) ; garde @canal en string.
  const normChat =
    typeof chatId === 'string' && /^-?\d+$/.test(chatId.trim()) ? Number(chatId.trim()) : chatId
  return setDoc(doc(db, 'telegramInbox', id), {
    updateId: id,
    chatId: normChat,
    fromUsername: null,
    text,
    status: 'done',
    direction: 'out',
    receivedAt: serverTimestamp(),
    // message_id du message envoyé → permet de le supprimer côté Telegram ensuite.
    ...(messageId != null ? { messageId } : {}),
  })
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
export async function deleteAllInboxMessages(updateIds: (number | string)[]): Promise<void> {
  for (let i = 0; i < updateIds.length; i += 450) {
    const batch = writeBatch(db)
    for (const id of updateIds.slice(i, i + 450)) {
      batch.delete(doc(db, 'telegramInbox', String(id)))
    }
    await batch.commit()
  }
}

/**
 * Supprime un message dans la boîte ET côté Telegram (best-effort). La suppression Firestore est
 * TOUJOURS effectuée ; l'échec ou l'impossibilité côté Telegram ne bloque pas. Le résultat indique
 * ce qui a réellement eu lieu, pour un feedback utilisateur clair.
 */
export async function deleteInboxMessageEverywhere(
  message: InboxMessage,
  botToken: string,
): Promise<DeleteOutcome> {
  const decision = classifyDeletable(message, botToken)
  let outcome: DeleteOutcome = decision === 'telegram' ? 'telegram+local' : decision
  if (decision === 'telegram') {
    try {
      await deleteTelegramMessage(botToken, { chatId: message.chatId, messageId: message.messageId! })
    } catch {
      outcome = 'local-only-error'
    }
  }
  await deleteInboxMessage(message.updateId)
  return outcome
}

/**
 * Supprime tous les messages fournis dans la boîte ET côté Telegram (best-effort). Regroupe par
 * chat et utilise deleteMessages (lots de 100). Les messages sans message_id ou hors fenêtre 48 h
 * ne sont supprimés que localement.
 */
export async function deleteAllInboxEverywhere(
  messages: InboxMessage[],
  botToken: string,
): Promise<void> {
  if (botToken) {
    const byChat = new globalThis.Map<number | string, number[]>()
    for (const m of messages) {
      if (m.messageId == null || !withinDeleteWindow(m)) continue
      const ids = byChat.get(m.chatId) ?? []
      ids.push(m.messageId)
      byChat.set(m.chatId, ids)
    }
    for (const [chatId, ids] of byChat) {
      for (let i = 0; i < ids.length; i += 100) {
        await deleteTelegramMessages(botToken, { chatId, messageIds: ids.slice(i, i + 100) }).catch(() => {})
      }
    }
  }
  await deleteAllInboxMessages(messages.map((m) => m.updateId))
}

/**
 * Vide TOUTE la boîte : supprime côté Telegram (best-effort, < 48 h) puis côté Firestore.
 * `exceptUpdateId` permet d'épargner un message (ex : la commande /clear en cours de traitement,
 * pour ne pas casser son markDone). Retourne le nombre de docs supprimés en Firestore.
 */
export async function clearAllInbox(botToken: string, exceptUpdateId?: number | string): Promise<number> {
  const snap = await getDocs(collection(db, 'telegramInbox'))
  const messages = snap.docs
    .map((d) => d.data() as InboxMessage)
    .filter((m) => String(m.updateId) !== String(exceptUpdateId ?? ''))
  if (messages.length === 0) return 0
  await deleteAllInboxEverywhere(messages, botToken)
  return messages.length
}

// Rétention par défaut : au-delà, les messages sont purgés automatiquement de la boîte.
export const INBOX_RETENTION_DAYS = 7

/**
 * Purge LOCALE (Firestore uniquement) les messages plus vieux que `retentionDays`. Ne touche PAS
 * Telegram : ces messages sont de toute façon hors fenêtre de 48 h, et on ne veut pas effacer
 * silencieusement l'historique Telegram de l'utilisateur. Retourne le nombre de docs supprimés.
 */
export async function purgeOldInboxMessages(retentionDays = INBOX_RETENTION_DAYS): Promise<number> {
  const cutoff = Timestamp.fromMillis(Date.now() - retentionDays * 24 * 60 * 60 * 1000)
  const snap = await getDocs(query(collection(db, 'telegramInbox'), where('receivedAt', '<', cutoff)))
  if (snap.empty) return 0
  // Les ids de docs == String(updateId) → réutilise le batching de deleteAllInboxMessages.
  await deleteAllInboxMessages(snap.docs.map((d) => d.id))
  return snap.size
}

/** Lance une purge des anciens messages au montage (page Telegram). Local only, non bloquant. */
export function useInboxAutoCleanup(retentionDays = INBOX_RETENTION_DAYS): void {
  const user = useAuthStore((s) => s.user)
  useEffect(() => {
    if (!user?.uid) return
    void purgeOldInboxMessages(retentionDays).catch((err) =>
      console.warn('telegramInbox cleanup:', err instanceof Error ? err.message : String(err)),
    )
  }, [user?.uid, retentionDays])
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
