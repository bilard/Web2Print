// src/features/analytics/admin/AnalyticsWorldMap.tsx
import { useMemo, useState } from 'react'
import { cityCounts, type AnalyticsEvent } from '../metrics'
import { useCityCoords } from '../useCityCoords'
import world from './worldPath.json'

// Cadre vertical utile du fond de carte (l'Antarctique est exclue du chemin généré).
const VIEW_Y = 12
const VIEW_H = 314
const ACCENT = '#6366f1'

interface Dot {
  x: number
  y: number
  r: number
  label: string
  count: number
}

/** Projection équirectangulaire — même transformée que le fond généré (cf. worldPath.json). */
const px = (lon: number): number => ((lon + 180) / 360) * world.width
const py = (lat: number): number => ((90 - lat) / 180) * world.height

/** Carte du monde des connexions : un point par ville, aire ∝ nombre de connexions. */
export function AnalyticsWorldMap({ events }: { events: AnalyticsEvent[] }) {
  const cities = useMemo(() => cityCounts(events), [events])
  const coords = useCityCoords(cities)
  const [hover, setHover] = useState<Dot | null>(null)

  // Gros points dessinés d'abord pour que les petits restent survolables par-dessus.
  const dots = useMemo(() => {
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
        count: c.count,
      }))
      .sort((a, b) => b.count - a.count)
  }, [cities, coords])

  const locatedCount = dots.reduce((n, d) => n + d.count, 0)
  const unlocated = events.length - locatedCount

  return (
    <div className="bg-surface rounded-lg p-4">
      <div className="text-white/70 text-sm font-medium mb-3">
        Connexions dans le monde
        <span className="text-white/35 font-normal ml-2">
          {locatedCount.toLocaleString('fr-FR')} connexions localisées
          {unlocated > 0 && ` · ${unlocated.toLocaleString('fr-FR')} sans ville`}
        </span>
      </div>

      <div className="relative">
        <svg viewBox={`0 ${VIEW_Y} ${world.width} ${VIEW_H}`} className="w-full" role="img" aria-label="Carte du monde des connexions par ville">
          <path d={world.path} className="fill-white/10" />
          {dots.map((d) => (
            <g key={d.label}>
              <circle cx={d.x} cy={d.y} r={d.r} fill={ACCENT} fillOpacity={0.85} className="stroke-surface" strokeWidth={1.5} />
              {/* Cible de survol plus large que le point. */}
              <circle
                cx={d.x} cy={d.y} r={d.r + 6} fill="transparent"
                onMouseEnter={() => setHover(d)}
                onMouseLeave={() => setHover(null)}
              />
            </g>
          ))}
        </svg>
        {hover && (
          <div
            className="absolute pointer-events-none bg-surface-2 border border-white/10 rounded px-2 py-1 text-xs whitespace-nowrap -translate-x-1/2 -translate-y-full shadow-lg"
            style={{ left: `${(hover.x / world.width) * 100}%`, top: `${((hover.y - hover.r - VIEW_Y - 4) / VIEW_H) * 100}%` }}
          >
            <span className="text-white/80">{hover.label}</span>
            <span className="text-white/50 ml-2">{hover.count.toLocaleString('fr-FR')} connexion{hover.count > 1 ? 's' : ''}</span>
          </div>
        )}
      </div>

      {dots.length > 0 && (
        <div className="flex flex-wrap gap-x-4 gap-y-1 mt-3">
          {dots.slice(0, 6).map((d) => (
            <span key={d.label} className="text-xs">
              <span className="inline-block w-2 h-2 rounded-full mr-1.5 align-baseline" style={{ background: ACCENT }} />
              <span className="text-white/70">{d.label}</span>
              <span className="text-white/45 ml-1.5">{d.count.toLocaleString('fr-FR')}</span>
            </span>
          ))}
        </div>
      )}
      {dots.length === 0 && (
        <div className="text-white/35 text-xs">
          {cities.length === 0 ? 'Aucune connexion localisée sur cette période.' : 'Localisation des villes en cours…'}
        </div>
      )}
    </div>
  )
}
