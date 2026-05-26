import { describe, it, expect } from 'vitest'
import { classifyDeletable, withinDeleteWindow, TELEGRAM_DELETE_WINDOW_MS } from './inboxDelete'

const NOW = 1_700_000_000_000
const at = (ms: number) => ({ receivedAt: { toMillis: () => ms } })

describe('withinDeleteWindow', () => {
  it('true quand receivedAt absent (impossible de juger → on tente)', () => {
    expect(withinDeleteWindow({ receivedAt: null }, NOW)).toBe(true)
    expect(withinDeleteWindow({}, NOW)).toBe(true)
  })

  it('true juste sous 48 h, false juste au-delà', () => {
    expect(withinDeleteWindow(at(NOW - TELEGRAM_DELETE_WINDOW_MS + 1000), NOW)).toBe(true)
    expect(withinDeleteWindow(at(NOW - TELEGRAM_DELETE_WINDOW_MS - 1000), NOW)).toBe(false)
  })
})

describe('classifyDeletable', () => {
  const token = 'bot123:abc'

  it('telegram quand message_id présent, token présent et < 48 h', () => {
    expect(classifyDeletable({ messageId: 42, ...at(NOW) }, token, NOW)).toBe('telegram')
  })

  it('local-only-no-id sans message_id', () => {
    expect(classifyDeletable({ messageId: undefined, ...at(NOW) }, token, NOW)).toBe('local-only-no-id')
  })

  it('local-only-no-id sans token (priorité sur la fenêtre)', () => {
    expect(classifyDeletable({ messageId: 42, ...at(NOW - TELEGRAM_DELETE_WINDOW_MS - 1) }, '', NOW)).toBe(
      'local-only-no-id',
    )
  })

  it('local-only-old si message_id présent mais > 48 h', () => {
    expect(classifyDeletable({ messageId: 42, ...at(NOW - TELEGRAM_DELETE_WINDOW_MS - 1000) }, token, NOW)).toBe(
      'local-only-old',
    )
  })
})
