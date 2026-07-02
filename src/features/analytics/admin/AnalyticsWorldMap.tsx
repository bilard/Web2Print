// src/features/analytics/admin/AnalyticsWorldMap.tsx
import { useMemo, useState } from 'react'
import { Minus, Plus, RotateCcw } from 'lucide-react'
import { cityCounts, type AnalyticsEvent } from '../metrics'
import { useCityCoords } from '../useCityCoords'
import { useMapViewport } from '../useMapViewport'
import world from './worldPath.json'

// Cadre vertical utile du fond de carte (l'Antarctique est exclue du chemin généré).
const BOUNDS = { x: 0, y: 12, w: world.width, h: 314 }
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

// Graticule discret (méridiens/parallèles tous les 30°), borné au cadre visible.
const GRATICULE = [
  ...[-150, -120, -90, -60, -30, 0, 30, 60, 90, 120, 150].map((lon) => `M${px(lon)},${BOUNDS.y}V${BOUNDS.y + BOUNDS.h}`),
  ...[-30, 0, 30, 60].map((lat) => `M0,${py(lat)}H${world.width}`),
].join('')

const BTN = 'p-1 rounded bg-surface-2 border border-white/10 text-white/60 hover:text-white transition-colors'

/** Carte du monde des connexions : un point par ville (aire ∝ connexions), zoom + lien liste→carte. */
export function AnalyticsWorldMap({ events }: { events: AnalyticsEvent[] }) {
  const cities = useMemo(() => cityCounts(events), [events])
  const { coords, pending } = useCityCoords(cities)
  const [hover, setHover] = useState<Dot | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const { svgRef, vb, scale, zoomed, zoomIn, zoomOut, reset, focus, pointerHandlers } = useMapViewport(BOUNDS)

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
          {unlocated > 0 && ` · ${unlocated.toLocaleString('fr-FR')} non localisées`}
        </span>
      </div>

      <div className="relative">
        <svg
          ref={svgRef}
          viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`}
          className={`w-full touch-none ${zoomed ? 'cursor-grab active:cursor-grabbing' : ''}`}
          role="img"
          aria-label="Carte du monde des connexions par ville"
          {...pointerHandlers}
        >
          <path d={GRATICULE} fill="none" className="stroke-white/[0.05]" strokeWidth={1} vectorEffect="non-scaling-stroke" />
          {/* Le contour du land trace côtes ET frontières (arêtes partagées 2× = un peu plus marquées). */}
          <path d={world.land} className="fill-white/10 stroke-white/20" strokeWidth={0.75} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
          {dots.map((d) => (
            // Taille à l'écran constante quel que soit le zoom (rayons divisés par l'échelle).
            <g key={d.label}>
              {selected === d.label && (
                <circle cx={d.x} cy={d.y} r={(d.r + 4) / scale} fill="none" stroke={ACCENT} strokeWidth={1.5 / scale} strokeOpacity={0.9} />
              )}
              <circle cx={d.x} cy={d.y} r={d.r / scale} fill={ACCENT} fillOpacity={0.85} className="stroke-surface" strokeWidth={1.5 / scale} />
              {/* Cible de survol plus large que le point. */}
              <circle
                cx={d.x} cy={d.y} r={(d.r + 6) / scale} fill="transparent"
                onMouseEnter={() => setHover(d)}
                onMouseLeave={() => setHover(null)}
              />
            </g>
          ))}
        </svg>
        <div className="absolute top-2 right-2 flex flex-col gap-1">
          <button type="button" onClick={zoomIn} aria-label="Zoomer" title="Zoomer (Ctrl/Cmd + molette, ou double-clic)" className={BTN}><Plus className="w-3.5 h-3.5" /></button>
          <button type="button" onClick={zoomOut} aria-label="Dézoomer" title="Dézoomer" className={BTN}><Minus className="w-3.5 h-3.5" /></button>
          {zoomed && (
            <button type="button" onClick={() => { reset(); setSelected(null) }} aria-label="Réinitialiser le zoom" title="Vue monde" className={BTN}><RotateCcw className="w-3.5 h-3.5" /></button>
          )}
        </div>
        {hover && (
          <div
            className="absolute pointer-events-none bg-surface-2 border border-white/10 rounded px-2 py-1 text-xs whitespace-nowrap -translate-x-1/2 -translate-y-full shadow-lg"
            style={{ left: `${((hover.x - vb.x) / vb.w) * 100}%`, top: `${((hover.y - hover.r / scale - vb.y) / vb.h) * 100 - 2}%` }}
          >
            <span className="text-white/80">{hover.label}</span>
            <span className="text-white/50 ml-2">{hover.count.toLocaleString('fr-FR')} connexion{hover.count > 1 ? 's' : ''}</span>
          </div>
        )}
      </div>

      {dots.length > 0 && (
        <div className="flex flex-wrap gap-x-3 gap-y-1 mt-3">
          {dots.slice(0, 6).map((d) => (
            <button
              key={d.label}
              type="button"
              onClick={() => { setSelected(d.label); focus(d.x, d.y) }}
              title="Voir sur la carte"
              className={`text-xs rounded px-1.5 py-0.5 transition-colors hover:bg-white/10 ${selected === d.label ? 'bg-white/10' : ''}`}
            >
              <span className="inline-block w-2 h-2 rounded-full mr-1.5 align-baseline" style={{ background: ACCENT }} />
              <span className="text-white/70">{d.label}</span>
              <span className="text-white/45 ml-1.5">{d.count.toLocaleString('fr-FR')}</span>
            </button>
          ))}
        </div>
      )}
      {dots.length === 0 && (
        <div className="text-white/35 text-xs">
          {cities.length > 0 && pending
            ? 'Localisation des villes en cours…'
            : 'Aucune connexion localisée sur cette période.'}
        </div>
      )}
    </div>
  )
}
