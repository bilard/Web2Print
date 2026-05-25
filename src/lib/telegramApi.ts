// src/lib/telegramApi.ts
// Couche d'accès à l'API Bot Telegram. Appels fetch directs depuis le navigateur :
// api.telegram.org renvoie Access-Control-Allow-Origin: *, donc pas de proxy.

const API_BASE = 'https://api.telegram.org'

export type TelegramParseMode = 'none' | 'HTML' | 'MarkdownV2'

export interface SendTelegramMessageOptions {
  chatId: string
  text: string
  parseMode?: TelegramParseMode
}

export interface SendTelegramDocumentOptions {
  chatId: string
  file: File | Blob
  caption?: string
  parseMode?: TelegramParseMode
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

  const res = await fetch(`${API_BASE}/bot${botToken}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  return parseTelegramResponse(res)
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

  const res = await fetch(`${API_BASE}/bot${botToken}/sendDocument`, {
    method: 'POST',
    body: form,
  })
  return parseTelegramResponse(res)
}
