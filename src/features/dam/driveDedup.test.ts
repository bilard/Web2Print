import { describe, it, expect } from 'vitest'
import { planDedup } from './driveDedup'

describe('planDedup', () => {
  it('garde le plus ancien de chaque groupe md5, retire les autres', () => {
    const plan = planDedup([
      { id: 'A', name: 'orig.png', md5Checksum: 'h1', createdTime: '2026-06-28T10:00:00Z' },
      { id: 'B', name: 'copie.png', md5Checksum: 'h1', createdTime: '2026-06-28T12:00:00Z' },
      { id: 'C', name: 'autre.png', md5Checksum: 'h2', createdTime: '2026-06-28T09:00:00Z' },
    ])
    expect(plan.groups).toHaveLength(1)
    expect(plan.groups[0].keep.id).toBe('A')
    expect(plan.removeIds).toEqual(['B'])
    expect(plan.duplicates).toBe(1)
    expect(plan.scanned).toBe(3)
    expect(plan.hashed).toBe(3)
  })

  it('ignore les fichiers sans md5 et les groupes uniques', () => {
    const plan = planDedup([
      { id: 'A', name: 'doc', /* pas de md5 (Google natif) */ createdTime: '2026-06-28T10:00:00Z' },
      { id: 'B', name: 'seul.png', md5Checksum: 'x', createdTime: '2026-06-28T10:00:00Z' },
    ])
    expect(plan.groups).toHaveLength(0)
    expect(plan.removeIds).toHaveLength(0)
    expect(plan.hashed).toBe(1)
  })

  it('retire N-1 fichiers pour un groupe de N identiques', () => {
    const files = ['A', 'B', 'C', 'D'].map((id, i) => ({
      id, name: `${id}.png`, md5Checksum: 'same', createdTime: `2026-06-28T1${i}:00:00Z`,
    }))
    const plan = planDedup(files)
    expect(plan.groups[0].keep.id).toBe('A')
    expect(plan.removeIds.sort()).toEqual(['B', 'C', 'D'])
  })
})
