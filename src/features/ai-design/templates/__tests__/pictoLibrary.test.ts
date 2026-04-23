import { describe, it, expect } from 'vitest'
import { resolvePicto, listPictoKeys } from '../pictoLibrary'

describe('pictoLibrary', () => {
  it('resolves exact key', () => {
    expect(resolvePicto('zap')).not.toBeNull()
    expect(resolvePicto('zap')!.content).toContain('<path')
  })

  it('resolves alias', () => {
    expect(resolvePicto('puissance')).not.toBeNull()
    expect(resolvePicto('eclair')).toEqual(resolvePicto('zap'))
  })

  it('is case-insensitive', () => {
    expect(resolvePicto('ZAP')).toEqual(resolvePicto('zap'))
    expect(resolvePicto('  Power  ')).toEqual(resolvePicto('zap'))
  })

  it('returns null for unknown key', () => {
    expect(resolvePicto('nonexistent-xyz')).toBeNull()
    expect(resolvePicto(undefined)).toBeNull()
    expect(resolvePicto('')).toBeNull()
  })

  it('listPictoKeys returns at least 10 keys', () => {
    expect(listPictoKeys().length).toBeGreaterThanOrEqual(10)
  })
})
