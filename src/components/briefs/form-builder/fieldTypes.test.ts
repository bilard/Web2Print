import { describe, it, expect } from 'vitest'
import { FIELD_TYPE_REGISTRY, createEmptyField, ALL_FIELD_TYPES } from './fieldTypes'

describe('FIELD_TYPE_REGISTRY', () => {
  it('covers all 10 ClientFormFieldType values', () => {
    expect(ALL_FIELD_TYPES).toHaveLength(10)
    expect(ALL_FIELD_TYPES).toEqual(
      expect.arrayContaining([
        'text', 'textarea', 'number', 'email', 'select',
        'color', 'logo_upload', 'budget_range', 'address', 'brand_kit_upload',
      ]),
    )
  })

  it('provides a label for every type', () => {
    for (const t of ALL_FIELD_TYPES) {
      expect(FIELD_TYPE_REGISTRY[t].label).toBeTruthy()
    }
  })
})

describe('createEmptyField', () => {
  it('creates a text field with builtin=false and a unique id', () => {
    const a = createEmptyField('text', 100)
    const b = createEmptyField('text', 100)
    expect(a.type).toBe('text')
    expect(a.builtin).toBe(false)
    expect(a.required).toBe(false)
    expect(a.order).toBe(100)
    expect(a.id).not.toBe(b.id)
  })

  it('creates a select field with a default option', () => {
    const f = createEmptyField('select', 0)
    expect(f.type).toBe('select')
    expect(f.options).toBeDefined()
    expect(f.options!.length).toBeGreaterThan(0)
  })

  it('assigns a human label derived from the type', () => {
    const f = createEmptyField('email', 0)
    expect(f.label.length).toBeGreaterThan(0)
  })

  it('generates unique keys per call', () => {
    const a = createEmptyField('text', 0)
    const b = createEmptyField('text', 0)
    expect(a.key).not.toBe(b.key)
  })
})
