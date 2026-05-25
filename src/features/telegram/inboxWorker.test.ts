import { describe, it, expect, vi } from 'vitest'
import { processInboxMessage, buildAckText, type InboxWorkerDeps, type InboxDoc } from './inboxWorker'

const doc: InboxDoc = { updateId: 1, chatId: 42, text: 'bonjour', status: 'pending' }

function mkDeps(over: Partial<InboxWorkerDeps> = {}): InboxWorkerDeps {
  return {
    claim: vi.fn().mockResolvedValue(true),
    sendAck: vi.fn().mockResolvedValue(undefined),
    markDone: vi.fn().mockResolvedValue(undefined),
    markError: vi.fn().mockResolvedValue(undefined),
    ...over,
  }
}

describe('inboxWorker', () => {
  it('buildAckText préfixe « reçu : »', () => {
    expect(buildAckText('salut')).toBe('reçu : salut')
  })

  it('claim gagné → ack puis done', async () => {
    const deps = mkDeps()
    await processInboxMessage(deps, doc)
    expect(deps.claim).toHaveBeenCalledWith(1)
    expect(deps.sendAck).toHaveBeenCalledWith(42, 'reçu : bonjour')
    expect(deps.markDone).toHaveBeenCalledWith(1)
    expect(deps.markError).not.toHaveBeenCalled()
  })

  it('claim perdu → aucun envoi', async () => {
    const deps = mkDeps({ claim: vi.fn().mockResolvedValue(false) })
    await processInboxMessage(deps, doc)
    expect(deps.sendAck).not.toHaveBeenCalled()
    expect(deps.markDone).not.toHaveBeenCalled()
  })

  it("échec d'envoi → markError avec le message", async () => {
    const deps = mkDeps({ sendAck: vi.fn().mockRejectedValue(new Error('chat not found')) })
    await processInboxMessage(deps, doc)
    expect(deps.markError).toHaveBeenCalledWith(1, 'chat not found')
    expect(deps.markDone).not.toHaveBeenCalled()
  })
})
