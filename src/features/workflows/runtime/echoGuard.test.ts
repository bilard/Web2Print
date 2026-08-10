import { describe, it, expect } from 'vitest'
import { isOwnEcho } from './publishClientRun'

describe('isOwnEcho — un onglet ne s’écoute pas lui-même', () => {
  it('reconnaît son propre battement', () => {
    expect(isOwnEcho({ origin: 'client', runId: 'run-1' }, 'run-1')).toBe(true)
  })

  it('ne confond pas avec le run d’un autre onglet', () => {
    expect(isOwnEcho({ origin: 'client', runId: 'run-2' }, 'run-1')).toBe(false)
  })

  it('ne confond pas avec un run serveur', () => {
    expect(isOwnEcho({ origin: 'server', runId: 'cron-9' }, 'run-1')).toBe(false)
  })
})
