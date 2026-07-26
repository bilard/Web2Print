// Forme des messages de la boîte de réception Telegram, partagée par le hook
// temps réel, le worker de traitement, la suppression et les vues.
//
// Module de types pur : sans lui, `inboxDelete` et `inboxWorker` doivent
// importer le hook (donc Firestore et React) pour un simple type.

export type InboxStatus = 'pending' | 'processing' | 'done' | 'error'

type InboxDirection = 'in' | 'out'

export interface InboxLogEntry {
  ts: number
  level: 'info' | 'warn' | 'error'
  msg: string
}

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
  /** Logs de traitement, accumulés par le worker pendant le run. */
  logs?: InboxLogEntry[]
}
