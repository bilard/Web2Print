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

  describe('callback_query (node Approbation Telegram)', () => {
    const cq = (data: string, chatId = 8229250033) => ({
      update_id: 200,
      callback_query: {
        id: 'cbq-1',
        data,
        from: { username: 'ibs' },
        message: { chat: { id: chatId } },
      },
    })

    it('approval (approve) sur un callback wfappr valide', () => {
      const r = evaluateUpdate(cq('wfappr:abc-123:approve'), ALLOWED)
      expect(r).toEqual({
        action: 'approval',
        decision: {
          approvalId: 'abc-123',
          decision: 'approve',
          chatId: 8229250033,
          fromUsername: 'ibs',
          callbackQueryId: 'cbq-1',
        },
      })
    })

    it('approval (reject) sur un callback wfappr valide', () => {
      const r = evaluateUpdate(cq('wfappr:abc-123:reject'), ALLOWED)
      expect(r.action).toBe('approval')
      if (r.action === 'approval') expect(r.decision.decision).toBe('reject')
    })

    it('ignore (not-allowed) si le chat du callback est hors allowlist', () => {
      const r = evaluateUpdate(cq('wfappr:abc-123:approve', 999), ALLOWED)
      expect(r).toEqual({ action: 'ignore', reason: 'not-allowed' })
    })

    it('ignore (bad-callback) si data sans préfixe wfappr', () => {
      const r = evaluateUpdate(cq('autre:donnée'), ALLOWED)
      expect(r).toEqual({ action: 'ignore', reason: 'bad-callback' })
    })

    it('ignore (bad-callback) si verdict inconnu ou segments en trop', () => {
      expect(evaluateUpdate(cq('wfappr:abc:maybe'), ALLOWED)).toEqual({ action: 'ignore', reason: 'bad-callback' })
      expect(evaluateUpdate(cq('wfappr:abc:approve:x'), ALLOWED)).toEqual({ action: 'ignore', reason: 'bad-callback' })
      expect(evaluateUpdate(cq('wfappr::approve'), ALLOWED)).toEqual({ action: 'ignore', reason: 'bad-callback' })
    })

    it('ignore (no-chat-id) si le callback ne porte pas de chat', () => {
      const r = evaluateUpdate(
        { update_id: 201, callback_query: { id: 'cbq-2', data: 'wfappr:abc:approve' } },
        ALLOWED,
      )
      expect(r).toEqual({ action: 'ignore', reason: 'no-chat-id' })
    })
  })
})
