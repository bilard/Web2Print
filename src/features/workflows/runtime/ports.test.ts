// src/features/workflows/runtime/ports.test.ts
import { describe, it, expect, beforeEach } from 'vitest'
import { portTypeRegistry, registerBuiltinPorts, isCompatible } from './ports'

describe('portTypeRegistry', () => {
  beforeEach(() => {
    portTypeRegistry.clear()
    registerBuiltinPorts()
  })

  it('registers built-in port types', () => {
    expect(portTypeRegistry.has('file')).toBe(true)
    expect(portTypeRegistry.has('sheet')).toBe(true)
    expect(portTypeRegistry.has('product[]')).toBe(true)
    expect(portTypeRegistry.has('asset[]')).toBe(true)
    expect(portTypeRegistry.has('pim-products')).toBe(true)
    expect(portTypeRegistry.has('export-result')).toBe(true)
  })

  it('isCompatible returns true for same type', () => {
    expect(isCompatible('sheet', 'sheet')).toBe(true)
  })

  it('isCompatible returns false for unrelated types', () => {
    expect(isCompatible('sheet', 'file')).toBe(false)
  })

  it('throws when registering same type twice', () => {
    expect(() =>
      portTypeRegistry.register({
        type: 'sheet',
        label: 'Sheet',
        validator: () => true,
        Previewer: () => null,
      })
    ).toThrow(/already registered/i)
  })
})
