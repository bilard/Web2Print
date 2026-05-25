import { describe, it, expect, vi, beforeEach } from 'vitest'
import { sendTelegramMessage, sendTelegramDocument } from './telegramApi'

function mockFetch(json: unknown, ok = true, status = 200) {
  return vi.fn().mockResolvedValue({
    ok,
    status,
    json: () => Promise.resolve(json),
  } as unknown as Response)
}

describe('telegramApi', () => {
  beforeEach(() => {
    vi.unstubAllGlobals()
  })

  it('sendTelegramMessage POST sendMessage avec chat_id + text', async () => {
    const fetchMock = mockFetch({ ok: true, result: { message_id: 42 } })
    vi.stubGlobal('fetch', fetchMock)

    const out = await sendTelegramMessage('TKN', { chatId: '123', text: 'hello' })

    expect(out).toEqual({ messageId: 42 })
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://api.telegram.org/botTKN/sendMessage')
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body as string)).toEqual({ chat_id: '123', text: 'hello' })
  })

  it("n'ajoute parse_mode que s'il vaut HTML ou MarkdownV2", async () => {
    const fetchMock = mockFetch({ ok: true, result: { message_id: 1 } })
    vi.stubGlobal('fetch', fetchMock)

    await sendTelegramMessage('TKN', { chatId: '1', text: 't', parseMode: 'none' })
    expect(JSON.parse(fetchMock.mock.calls[0][1].body as string)).not.toHaveProperty('parse_mode')

    await sendTelegramMessage('TKN', { chatId: '1', text: 't', parseMode: 'HTML' })
    expect(JSON.parse(fetchMock.mock.calls[1][1].body as string).parse_mode).toBe('HTML')
  })

  it('sendTelegramDocument envoie un FormData avec le fichier', async () => {
    const fetchMock = mockFetch({ ok: true, result: { message_id: 7 } })
    vi.stubGlobal('fetch', fetchMock)

    const file = new File(['data'], 'export.pdf', { type: 'application/pdf' })
    const out = await sendTelegramDocument('TKN', { chatId: '9', file, caption: 'voici' })

    expect(out).toEqual({ messageId: 7 })
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://api.telegram.org/botTKN/sendDocument')
    const form = init.body as FormData
    expect(form).toBeInstanceOf(FormData)
    expect(form.get('chat_id')).toBe('9')
    expect(form.get('caption')).toBe('voici')
    expect(form.get('document')).toBeInstanceOf(File)
  })

  it('lève une Error lisible quand ok:false', async () => {
    const fetchMock = mockFetch({ ok: false, error_code: 400, description: 'chat not found' })
    vi.stubGlobal('fetch', fetchMock)

    await expect(
      sendTelegramMessage('TKN', { chatId: 'x', text: 't' }),
    ).rejects.toThrow('Telegram API 400 : chat not found')
  })

  it('lève une Error lisible quand res.json() échoue', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 502,
      statusText: 'Bad Gateway',
      json: () => Promise.reject(new SyntaxError('bad json')),
    } as unknown as Response)
    vi.stubGlobal('fetch', fetchMock)

    await expect(
      sendTelegramMessage('TKN', { chatId: 'x', text: 't' }),
    ).rejects.toThrow(/Telegram API HTTP 502.*réponse illisible/)
  })
})
