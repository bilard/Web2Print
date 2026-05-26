// src/features/telegram/inboxDelete.ts
// Logique PURE de décision pour la suppression cross-Telegram (aucune dépendance Firebase, donc
// testable isolément). L'orchestration effective (appels Telegram + Firestore) est dans useTelegramInbox.
import type { InboxMessage } from './useTelegramInbox'

// Telegram refuse deleteMessage au-delà de 48 h après envoi.
export const TELEGRAM_DELETE_WINDOW_MS = 48 * 60 * 60 * 1000

export type DeleteOutcome =
  | 'telegram+local' // supprimé des deux côtés
  | 'local-only-old' // > 48 h : Telegram refuse, on supprime quand même localement
  | 'local-only-no-id' // pas de message_id (ancien doc / pas de token) : Telegram impossible
  | 'local-only-error' // appel Telegram échoué : on supprime quand même localement

/** True si le message est encore dans la fenêtre de 48 h où Telegram autorise la suppression. */
export function withinDeleteWindow(
  message: Pick<InboxMessage, 'receivedAt'>,
  now: number = Date.now(),
): boolean {
  const ms = message.receivedAt?.toMillis?.()
  return ms == null || now - ms <= TELEGRAM_DELETE_WINDOW_MS
}

/**
 * Décide, AVANT tout appel réseau, si une suppression côté Telegram est tentable et sinon pourquoi.
 * 'telegram' = on peut tenter ; les autres valeurs sont des `DeleteOutcome` terminaux (local seul).
 */
export function classifyDeletable(
  message: Pick<InboxMessage, 'messageId' | 'receivedAt'>,
  botToken: string,
  now: number = Date.now(),
): 'telegram' | 'local-only-no-id' | 'local-only-old' {
  if (message.messageId == null || !botToken) return 'local-only-no-id'
  if (!withinDeleteWindow(message, now)) return 'local-only-old'
  return 'telegram'
}
