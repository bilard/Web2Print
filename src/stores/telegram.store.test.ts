import { describe, it, expect, beforeEach } from 'vitest'
import { useTelegramStore } from './telegram.store'

describe('telegram.store', () => {
  beforeEach(() => {
    useTelegramStore.setState({ botToken: '' })
  })

  it('botToken vide par défaut', () => {
    expect(useTelegramStore.getState().botToken).toBe('')
  })

  it('setBotToken met à jour le token', () => {
    useTelegramStore.getState().setBotToken('123:ABC')
    expect(useTelegramStore.getState().botToken).toBe('123:ABC')
  })
})
