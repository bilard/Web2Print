import { describe, it, expect } from 'vitest'
import { createDefaultFormTemplate } from './defaults'

describe('createDefaultFormTemplate', () => {
  it('returns the 12 builtin fields', () => {
    const fields = createDefaultFormTemplate()
    expect(fields).toHaveLength(12)
  })

  it('marks all default fields as builtin', () => {
    const fields = createDefaultFormTemplate()
    expect(fields.every((f) => f.builtin === true)).toBe(true)
  })

  it('makes companyName and contextSummary required', () => {
    const fields = createDefaultFormTemplate()
    const required = fields.filter((f) => f.required).map((f) => f.key)
    expect(required).toEqual(['companyName', 'contextSummary'])
  })

  it('assigns unique stable ids', () => {
    const fields = createDefaultFormTemplate()
    const ids = fields.map((f) => f.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('orders fields with strictly increasing order values', () => {
    const fields = createDefaultFormTemplate()
    for (let i = 1; i < fields.length; i++) {
      expect(fields[i].order).toBeGreaterThan(fields[i - 1].order)
    }
  })

  it('groups fields into Société, Identité visuelle, Livraison, Contexte', () => {
    const fields = createDefaultFormTemplate()
    const groups = new Set(fields.map((f) => f.group))
    expect(groups).toEqual(
      new Set(['Société', 'Identité visuelle', 'Livraison', 'Contexte']),
    )
  })

  it('includes the SIRET and shippingAddress fields', () => {
    const keys = createDefaultFormTemplate().map((f) => f.key)
    expect(keys).toContain('siret')
    expect(keys).toContain('shippingAddress')
  })

  it('uses logo_upload type for logoUrl and color type for the two color fields', () => {
    const fields = createDefaultFormTemplate()
    expect(fields.find((f) => f.key === 'logoUrl')?.type).toBe('logo_upload')
    expect(fields.find((f) => f.key === 'primaryColor')?.type).toBe('color')
    expect(fields.find((f) => f.key === 'secondaryColor')?.type).toBe('color')
  })

  it('uses budget_range type for budget', () => {
    const fields = createDefaultFormTemplate()
    expect(fields.find((f) => f.key === 'budget')?.type).toBe('budget_range')
  })

  it('returns a fresh array each call (no shared mutation)', () => {
    const a = createDefaultFormTemplate()
    const b = createDefaultFormTemplate()
    expect(a).not.toBe(b)
    a[0].label = 'mutated'
    expect(b[0].label).not.toBe('mutated')
  })
})
