import { describe, it, expect } from 'vitest'
import { getTemplate, listTemplates, pickTemplateByAspect } from '../index'

describe('template registry', () => {
  it('listTemplates returns portrait and landscape at minimum', () => {
    const templates = listTemplates()
    const ids = templates.map((t) => t.id)
    expect(ids).toContain('retail-product-portrait')
    expect(ids).toContain('retail-product-landscape')
  })

  it('getTemplate returns template for valid id', () => {
    const t = getTemplate('retail-product-portrait')
    expect(t).not.toBeNull()
    expect(t!.id).toBe('retail-product-portrait')
    expect(t!.slots.title).toBeDefined()
  })

  it('getTemplate returns null for unknown id', () => {
    expect(getTemplate('nonexistent')).toBeNull()
  })

  it('pickTemplateByAspect returns portrait for tall canvas', () => {
    const t = pickTemplateByAspect(100, 150)
    expect(t.aspectRatio).toBe('portrait')
  })

  it('pickTemplateByAspect returns landscape for wide canvas', () => {
    const t = pickTemplateByAspect(200, 100)
    expect(t.aspectRatio).toBe('landscape')
  })
})
