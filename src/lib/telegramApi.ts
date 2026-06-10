// src/lib/telegramApi.ts
// Couche d'accès à l'API Bot Telegram. Appels fetch directs depuis le navigateur :
// api.telegram.org renvoie Access-Control-Allow-Origin: *, donc pas de proxy.

const API_BASE = 'https://api.telegram.org'

export type TelegramParseMode = 'none' | 'HTML' | 'MarkdownV2'

/** Clavier inline Telegram (boutons sous le message). callback_data ≤ 64 octets. */
export interface TelegramInlineKeyboard {
  inline_keyboard: { text: string; callback_data: string }[][]
}

export interface SendTelegramMessageOptions {
  chatId: string
  text: string
  parseMode?: TelegramParseMode
  replyMarkup?: TelegramInlineKeyboard
}

export interface SendTelegramDocumentOptions {
  chatId: string
  file: File | Blob
  caption?: string
  parseMode?: TelegramParseMode
  replyMarkup?: TelegramInlineKeyboard
}

interface TelegramOk {
  ok: true
  result: { message_id: number }
}
interface TelegramErr {
  ok: false
  error_code: number
  description: string
}

async function parseTelegramResponse(res: Response): Promise<{ messageId: number }> {
  let json: TelegramOk | TelegramErr
  try {
    json = (await res.json()) as TelegramOk | TelegramErr
  } catch {
    throw new Error(`Telegram API HTTP ${res.status} ${res.statusText} : réponse illisible.`)
  }
  if (!json.ok) {
    throw new Error(`Telegram API ${json.error_code} : ${json.description}`)
  }
  return { messageId: json.result.message_id }
}

export async function sendTelegramMessage(
  botToken: string,
  opts: SendTelegramMessageOptions,
): Promise<{ messageId: number }> {
  const body: Record<string, unknown> = { chat_id: opts.chatId, text: opts.text }
  if (opts.parseMode && opts.parseMode !== 'none') body.parse_mode = opts.parseMode
  if (opts.replyMarkup) body.reply_markup = opts.replyMarkup

  const res = await fetch(`${API_BASE}/bot${botToken}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  return parseTelegramResponse(res)
}

export interface TelegramBotInfo {
  username: string
  firstName: string
}

/** Valide un bot token via getMe. Lève une Error lisible si invalide. */
export async function getTelegramBotInfo(botToken: string): Promise<TelegramBotInfo> {
  const res = await fetch(`${API_BASE}/bot${botToken}/getMe`)
  let json: {
    ok: boolean
    result?: { username?: string; first_name?: string }
    error_code?: number
    description?: string
  }
  try {
    json = await res.json()
  } catch {
    throw new Error(`Telegram API HTTP ${res.status} : réponse illisible.`)
  }
  if (!json.ok || !json.result) {
    throw new Error(`Telegram API ${json.error_code ?? res.status} : ${json.description ?? 'token invalide'}`)
  }
  return { username: json.result.username ?? '', firstName: json.result.first_name ?? '' }
}

interface TelegramDeleteResponse {
  ok?: boolean
  error_code?: number
  description?: string
}

/**
 * Supprime un message côté Telegram (deleteMessage). Lève une Error lisible en cas d'échec —
 * notamment au-delà de la fenêtre de 48 h imposée par Telegram, ou si message_id est inconnu.
 */
export async function deleteTelegramMessage(
  botToken: string,
  opts: { chatId: string | number; messageId: number },
): Promise<void> {
  const res = await fetch(`${API_BASE}/bot${botToken}/deleteMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: opts.chatId, message_id: opts.messageId }),
  })
  const json = (await res.json().catch(() => null)) as TelegramDeleteResponse | null
  if (!json?.ok) {
    throw new Error(`Telegram deleteMessage ${json?.error_code ?? res.status} : ${json?.description ?? 'échec'}`)
  }
}

/**
 * Supprime plusieurs messages d'un MÊME chat en un appel (deleteMessages, Bot API 7.0+).
 * Telegram limite à 100 message_ids par appel ; l'appelant doit découper.
 */
export async function deleteTelegramMessages(
  botToken: string,
  opts: { chatId: string | number; messageIds: number[] },
): Promise<void> {
  if (opts.messageIds.length === 0) return
  const res = await fetch(`${API_BASE}/bot${botToken}/deleteMessages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: opts.chatId, message_ids: opts.messageIds }),
  })
  const json = (await res.json().catch(() => null)) as TelegramDeleteResponse | null
  if (!json?.ok) {
    throw new Error(`Telegram deleteMessages ${json?.error_code ?? res.status} : ${json?.description ?? 'échec'}`)
  }
}

/**
 * Répond à un callback_query (clic sur un bouton inline) : ferme le spinner côté client
 * Telegram et affiche un toast optionnel. Best-effort côté appelant : Telegram refuse les
 * callback_query trop anciens (~15 s), ce qui est attendu quand l'app répond en différé.
 */
export async function answerTelegramCallbackQuery(
  botToken: string,
  opts: { callbackQueryId: string; text?: string },
): Promise<void> {
  const body: Record<string, unknown> = { callback_query_id: opts.callbackQueryId }
  if (opts.text) body.text = opts.text
  const res = await fetch(`${API_BASE}/bot${botToken}/answerCallbackQuery`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const json = (await res.json().catch(() => null)) as { ok?: boolean; error_code?: number; description?: string } | null
  if (!json?.ok) {
    throw new Error(`Telegram answerCallbackQuery ${json?.error_code ?? res.status} : ${json?.description ?? 'échec'}`)
  }
}

/**
 * Remplace le clavier inline d'un message (replyMarkup absent = retire les boutons).
 * Fonctionne pour les messages texte ET les documents.
 */
export async function editTelegramMessageReplyMarkup(
  botToken: string,
  opts: { chatId: string | number; messageId: number; replyMarkup?: TelegramInlineKeyboard },
): Promise<void> {
  const body: Record<string, unknown> = { chat_id: opts.chatId, message_id: opts.messageId }
  if (opts.replyMarkup) body.reply_markup = opts.replyMarkup
  const res = await fetch(`${API_BASE}/bot${botToken}/editMessageReplyMarkup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const json = (await res.json().catch(() => null)) as { ok?: boolean; error_code?: number; description?: string } | null
  if (!json?.ok) {
    throw new Error(`Telegram editMessageReplyMarkup ${json?.error_code ?? res.status} : ${json?.description ?? 'échec'}`)
  }
}

export async function sendTelegramDocument(
  botToken: string,
  opts: SendTelegramDocumentOptions,
): Promise<{ messageId: number }> {
  const form = new FormData()
  form.append('chat_id', opts.chatId)
  const filename = 'name' in opts.file && opts.file.name ? opts.file.name : 'document.bin'
  form.append('document', opts.file, filename)
  if (opts.caption) form.append('caption', opts.caption)
  if (opts.parseMode && opts.parseMode !== 'none') form.append('parse_mode', opts.parseMode)
  if (opts.replyMarkup) form.append('reply_markup', JSON.stringify(opts.replyMarkup))

  const res = await fetch(`${API_BASE}/bot${botToken}/sendDocument`, {
    method: 'POST',
    body: form,
  })
  return parseTelegramResponse(res)
}
