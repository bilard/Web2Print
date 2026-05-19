// src/features/workflows/registry/index.ts
import type { NodeSpec } from '../types'

class NodeRegistry {
  private map = new Map<string, NodeSpec>()
  register<C = unknown, I = unknown, O = unknown>(spec: NodeSpec<C, I, O>): void {
    // Overwrite silencieux : permet au HMR Vite de re-registrer un node
    // après modification du fichier source sans throw "already registered".
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
