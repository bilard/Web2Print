import { describe, it, expect } from 'vitest'
import { Group, Textbox, Rect } from 'fabric'
import { collectObjectsDeep } from './deepObjects'

describe('collectObjectsDeep', () => {
  it('aplatit les Groups imbriqués — les Textbox {{…}} dans un bloc sont vus', () => {
    const field = new Textbox('{{brands}}', { width: 100 })
    const inner = new Group([field, new Rect({ width: 10, height: 10 })])
    const top = new Textbox('{{Libelle Article}}', { width: 100 })
    const all = collectObjectsDeep([top, inner])
    expect(all).toContain(top)
    expect(all).toContain(inner)
    expect(all).toContain(field)
    expect(all.filter((o) => o instanceof Textbox)).toHaveLength(2)
  })
})
