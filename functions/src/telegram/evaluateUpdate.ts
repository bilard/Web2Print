// functions/src/telegram/evaluateUpdate.ts
// Logique pure : décide si un Update Telegram doit être empilé. Aucune dépendance Firebase.

export interface TelegramUpdate {
  update_id: number
  message?: {
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
    },
  }
}
