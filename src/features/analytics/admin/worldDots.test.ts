// src/features/analytics/admin/worldDots.test.ts
import { describe, expect, it } from 'vitest'
import { buildDots, countryBox } from './worldDots'
import type { CityCount } from '../metrics'
import type { CityCoords } from '../useCityCoords'

const coords = new Map<string, CityCoords>([
  ['Paris|FR', { lat: 48.85, lon: 2.35 }],
  ['Lille|FR', { lat: 50.63, lon: 3.06 }],
  ['Bruxelles|BE', { lat: 50.85, lon: 4.35 }],
])

const cities: CityCount[] = [
  { city: 'Paris', country: 'FR', count: 10 },
  { city: 'Lille', country: 'FR', count: 5 },
  { city: 'Bruxelles', country: 'BE', count: 2 },
  { city: 'Introuvable', country: 'XX', count: 1 },
]

describe('buildDots', () => {
  it('ignore les villes non géocodées et trie par volume décroissant', () => {
    const dots = buildDots(cities, coords)
    expect(dots.map((d) => d.label)).toEqual(['Paris, FR', 'Lille, FR', 'Bruxelles, BE'])
    expect(dots[0].country).toBe('FR')
  })
})

describe('countryBox', () => {
  it('englobe toutes les villes du pays', () => {
    const dots = buildDots(cities, coords)
    const box = countryBox(dots, 'FR')
    expect(box).not.toBeNull()
    for (const d of dots.filter((d) => d.country === 'FR')) {
      expect(d.x).toBeGreaterThanOrEqual(box!.x)
      expect(d.x).toBeLessThanOrEqual(box!.x + box!.w)
      expect(d.y).toBeGreaterThanOrEqual(box!.y)
      expect(d.y).toBeLessThanOrEqual(box!.y + box!.h)
    }
  })

  it('renvoie null si aucune ville localisée pour ce pays', () => {
    expect(countryBox(buildDots(cities, coords), 'XX')).toBeNull()
  })
})
