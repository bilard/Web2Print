import { describe, it, expect } from 'vitest'
import { evaluateUpdate } from './evaluateUpdate'

const ALLOWED = [8229250033]

describe('evaluateUpdate', () => {
  it('enqueue un message texte d\'un chat autorisé (avec message_id)', () => {
    const r = evaluateUpdate(
      { update_id: 100, message: { message_id: 42, text: 'bonjour', chat: { id: 8229250033 }, from: { username: 'ibs' } } },
      ALLOWED,
    )
    expect(r).toEqual({
      action: 'enqueue',
      record: { updateId: 100, chatId: 8229250033, fromUsername: 'ibs', text: 'bonjour', messageId: 42 },
    })
  })

  it('messageId = null si message_id absent', () => {
    const r = evaluateUpdate(
      { update_id: 105, message: { text: 'x', chat: { id: 8229250033 } } },
      ALLOWED,
    )
    expect(r.action).toBe('enqueue')
    if (r.action === 'enqueue') expect(r.record.messageId).toBeNull()
  })

  it('fromUsername = null si absent', () => {
    const r = evaluateUpdate(
      { update_id: 101, message: { text: 'x', chat: { id: 8229250033 } } },
      ALLOWED,
    )
    expect(r.action).toBe('enqueue')
    if (r.action === 'enqueue') expect(r.record.fromUsername).toBeNull()
  })

  it('ignore (no-text) si pas de texte', () => {
    const r = evaluateUpdate({ update_id: 102, message: { chat: { id: 8229250033 } } }, ALLOWED)
    expect(r).toEqual({ action: 'ignore', reason: 'no-text' })
  })

  it('ignore (no-chat-id) si pas de chat id', () => {
    const r = evaluateUpdate({ update_id: 103, message: { text: 'hi' } }, ALLOWED)
    expect(r).toEqual({ action: 'ignore', reason: 'no-chat-id' })
  })

  it('/start est empilé (avec message_id) pour que le worker le supprime côté Telegram', () => {
    const r = evaluateUpdate(
      { update_id: 106, message: { message_id: 7, text: '/start', chat: { id: 8229250033 } } },
      ALLOWED,
    )
    expect(r).toEqual({
      action: 'enqueue',
      record: { updateId: 106, chatId: 8229250033, fromUsername: null, text: '/start', messageId: 7 },
    })
  })

  it('ignore (not-allowed) si chat hors allowlist', () => {
    const r = evaluateUpdate(
      { update_id: 104, message: { text: 'hi', chat: { id: 999 } } },
      ALLOWED,
    )
    expect(r).toEqual({ action: 'ignore', reason: 'not-allowed' })
  })
})
