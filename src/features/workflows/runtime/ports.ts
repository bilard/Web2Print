// src/features/workflows/runtime/ports.ts
import type { ComponentType } from 'react'
import type { PortType } from '../types'

export interface PortTypeSpec {
  type: PortType
  label: string
  validator: (value: unknown) => boolean
  Previewer: ComponentType<{ value: unknown }>
  converter?: (value: unknown, target: PortType) => unknown
}

class PortTypeRegistry {
  private map = new Map<PortType, PortTypeSpec>()

  register(spec: PortTypeSpec): void {
    if (this.map.has(spec.type)) {
      throw new Error(`Port type "${spec.type}" already registered`)
    }
    this.map.set(spec.type, spec)
  }

  get(type: PortType): PortTypeSpec | undefined {
    return this.map.get(type)
  }

  has(type: PortType): boolean {
    return this.map.has(type)
  }

  list(): PortTypeSpec[] {
    return Array.from(this.map.values())
  }

  clear(): void {
    this.map.clear()
  }
}

export const portTypeRegistry = new PortTypeRegistry()

export function isCompatible(source: PortType, target: PortType): boolean {
  if (source === target) return true
  const src = portTypeRegistry.get(source)
  return Boolean(src?.converter)
}

const NoopPreviewer: ComponentType<{ value: unknown }> = () => null

export function registerBuiltinPorts(): void {
  const builtins: PortTypeSpec[] = [
    {
      type: 'file',
      label: 'File',
      validator: (v) => v instanceof File || v instanceof Blob,
      Previewer: NoopPreviewer,
    },
    {
      type: 'sheet',
      label: 'Sheet',
      validator: (v) => typeof v === 'object' && v !== null,
      Previewer: NoopPreviewer,
    },
    {
      type: 'product[]',
      label: 'Product[]',
      validator: (v) => Array.isArray(v),
      Previewer: NoopPreviewer,
    },
    {
      type: 'asset[]',
      label: 'Asset[]',
      validator: (v) => Array.isArray(v),
      Previewer: NoopPreviewer,
    },
    {
      type: 'pim-products',
      label: 'PIM result',
      validator: (v) => typeof v === 'object' && v !== null,
      Previewer: NoopPreviewer,
    },
    {
      type: 'export-result',
      label: 'Export result',
      validator: (v) => typeof v === 'object' && v !== null,
      Previewer: NoopPreviewer,
    },
  ]
  for (const b of builtins) portTypeRegistry.register(b)
}
