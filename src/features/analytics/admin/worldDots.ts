// src/features/analytics/admin/worldDots.ts
// Projection + construction des points de la carte du monde (pur, testable).
import type { CityCount } from '../metrics'
import type { CityCoords } from '../useCityCoords'
import type { MapBox } from '../useMapViewport'
import world from './worldPath.json'

export interface Dot {
  x: number
  y: number
  r: number
  label: string
  country: string | null
  count: number
}

// Cadre vertical utile du fond de carte (l'Antarctique est exclue du chemin généré).
export const BOUNDS: MapBox = { x: 0, y: 12, w: world.width, h: 314 }

/** Projection équirectangulaire — même transformée que le fond généré (cf. worldPath.json). */
export const px = (lon: number): number => ((lon + 180) / 360) * world.width
export const py = (lat: number): number => ((90 - lat) / 180) * world.height

// Graticule discret (méridiens/parallèles tous les 30°), borné au cadre visible.
export const GRATICULE = [
  ...[-150, -120, -90, -60, -30, 0, 30, 60, 90, 120, 150].map((lon) => `M${px(lon)},${BOUNDS.y}V${BOUNDS.y + BOUNDS.h}`),
  ...[-30, 0, 30, 60].map((lat) => `M0,${py(lat)}H${world.width}`),
].join('')

/** Villes → points écran (aire ∝ connexions), gros points d'abord pour laisser les petits survolables. */
export function buildDots(cities: CityCount[], coords: Map<string, CityCoords>): Dot[] {
  const located = cities.flatMap((c) => {
    const at = coords.get(`${c.city}|${c.country ?? ''}`)
    return at ? [{ ...c, ...at }] : []
  })
  const max = located.reduce((m, c) => Math.max(m, c.count), 1)
  return located
    .map((c): Dot => ({
      x: px(c.lon),
      y: py(c.lat),
      r: 3 + 9 * Math.sqrt(c.count / max),
      label: c.country ? `${c.city}, ${c.country}` : c.city,
      country: c.country,
      count: c.count,
    }))
    .sort((a, b) => b.count - a.count)
}

/** Boîte englobante des villes d'un pays (null si aucune n'est localisée). */
export function countryBox(dots: Dot[], country: string): MapBox | null {
  const pts = dots.filter((d) => d.country === country)
  if (pts.length === 0) return null
  const xs = pts.map((d) => d.x)
  const ys = pts.map((d) => d.y)
  const x = Math.min(...xs)
  const y = Math.min(...ys)
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y }
}
