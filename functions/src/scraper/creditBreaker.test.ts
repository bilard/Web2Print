// Tests du circuit-breaker « crédits épuisés » (creditBreaker.ts).
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { isCreditError, tripCredits, creditsExhausted, resetCreditBreaker, CREDIT_TRIP_MS } from './creditBreaker'

describe('isCreditError', () => {
  it('détecte le 402 quel que soit le corps', () => {
    expect(isCreditError(402, '')).toBe(true)
    expect(isCreditError(402, 'whatever')).toBe(true)
  })
  it('détecte les messages de solde épuisé sans 402', () => {
    expect(isCreditError(200, 'Insufficient credits to perform this request')).toBe(true)
    expect(isCreditError(403, 'Account is suspended')).toBe(true)
    expect(isCreditError(0, 'Bright Data : balance insuffisante. Recharger sur le dashboard.')).toBe(true)
    expect(isCreditError(0, 'compte suspendu ou zone inactive')).toBe(true)
    expect(isCreditError(0, 'InsufficientBalanceError')).toBe(true)
  })
  it('ne se déclenche PAS sur les erreurs ordinaires (403 anti-bot, 429, 5xx)', () => {
    expect(isCreditError(403, 'Forbidden')).toBe(false)
    expect(isCreditError(429, 'rate limit')).toBe(false)
    expect(isCreditError(500, 'internal error')).toBe(false)
    expect(isCreditError(404, 'not found')).toBe(false)
  })
})

describe('tripCredits / creditsExhausted', () => {
  beforeEach(() => { resetCreditBreaker(); vi.useFakeTimers() })
  afterEach(() => vi.useRealTimers())

  it('ouvert seulement après trip, et par fournisseur', () => {
    expect(creditsExhausted('firecrawl')).toBe(false)
    tripCredits('firecrawl', '402 Insufficient credits')
    expect(creditsExhausted('firecrawl')).toBe(true)
    expect(creditsExhausted('jina')).toBe(false)
    expect(creditsExhausted('brightdata')).toBe(false)
  })

  it('se referme seul après le TTL (recharge de crédits possible)', () => {
    tripCredits('jina', '402')
    expect(creditsExhausted('jina')).toBe(true)
    vi.advanceTimersByTime(CREDIT_TRIP_MS - 1000)
    expect(creditsExhausted('jina')).toBe(true)
    vi.advanceTimersByTime(2000)
    expect(creditsExhausted('jina')).toBe(false)
  })
})
