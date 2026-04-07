import { describe, it, expect } from 'vitest'
import { extractBranding, sanitizeHex } from './branding'
import type { Brief } from '@/features/briefs/types'

const briefBase = {
  id: 'b',
  taxonomyId: 't',
  ownerId: 'u',
  clientName: 'Acme',
  status: 'deck_ready',
  currentStep: 5,
  client: {
    formTemplateSnapshot: [],
    values: {},
  },
} as unknown as Brief

describe('sanitizeHex', () => {
  it('strips a leading hash', () => {
    expect(sanitizeHex('#FF6600')).toBe('FF6600')
  })
  it('uppercases the result', () => {
    expect(sanitizeHex('#ff6600')).toBe('FF6600')
  })
  it('expands a 3-digit shorthand', () => {
    expect(sanitizeHex('#f60')).toBe('FF6600')
  })
  it('returns the fallback for invalid input', () => {
    expect(sanitizeHex('not a color', '6366F1')).toBe('6366F1')
    expect(sanitizeHex(undefined, '6366F1')).toBe('6366F1')
    expect(sanitizeHex('', '6366F1')).toBe('6366F1')
  })
})

describe('extractBranding', () => {
  it('reads values from brief.client.values', () => {
    const brief = {
      ...briefBase,
      client: {
        formTemplateSnapshot: [],
        values: {
          companyName: 'Acme Corp',
          logoUrl: 'https://x/logo.png',
          primaryColor: '#FF6600',
          secondaryColor: '#003366',
        },
      },
    } as Brief
    expect(extractBranding(brief)).toEqual({
      companyName: 'Acme Corp',
      logoUrl: 'https://x/logo.png',
      primaryColor: 'FF6600',
      secondaryColor: '003366',
    })
  })

  it('falls back to brief.clientName when companyName is missing', () => {
    expect(extractBranding(briefBase).companyName).toBe('Acme')
  })

  it('falls back to indigo when colors are missing', () => {
    const b = extractBranding(briefBase)
    expect(b.primaryColor).toBe('6366F1')
    expect(b.secondaryColor).toBe('4F46E5')
  })
})
