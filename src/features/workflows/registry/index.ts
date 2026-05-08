// src/features/workflows/registry/index.ts
import type { NodeSpec } from '../types'

class NodeRegistry {
  private map = new Map<string, NodeSpec>()
  register<C = unknown, I = unknown, O = unknown>(spec: NodeSpec<C, I, O>): void {
    if (this.map.has(spec.type)) {
      throw new Error(`Node type "${spec.type}" already registered`)
    }
    this.map.set(spec.type, spec as NodeSpec)
  }
  get(type: string): NodeSpec | undefined {
    return this.map.get(type)
  }
  list(): NodeSpec[] {
    return Array.from(this.map.values())
  }
  clear(): void {
    this.map.clear()
  }
}

export const nodeRegistry = new NodeRegistry()
