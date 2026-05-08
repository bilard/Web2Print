// src/features/workflows/persistence/migrations.test.ts
import { describe, it, expect } from 'vitest'
import { CURRENT_SCHEMA_VERSION, migrate } from './migrations'

describe('migrate', () => {
  it('returns workflow as-is when at current version', () => {
    const wf = { schemaVersion: CURRENT_SCHEMA_VERSION, nodes: [], edges: [] } as any
    expect(migrate(wf).schemaVersion).toBe(CURRENT_SCHEMA_VERSION)
  })

  it('throws when version is from the future', () => {
    const wf = { schemaVersion: CURRENT_SCHEMA_VERSION + 1 } as any
    expect(() => migrate(wf)).toThrow(/from the future/i)
  })

  it('handles missing schemaVersion as v1', () => {
    const wf = { nodes: [], edges: [] } as any
    expect(migrate(wf).schemaVersion).toBe(CURRENT_SCHEMA_VERSION)
  })
})
