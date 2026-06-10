// functions/src/workflow/registry.ts
import type { ServerNodeSpec } from './types'

const registry = new Map<string, ServerNodeSpec>()

export function registerServerNode(spec: ServerNodeSpec): void {
  registry.set(spec.type, spec)
}
export function getServerNode(type: string): ServerNodeSpec | undefined {
  return registry.get(type)
}
