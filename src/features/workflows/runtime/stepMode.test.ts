// src/features/workflows/runtime/stepMode.test.ts
// Mécanique du mode pas-à-pas : pause avant node, reprise au clic, déblocage sur abort.
import { describe, it, expect, beforeEach } from 'vitest'
import { useRunContext, stepMiddleware } from './runContext'

const flush = () => new Promise<void>((r) => setTimeout(r, 0))

beforeEach(() => {
  useRunContext.getState().resetRun()
})

describe('waitForStep / continueStep', () => {
  it('bloque jusqu’à continueStep puis nettoie l’état de pause', async () => {
    useRunContext.getState().startRun()
    let resolved = false
    const p = useRunContext.getState().waitForStep('n1').then(() => { resolved = true })
    await flush()
    expect(resolved).toBe(false)
    expect(useRunContext.getState().pausedNodeId).toBe('n1')

    useRunContext.getState().continueStep()
    await p
    expect(resolved).toBe(true)
    expect(useRunContext.getState().pausedNodeId).toBeNull()
    expect(useRunContext.getState().stepResolver).toBeNull()
  })

  it('un abort pendant la pause débloque la promesse', async () => {
    const ac = useRunContext.getState().startRun()
    let resolved = false
    const p = useRunContext.getState().waitForStep('n1').then(() => { resolved = true })
    await flush()
    expect(resolved).toBe(false)

    ac.abort()
    await p
    expect(resolved).toBe(true)
    expect(useRunContext.getState().pausedNodeId).toBeNull()
  })

  it('résout immédiatement hors run (pas d’abortController)', async () => {
    await expect(useRunContext.getState().waitForStep('n1')).resolves.toBeUndefined()
  })
})

describe('stepMiddleware', () => {
  it('n’appelle next qu’après continueStep', async () => {
    useRunContext.getState().startRun()
    const calls: string[] = []
    const done = stepMiddleware({ id: 'nodeA' }, async () => { calls.push('next') })
    await flush()
    expect(calls).toEqual([])

    useRunContext.getState().continueStep()
    await done
    expect(calls).toEqual(['next'])
  })
})
