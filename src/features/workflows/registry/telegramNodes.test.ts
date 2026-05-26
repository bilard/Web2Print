import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/telegramApi', () => ({
  sendTelegramMessage: vi.fn(),
  sendTelegramDocument: vi.fn(),
}))

// addOutboxMessage écrit dans Firestore : on le stube pour vérifier la journalisation sans I/O.
// Il DOIT retourner une Promise (logOutbox enchaîne `.catch()`).
vi.mock('@/features/telegram/useTelegramInbox', () => ({
  addOutboxMessage: vi.fn(() => Promise.resolve()),
}))

import { sendTelegramMessage, sendTelegramDocument } from '@/lib/telegramApi'
import { addOutboxMessage } from '@/features/telegram/useTelegramInbox'
import { sendTelegramNode } from './telegramNodes'
import { useTelegramStore } from '@/stores/telegram.store'
import type { RunContextApi } from '../types'

type Cfg = Parameters<typeof sendTelegramNode.run>[1]

const baseConfig: Cfg = {
  botToken: 'TKN',
  chatId: '123',
  text: 'hello',
  parseMode: 'none',
  iterate: false,
}

function mkCtx(overrides: Partial<RunContextApi> = {}): RunContextApi {
  return {
    signal: new AbortController().signal,
    log: vi.fn(),
    rawConfig: undefined,
    ...overrides,
  }
}

