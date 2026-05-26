// functions/src/telegram/evaluateUpdate.ts
// Logique pure : décide si un Update Telegram doit être empilé. Aucune dépendance Firebase.

export interface TelegramUpdate {
  update_id: number
  message?: {
    message_id?: number
    text?: string
    chat?: { id?: number }
    from?: { username?: string }
  }
}

export interface InboxRecord {
  updateId: number
  chatId: number
  fromUsername: string | null
  text: string
  // message_id Telegram : requis pour supprimer le message côté Telegram (deleteMessage).
  messageId: number | null
}

export type EvaluateResult =
  | { action: 'enqueue'; record: InboxRecord }
  | { action: 'ignore'; reason: 'no-text' | 'no-chat-id' | 'not-allowed' }

export function evaluateUpdate(
  update: TelegramUpdate,
  allowedChatIds: number[],
): EvaluateResult {
  const msg = update.message
  const text = msg?.text
  if (typeof text !== 'string' || text.length === 0) {
    return { action: 'ignore', reason: 'no-text' }
  }
  // NB : /start n'est PAS filtré ici — on l'empile (avec son message_id) pour que le worker
  // puisse le supprimer côté Telegram (sinon il resterait visible sur le téléphone de l'user).
  const chatId = msg?.chat?.id
  if (typeof chatId !== 'number') {
    return { action: 'ignore', reason: 'no-chat-id' }
  }
  if (!allowedChatIds.includes(chatId)) {
    return { action: 'ignore', reason: 'not-allowed' }
  }
  return {
    action: 'enqueue',
    record: {
      updateId: update.update_id,
      chatId,
      fromUsername: msg?.from?.username ?? null,
      text,
      messageId: typeof msg?.message_id === 'number' ? msg.message_id : null,
    },
  }
}
