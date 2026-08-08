import { describe, it, expect } from 'vitest'
import { summarizeRun, filterLogs, logsOfNode, STALE_RUN_MS, type RunLiveDoc, type RunLog } from './runLive'

const NOW = 1_700_000_000_000
const log = (level: RunLog['level'], msg: string, node?: string, ts = NOW): RunLog =>
  ({ ts, level, msg, ...(node ? { node } : {}) })

describe('summarizeRun', () => {
  it('rend null sans run connu', () => {
    expect(summarizeRun(null, NOW)).toBeNull()
    expect(summarizeRun({ status: 'success' }, NOW)).toBeNull() // sans startedAt : rien à dater
  })

  it('compte les nodes par état et les messages par niveau', () => {
    const doc: RunLiveDoc = {
      status: 'partial', trigger: 'cron', startedAt: NOW - 60_000, endedAt: NOW - 10_000,
      nodeStates: { a: 'success', b: 'success', c: 'error', d: 'skipped' },
      logs: [log('info', 'ok'), log('warn', 'attention'), log('error', 'boum')],
    }
    const s = summarizeRun(doc, NOW)!
    expect(s.nodes).toEqual({ total: 4, ok: 2, error: 1, running: 0, skipped: 1 })
    expect(s.errors).toBe(1)
    expect(s.warnings).toBe(1)
    expect(s.durationMs).toBe(50_000)
    expect(s.running).toBe(false)
  })

  it('mesure la durée EN COURS jusqu’à maintenant', () => {
    const s = summarizeRun({ status: 'running', startedAt: NOW - 120_000, nodeStates: { a: 'running' } }, NOW)!
    expect(s.running).toBe(true)
    expect(s.durationMs).toBe(120_000)
    expect(s.nodes.running).toBe(1)
  })

  it('déclare interrompu un run « en cours » trop vieux', () => {
    // Sinon la PWA annonce une collecte active des heures après la fin — et on décide de
    // ne PAS relancer sur la foi de cet affichage.
    const s = summarizeRun({ status: 'running', startedAt: NOW - STALE_RUN_MS - 1, nodeStates: { a: 'running' } }, NOW)!
    expect(s.status).toBe('stopped')
    expect(s.running).toBe(false)
    expect(s.nodes.running).toBe(0)
  })
})

describe('filterLogs', () => {
  const logs = [log('info', 'un'), log('warn', 'deux'), log('error', 'trois'), log('info', 'quatre')]

  it('rend le plus RÉCENT en premier', () => {
    // Depuis un téléphone, on cherche la dernière chose qui s'est passée.
    expect(filterLogs(logs, 'all').map((l) => l.msg)).toEqual(['quatre', 'trois', 'deux', 'un'])
  })

  it('« avertissements » inclut les erreurs, « erreurs » non l’inverse', () => {
    expect(filterLogs(logs, 'warn').map((l) => l.msg)).toEqual(['trois', 'deux'])
    expect(filterLogs(logs, 'error').map((l) => l.msg)).toEqual(['trois'])
  })

  it('plafonne sans mentir sur l’ordre', () => {
    expect(filterLogs(logs, 'all', 2).map((l) => l.msg)).toEqual(['quatre', 'trois'])
  })
})

describe('logsOfNode', () => {
  it('ne rend que les messages du node demandé', () => {
    const logs = [log('info', 'a1', 'a'), log('error', 'b1', 'b'), log('info', 'a2', 'a'), log('info', 'global')]
    expect(logsOfNode(logs, 'a').map((l) => l.msg)).toEqual(['a2', 'a1'])
    expect(logsOfNode(logs, 'b').map((l) => l.msg)).toEqual(['b1'])
  })
})
