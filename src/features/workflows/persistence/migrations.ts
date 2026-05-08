// src/features/workflows/persistence/migrations.ts
import type { Workflow } from '../types'

export const CURRENT_SCHEMA_VERSION = 1

type Migrator = (wf: any) => any

const migrators: Record<number, Migrator> = {
  // Future: 1: (wf) => ({ ...wf, schemaVersion: 2, /* changes */ }),
}

export function migrate(wf: Partial<Workflow> & { schemaVersion?: number }): Workflow {
  let from = wf.schemaVersion ?? 1
  if (from > CURRENT_SCHEMA_VERSION) {
    throw new Error(`Workflow schemaVersion ${from} is from the future (current=${CURRENT_SCHEMA_VERSION})`)
  }
  let current = { ...wf, schemaVersion: from } as any
  while (current.schemaVersion < CURRENT_SCHEMA_VERSION) {
    const m = migrators[current.schemaVersion]
    if (!m) throw new Error(`Missing migrator for v${current.schemaVersion}`)
    current = m(current)
  }
  return current as Workflow
}
