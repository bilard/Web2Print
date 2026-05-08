// src/features/workflows/registry/builtin.ts
import { portTypeRegistry, registerBuiltinPorts } from '../runtime/ports'
import { nodeRegistry } from './index'

// Side-effect imports register node specs into nodeRegistry
import './importNodes'
import './enrichmentNodes'

let initialized = false

export function initWorkflowsRegistry(): void {
  if (initialized) return
  initialized = true
  if (portTypeRegistry.list().length === 0) registerBuiltinPorts()
  // Node specs are registered via the side-effect imports above.
}