describe('send-telegram node', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Config globale vide par défaut : le fallback ne doit pas masquer les guards des tests.
    useTelegramStore.setState({ botToken: '', chatId: '' })
  })

  it('envoie un message texte unique', async () => {
    vi.mocked(sendTelegramMessage).mockResolvedValue({ messageId: 5 })

    const res = await sendTelegramNode.run(mkCtx(), baseConfig, {})

    expect(sendTelegramMessage).toHaveBeenCalledWith('TKN', {
      chatId: '123',
      text: 'hello',
      parseMode: 'none',
    })
    expect(res).toEqual({ result: { sent: true, count: 1, messageIds: [5] } })
  })

  it('envoie un document quand le port attachment est connecté', async () => {
    vi.mocked(sendTelegramDocument).mockResolvedValue({ messageId: 8 })
    const file = new File(['x'], 'a.pdf', { type: 'application/pdf' })

    const res = await sendTelegramNode.run(mkCtx(), baseConfig, { attachment: file })

    expect(sendTelegramDocument).toHaveBeenCalledTimes(1)
    expect(sendTelegramMessage).not.toHaveBeenCalled()
    expect(res.result.messageIds).toEqual([8])
  })

  it('mode iterate : un message par row, chat_id ré-interpolé', async () => {
    vi.mocked(sendTelegramMessage)
      .mockResolvedValueOnce({ messageId: 1 })
      .mockResolvedValueOnce({ messageId: 2 })
    const rawConfig: Cfg = { ...baseConfig, chatId: '{{id}}', iterate: true }
    const ctx = mkCtx({ rawConfig })
    const inputs = { data: [{ id: '10' }, { id: '20' }] }

    const res = await sendTelegramNode.run(ctx, { ...baseConfig, iterate: true }, inputs)

    expect(sendTelegramMessage).toHaveBeenCalledTimes(2)
    expect(vi.mocked(sendTelegramMessage).mock.calls[0][1].chatId).toBe('10')
    expect(vi.mocked(sendTelegramMessage).mock.calls[1][1].chatId).toBe('20')
    expect(res.result.count).toBe(2)
  })

  it('lève une Error si botToken manquant', async () => {
    await expect(
      sendTelegramNode.run(mkCtx(), { ...baseConfig, botToken: '' }, {}),
    ).rejects.toThrow('Bot token')
  })

  it('lève une Error si chatId manquant (mode unique)', async () => {
    await expect(
      sendTelegramNode.run(mkCtx(), { ...baseConfig, chatId: '' }, {}),
    ).rejects.toThrow('Chat ID')
  })

  it('abort interrompt la boucle iterate', async () => {
    const ac = new AbortController()
    vi.mocked(sendTelegramMessage).mockImplementation(async () => {
      ac.abort()
      return { messageId: 1 }
    })
    const rawConfig: Cfg = { ...baseConfig, chatId: '{{id}}', iterate: true }
    const ctx = mkCtx({ rawConfig, signal: ac.signal })
    const inputs = { data: [{ id: '1' }, { id: '2' }, { id: '3' }] }

    const res = await sendTelegramNode.run(ctx, { ...baseConfig, iterate: true }, inputs)

    expect(res.result.count).toBe(1)
  })

  it('mode iterate avec attachment : un document par ligne', async () => {
    vi.mocked(sendTelegramDocument)
      .mockResolvedValueOnce({ messageId: 1 })
      .mockResolvedValueOnce({ messageId: 2 })
    const file = new File(['x'], 'a.pdf', { type: 'application/pdf' })
    const rawConfig: Cfg = { ...baseConfig, chatId: '{{id}}', iterate: true }
    const ctx = mkCtx({ rawConfig })
    const inputs = { data: [{ id: '10' }, { id: '20' }], attachment: file }

    const res = await sendTelegramNode.run(ctx, { ...baseConfig, iterate: true }, inputs)

    expect(sendTelegramDocument).toHaveBeenCalledTimes(2)
    expect(sendTelegramMessage).not.toHaveBeenCalled()
    expect(res.result.count).toBe(2)
  })

  it('mode iterate : une ligne échouée est loguée et la suivante est envoyée', async () => {
    vi.mocked(sendTelegramMessage)
      .mockRejectedValueOnce(new Error('chat not found'))
      .mockResolvedValueOnce({ messageId: 2 })
    const rawConfig: Cfg = { ...baseConfig, chatId: '{{id}}', iterate: true }
    const ctx = mkCtx({ rawConfig })
    const inputs = { data: [{ id: '1' }, { id: '2' }] }

    const res = await sendTelegramNode.run(ctx, { ...baseConfig, iterate: true }, inputs)

    expect(res.result.count).toBe(1)
    expect(res.result.messageIds).toEqual([2])
    expect(ctx.log).toHaveBeenCalledWith('warn', expect.stringContaining('Ligne 1 échouée'))
  })

  it('propage parseMode HTML jusqu’à la couche API (mode unique)', async () => {
    vi.mocked(sendTelegramMessage).mockResolvedValue({ messageId: 1 })

    await sendTelegramNode.run(mkCtx(), { ...baseConfig, parseMode: 'HTML' }, {})

    expect(vi.mocked(sendTelegramMessage).mock.calls[0][1].parseMode).toBe('HTML')
  })

  it('iterate sans données en entrée : avertit et envoie un message unique', async () => {
    vi.mocked(sendTelegramMessage).mockResolvedValue({ messageId: 1 })
    const ctx = mkCtx()

    const res = await sendTelegramNode.run(ctx, { ...baseConfig, iterate: true }, {})

    expect(sendTelegramMessage).toHaveBeenCalledTimes(1)
    expect(res.result.count).toBe(1)
    expect(ctx.log).toHaveBeenCalledWith('warn', expect.stringContaining('aucune ligne en entrée'))
  })

  it('Message vide : utilise le texte reçu sur le port data (fallback)', async () => {
    vi.mocked(sendTelegramMessage).mockResolvedValue({ messageId: 9 })

    const res = await sendTelegramNode.run(mkCtx(), { ...baseConfig, text: '' }, { data: 'depuis data' })

    expect(sendTelegramMessage).toHaveBeenCalledWith('TKN', {
      chatId: '123',
      text: 'depuis data',
      parseMode: 'none',
    })
    expect(res.result.messageIds).toEqual([9])
  })

  it('Message renseigné : a priorité sur le texte du port data', async () => {
    vi.mocked(sendTelegramMessage).mockResolvedValue({ messageId: 1 })

    await sendTelegramNode.run(mkCtx(), { ...baseConfig, text: 'champ' }, { data: 'depuis data' })

    expect(vi.mocked(sendTelegramMessage).mock.calls[0][1].text).toBe('champ')
  })

  it('Message vide sert de légende du document quand data est vide', async () => {
    vi.mocked(sendTelegramDocument).mockResolvedValue({ messageId: 2 })
    const file = new File(['x'], 'a.pdf', { type: 'application/pdf' })

    await sendTelegramNode.run(mkCtx(), { ...baseConfig, text: '' }, { attachment: file })

    expect(vi.mocked(sendTelegramDocument).mock.calls[0][1].caption).toBe('')
    expect(sendTelegramMessage).not.toHaveBeenCalled()
  })

  it('lève une Error si ni Message ni data ni fichier (mode unique)', async () => {
    await expect(
      sendTelegramNode.run(mkCtx(), { ...baseConfig, text: '' }, {}),
    ).rejects.toThrow('Message Telegram vide')
  })

  it('journalise l’envoi dans la boîte (message sortant)', async () => {
    vi.mocked(sendTelegramMessage).mockResolvedValue({ messageId: 42 })

    await sendTelegramNode.run(mkCtx(), baseConfig, {})

    expect(addOutboxMessage).toHaveBeenCalledWith('123', 'hello', 42)
  })

  it('journalise l’envoi d’un document avec le préfixe 📎 et la légende réellement envoyée', async () => {
    vi.mocked(sendTelegramDocument).mockResolvedValue({ messageId: 7 })
    const file = new File(['x'], 'rapport.pdf', { type: 'application/pdf' })

    await sendTelegramNode.run(mkCtx(), { ...baseConfig, text: 'légende' }, { attachment: file })

    expect(addOutboxMessage).toHaveBeenCalledWith('123', '📎 rapport.pdf\nlégende', 7)
  })

  it('mode iterate : journalise un message sortant par ligne envoyée', async () => {
    vi.mocked(sendTelegramMessage)
      .mockResolvedValueOnce({ messageId: 1 })
      .mockResolvedValueOnce({ messageId: 2 })
    const rawConfig: Cfg = { ...baseConfig, chatId: '{{id}}', text: 'salut {{id}}', iterate: true }
    const ctx = mkCtx({ rawConfig })
    const inputs = { data: [{ id: '10' }, { id: '20' }] }

    await sendTelegramNode.run(ctx, { ...baseConfig, iterate: true }, inputs)

    expect(addOutboxMessage).toHaveBeenCalledTimes(2)
    expect(addOutboxMessage).toHaveBeenNthCalledWith(1, '10', 'salut 10', 1)
    expect(addOutboxMessage).toHaveBeenNthCalledWith(2, '20', 'salut 20', 2)
  })

  it('utilise la config globale quand les champs du node sont vides', async () => {
    useTelegramStore.setState({ botToken: 'GTOKEN', chatId: '999' })
    vi.mocked(sendTelegramMessage).mockResolvedValue({ messageId: 7 })

    const res = await sendTelegramNode.run(mkCtx(), { ...baseConfig, botToken: '', chatId: '' }, {})

    expect(sendTelegramMessage).toHaveBeenCalledWith('GTOKEN', {
      chatId: '999',
      text: 'hello',
      parseMode: 'none',
    })
    expect(res.result.messageIds).toEqual([7])
  })
})
