import { describe, it, expect } from 'vitest'
import { interpolate } from './interpolate'

describe('interpolate', () => {
  it('replaces {{item.X}} in strings', () => {
    expect(interpolate('Hi {{item.name}}!', { item: { name: 'Alice' } })).toBe('Hi Alice!')
  })

  it('keeps unresolved tokens for missing path (visible debug)', () => {
    expect(interpolate('value: {{item.missing}}', { item: { name: 'A' } })).toBe('value: {{item.missing}}')
  })

  it('returns empty string for explicit null', () => {
    expect(interpolate('value: {{x}}', { x: null })).toBe('value: ')
  })

  it('walks nested objects', () => {
    const config = {
      to: '{{item.email}}',
      meta: { id: '#{{item.id}}', tags: ['{{item.tag}}'] },
      keep: 42,
    }
    const out = interpolate(config, { item: { email: 'a@b.com', id: 1, tag: 'vip' } })
    expect(out).toEqual({
      to: 'a@b.com',
      meta: { id: '#1', tags: ['vip'] },
      keep: 42,
    })
  })

  it('leaves non-string scalars untouched', () => {
    expect(interpolate(42, { item: {} })).toBe(42)
    expect(interpolate(true, { item: {} })).toBe(true)
    expect(interpolate(null, { item: {} })).toBe(null)
  })

  it('JSON-stringifies object values inside string templates', () => {
    expect(interpolate('user={{item}}', { item: { id: 1 } })).toBe('user={"id":1}')
  })

  it('handles whitespace inside tokens', () => {
    expect(interpolate('{{ item.name }}', { item: { name: 'Bob' } })).toBe('Bob')
  })
})
