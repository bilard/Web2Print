import { describe, it, expect, vi } from 'vitest'
import { processInboxMessage, type InboxWorkerDeps, type InboxDoc } from './inboxWorker'

const doc: InboxDoc = { updateId: 1, chatId: 42, text: 'bonjour', status: 'pending' }

function mkDeps(over: Partial<InboxWorkerDeps> = {}): InboxWorkerDeps {
  return {
    claim: vi.fn().mockResolvedValue(true),
    process: vi.fn().mockResolvedValue(undefined),
    markDone: vi.fn().mockResolvedValue(undefined),
    markError: vi.fn().mockResolvedValue(undefined),
    ...over,
  }
}

describe('inboxWorker', () => {
  it('claim gagné → process puis done', async () => {
    const deps = mkDeps()
    await processInboxMessage(deps, doc)
    expect(deps.claim).toHaveBeenCalledWith(1)
    expect(deps.process).toHaveBeenCalledWith(doc)
    expect(deps.markDone).toHaveBeenCalledWith(1)
    expect(deps.markError).not.toHaveBeenCalled()
  })

  it('claim perdu → process non appelé', async () => {
    const deps = mkDeps({ claim: vi.fn().mockResolvedValue(false) })
    await processInboxMessage(deps, doc)
    expect(deps.process).not.toHaveBeenCalled()
    expect(deps.markDone).not.toHaveBeenCalled()
  })

  it('process rejette → markError avec le message', async () => {
    const deps = mkDeps({ process: vi.fn().mockRejectedValue(new Error('échec génération')) })
    await processInboxMessage(deps, doc)
    expect(deps.markError).toHaveBeenCalledWith(1, 'échec génération')
    expect(deps.markDone).not.toHaveBeenCalled()
  })
})
