// src/features/workflows/registry/builtin.ts
import { portTypeRegistry, registerBuiltinPorts } from '../runtime/ports'
import { nodeRegistry } from './index'

// Side-effect imports register node specs into nodeRegistry
import './importNodes'
import './scrapeNodes'
import './gdriveNodes'
import './enrichmentNodes'
import './aiNodes'
import './transformationNodes'
import './persistenceNodes'
import './taxonomyNodes'
import './exportNodes'
import './logicNodes'
import './communicationNodes'
import './decomposeNode'

let initialized = false

export function initWorkflowsRegistry(): void {
  if (initialized) return
  initialized = true
  if (portTypeRegistry.list().length === 0) registerBuiltinPorts()
  // Node specs are registered via the side-effect imports above.
}
