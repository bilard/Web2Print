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
  // Clic sur un bouton inline (node workflow « Approbation Telegram »).
  callback_query?: {
    id?: string
    data?: string
    from?: { username?: string }
    message?: { chat?: { id?: number } }
  }
}

// Préfixe des callback_data émis par le node « Approbation Telegram » côté app.
export const APPROVAL_CALLBACK_PREFIX = 'wfappr:'

export interface ApprovalDecision {
  approvalId: string
  decision: 'approve' | 'reject'
  chatId: number
  fromUsername: string | null
  callbackQueryId: string
}

interface InboxRecord {
  updateId: number
  chatId: number
  fromUsername: string | null
  text: string
  // message_id Telegram : requis pour supprimer le message côté Telegram (deleteMessage).
  messageId: number | null
}

export type EvaluateResult =
  | { action: 'enqueue'; record: InboxRecord }
  | { action: 'approval'; decision: ApprovalDecision }
  | { action: 'ignore'; reason: 'no-text' | 'no-chat-id' | 'not-allowed' | 'bad-callback' }

/**
 * Décide le sort d'un callback_query : seul le format `wfappr:<id>:<approve|reject>`
 * émis par le node « Approbation Telegram » est accepté, et uniquement depuis un chat
 * de l'allowlist (même garde que les messages entrants).
 */
function evaluateCallbackQuery(
  cq: NonNullable<TelegramUpdate['callback_query']>,
  allowedChatIds: number[],
): EvaluateResult {
  const chatId = cq.message?.chat?.id
  if (typeof chatId !== 'number') return { action: 'ignore', reason: 'no-chat-id' }
  if (!allowedChatIds.includes(chatId)) return { action: 'ignore', reason: 'not-allowed' }
  const data = cq.data ?? ''
  if (!data.startsWith(APPROVAL_CALLBACK_PREFIX) || typeof cq.id !== 'string') {
    return { action: 'ignore', reason: 'bad-callback' }
  }
  const parts = data.slice(APPROVAL_CALLBACK_PREFIX.length).split(':')
  const [approvalId, verdict] = parts
  if (parts.length !== 2 || !approvalId || (verdict !== 'approve' && verdict !== 'reject')) {
    return { action: 'ignore', reason: 'bad-callback' }
  }
  return {
    action: 'approval',
    decision: {
      approvalId,
      decision: verdict,
      chatId,
      fromUsername: cq.from?.username ?? null,
      callbackQueryId: cq.id,
    },
  }
}

export function evaluateUpdate(
  update: TelegramUpdate,
  allowedChatIds: number[],
): EvaluateResult {
  if (update.callback_query) {
    return evaluateCallbackQuery(update.callback_query, allowedChatIds)
  }
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
