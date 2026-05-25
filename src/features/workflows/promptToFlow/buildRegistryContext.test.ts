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
})
