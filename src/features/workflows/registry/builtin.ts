// src/features/workflows/registry/builtin.ts
import { portTypeRegistry, registerBuiltinPorts } from '../runtime/ports'
import { nodeRegistry } from './index'

let initialized = false

export function initWorkflowsRegistry(): void {
  if (initialized) return
  initialized = true
  if (portTypeRegistry.list().length === 0) registerBuiltinPorts()
  // Node specs are registered here once each *.node.ts module is added (Phase 3).
  // Importing them is enough — they call nodeRegistry.register at module load.
}
