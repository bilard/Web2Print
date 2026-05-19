// src/features/workflows/runtime/ports.ts
import type { ComponentType } from 'react'
import type { PortType } from '../types'

export interface PortTypeSpec {
  type: PortType
  label: string
  validator: (value: unknown) => boolean
  Previewer: ComponentType<{ value: unknown }>
  converter?: (value: unknown, target: PortType) => unknown
  /** Stroke color used by edges/handles for this port type. */
  color?: string
}

const FALLBACK_PORT_COLOR = '#6366f1'

export function getPortColor(type: PortType | undefined | null): string {
  if (!type) return FALLBACK_PORT_COLOR
  return portTypeRegistry.get(type)?.color ?? FALLBACK_PORT_COLOR
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
  if (source === 'any' || target === 'any') return true
  const src = portTypeRegistry.get(source)
  return Boolean(src?.converter)
}

const NoopPreviewer: ComponentType<{ value: unknown }> = () => null

export function registerBuiltinPorts(): void {
  const builtins: PortTypeSpec[] = [
    {
      type: 'file',
      label: 'File',
      color: '#f59e0b',
      validator: (v) => v instanceof File || v instanceof Blob,
      Previewer: NoopPreviewer,
    },
    {
      type: 'files',
      label: 'Files (folder)',
      color: '#fb923c',
      validator: (v) => Array.isArray(v) && v.every((x) => x instanceof File || x instanceof Blob),
      Previewer: NoopPreviewer,
    },
    {
      type: 'sheet',
      label: 'Sheet',
      color: '#10b981',
      validator: (v) => typeof v === 'object' && v !== null,
      Previewer: NoopPreviewer,
    },
    {
      type: 'product[]',
      label: 'Product[]',
      color: '#06b6d4',
      validator: (v) => Array.isArray(v),
      Previewer: NoopPreviewer,
    },
    {
      type: 'asset[]',
      label: 'Asset[]',
      color: '#a855f7',
      validator: (v) => Array.isArray(v),
      Previewer: NoopPreviewer,
    },
    {
      type: 'pim-products',
      label: 'PIM result',
      color: '#22c55e',
      validator: (v) => typeof v === 'object' && v !== null,
      Previewer: NoopPreviewer,
    },
    {
      type: 'export-result',
      label: 'Export result',
      color: '#ec4899',
      validator: (v) => typeof v === 'object' && v !== null,
      Previewer: NoopPreviewer,
    },
    {
      type: 'any',
      label: 'Any',
      color: '#6366f1',
      validator: () => true,
      Previewer: NoopPreviewer,
      converter: (value) => value,
    },
  ]
  for (const b of builtins) portTypeRegistry.register(b)
}
