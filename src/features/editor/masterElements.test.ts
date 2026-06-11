// src/features/editor/masterElements.test.ts
import { describe, it, expect } from 'vitest'
import { upsertMasterObject, removeMasterObject } from './masterElements'

const page = (objects: unknown[]) => JSON.stringify({ version: '6', background: '#fff', objects })

describe('upsertMasterObject', () => {
  it('ajoute l’objet maître en préservant le reste du JSON', () => {
    const src = page([{ type: 'rect', data: { id: 'a' } }])
    const out = upsertMasterObject(src, 'm1', { type: 'textbox', data: { id: 'm1', masterId: 'm1' } })!
    const json = JSON.parse(out)
    expect(json.objects).toHaveLength(2)
    expect(json.background).toBe('#fff')
    expect(json.objects[1].data.masterId).toBe('m1')
  })

  it('remplace une copie existante du même masterId (pas de doublon)', () => {
    const src = page([
      { type: 'textbox', text: 'ancien', data: { masterId: 'm1' } },
      { type: 'rect', data: { id: 'a' } },
    ])
    const out = upsertMasterObject(src, 'm1', { type: 'textbox', text: 'nouveau', data: { masterId: 'm1' } })!
    const json = JSON.parse(out)
    expect(json.objects).toHaveLength(2)
    expect(json.objects.filter((o: { data?: { masterId?: string } }) => o.data?.masterId === 'm1')).toHaveLength(1)
    expect(json.objects[1].text).toBe('nouveau')
  })

  it('retourne null sur JSON illisible', () => {
    expect(upsertMasterObject('{pas du json', 'm1', {})).toBeNull()
  })
})

describe('removeMasterObject', () => {
  it('retire uniquement les copies du masterId', () => {
    const src = page([
      { type: 'textbox', data: { masterId: 'm1' } },
      { type: 'rect', data: { id: 'a' } },
    ])
    const json = JSON.parse(removeMasterObject(src, 'm1')!)
    expect(json.objects).toHaveLength(1)
    expect(json.objects[0].type).toBe('rect')
  })
})
