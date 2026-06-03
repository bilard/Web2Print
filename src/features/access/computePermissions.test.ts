// src/features/access/computePermissions.test.ts
import { describe, it, expect } from 'vitest'
import { computeEffectivePermissions, isPending } from './computePermissions'
import { ADMIN_PERMISSION, ALL_PERMISSION_KEYS } from './permissions'

describe('computeEffectivePermissions', () => {
  it('owner → toutes les permissions + admin', () => {
    const set = computeEffectivePermissions({ isOwner: true, rolePermissions: null, grants: [], revokes: [] })
    expect(set.has(ADMIN_PERMISSION)).toBe(true)
    for (const k of ALL_PERMISSION_KEYS) expect(set.has(k)).toBe(true)
  })

  it('rôle ∪ grants − revokes', () => {
    const set = computeEffectivePermissions({
      isOwner: false,
      rolePermissions: ['pim.view', 'pim.edit'],
      grants: ['dam.view'],
      revokes: ['pim.edit'],
    })
    expect([...set].sort()).toEqual(['dam.view', 'pim.view'])
  })

  it('rôle null + non-owner → vide', () => {
    const set = computeEffectivePermissions({ isOwner: false, rolePermissions: null, grants: [], revokes: [] })
    expect(set.size).toBe(0)
  })
})

describe('isPending', () => {
  it('non-owner sans rôle → pending', () => {
    expect(isPending({ isOwner: false, accessRoleId: null })).toBe(true)
  })
  it('non-owner avec rôle → non pending', () => {
    expect(isPending({ isOwner: false, accessRoleId: 'r1' })).toBe(false)
  })
  it('owner → jamais pending', () => {
    expect(isPending({ isOwner: true, accessRoleId: null })).toBe(false)
  })
})
