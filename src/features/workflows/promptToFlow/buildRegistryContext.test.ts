import { describe, it, expect, beforeAll } from 'vitest'
import { initWorkflowsRegistry } from '../registry/builtin'
import { nodeRegistry } from '../registry'
import { buildRegistryContext } from './buildRegistryContext'

describe('buildRegistryContext', () => {
  beforeAll(() => initWorkflowsRegistry())

  it('liste chaque node enregistré avec son type', () => {
    const ctx = buildRegistryContext()
    for (const spec of nodeRegistry.list()) {
      expect(ctx).toContain(`type: ${spec.type}`)
    }
  })

  it("documente ports et config d'un node connu", () => {
    const ctx = buildRegistryContext()
    expect(ctx).toMatch(/type: import-csv/)
    expect(ctx).toMatch(/in: file:file/)
    expect(ctx).toMatch(/out: sheet:sheet/)
    expect(ctx).toMatch(/headerRow:checkbox/)
  })

  it('marque les sources sans input', () => {
    const ctx = buildRegistryContext()
    expect(ctx).toMatch(/type: upload[\s\S]*?in: \(aucun\)/)
  })

  it('expose les champs de config des nodes à UI custom (via defaultConfig)', () => {
    const ctx = buildRegistryContext()
    // send-gmail a un ConfigComponent custom → configSchema vide, mais ses clés
    // réelles (to, subject, body…) doivent apparaître pour que le LLM les remplisse.
    expect(ctx).toMatch(/type: send-gmail[\s\S]*?\bto:/)
    expect(ctx).toMatch(/type: send-gmail[\s\S]*?\bsubject:/)
    expect(ctx).toMatch(/type: send-gmail[\s\S]*?\bbody:/)
  })
})
