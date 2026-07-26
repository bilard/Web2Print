import { useEffect, useMemo, useRef, useState } from 'react'
import { Minus, Plus, RotateCcw } from 'lucide-react'
import { cityCounts, type AnalyticsEvent } from '../metrics'
import { useCityCoords } from '../useCityCoords'
import { useMapViewport } from '../useMapViewport'
import { BOUNDS, GRATICULE, buildDots, countryBox, type Dot } from './worldDots'
import world from './worldPath.json'

const ACCENT = '#6366f1'
const BTN = 'p-1 rounded bg-surface-2 border border-white/10 text-white/60 hover:text-white transition-colors'

interface Props {
  events: AnalyticsEvent[]
  /** Pays sélectionné depuis la carte « Pays » : villes mises en évidence + cadrage. */
  selectedCountry?: string | null
  onSelectCountry?: (country: string | null) => void
}

/** Carte du monde des connexions : un point par ville (aire ∝ connexions), zoom + lien listes→carte. */
export function AnalyticsWorldMap({ events, selectedCountry = null, onSelectCountry }: Props) {
  const cities = useMemo(() => cityCounts(events), [events])
  const { coords, pending } = useCityCoords(cities)
  const [hover, setHover] = useState<Dot | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const { svgRef, vb, scale, zoomed, zoomIn, zoomOut, reset, focus, fitTo, didPan, pointerHandlers } = useMapViewport(BOUNDS)
  const dots = useMemo(() => buildDots(cities, coords), [cities, coords])

  // Clic pays (liste « Pays ») → cadrage sur ses villes + défilement de la carte en vue.
  // `fitted` évite de re-cadrer à chaque géocodage tant que la sélection n'a pas changé.
  const containerRef = useRef<HTMLDivElement | null>(null)
  const fitted = useRef<string | null>(null)
  useEffect(() => {
    if (!selectedCountry) { fitted.current = null; return }
    if (fitted.current === selectedCountry) return
    const box = countryBox(dots, selectedCountry)
    if (!box) return // villes pas encore géocodées (ou aucune) : on retentera quand dots change
    fitted.current = selectedCountry
    setSelected(null)
    fitTo(box)
    containerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }, [selectedCountry, dots, fitTo])

  const inCountry = (d: Dot): boolean => selectedCountry != null && d.country === selectedCountry
  const locatedCount = dots.reduce((n, d) => n + d.count, 0)
  const unlocated = events.length - locatedCount
  const countryEmpty = selectedCountry != null && !pending && countryBox(dots, selectedCountry) === null

  return (
    <div ref={containerRef} className="bg-surface rounded-lg p-4">
      <div className="text-white/70 text-sm font-medium mb-3">
        Connexions dans le monde
        <span className="text-white/35 font-normal ml-2">
          {locatedCount.toLocaleString('fr-FR')} connexions localisées
          {unlocated > 0 && ` · ${unlocated.toLocaleString('fr-FR')} non localisées`}
          {countryEmpty && ` · aucune ville localisée pour ${selectedCountry}`}
        </span>
      </div>

      <div className="relative">
        <svg
          ref={svgRef}
          viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`}
          className={`w-full touch-none ${zoomed ? 'cursor-grab active:cursor-grabbing' : ''}`}
          role="img"
          aria-label="Carte du monde des connexions par ville"
          onClick={() => {
            // Clic sur le fond (pas un pan, pas un point) → tout désélectionner.
            if (didPan()) return
            setSelected(null)
            onSelectCountry?.(null)
          }}
          {...pointerHandlers}
        >
          <path d={GRATICULE} fill="none" className="stroke-white/[0.05]" strokeWidth={1} vectorEffect="non-scaling-stroke" />
          {/* Le contour du land trace côtes ET frontières (arêtes partagées 2× = un peu plus marquées). */}
          <path d={world.land} className="fill-white/10 stroke-white/20" strokeWidth={0.75} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
          {dots.map((d) => (
            // Taille à l'écran constante quel que soit le zoom (rayons divisés par l'échelle).
            <g key={d.label}>
              {(selected === d.label || inCountry(d)) && (
                <circle cx={d.x} cy={d.y} r={(d.r + 4) / scale} fill="none" stroke={ACCENT} strokeWidth={1.5 / scale} strokeOpacity={0.9} />
              )}
              <circle
                cx={d.x} cy={d.y} r={d.r / scale} fill={ACCENT}
                fillOpacity={selectedCountry != null && !inCountry(d) ? 0.25 : 0.85}
                className="stroke-surface" strokeWidth={1.5 / scale}
              />
              {/* Cible de survol plus large que le point. */}
              <circle
                cx={d.x} cy={d.y} r={(d.r + 6) / scale} fill="transparent"
                onMouseEnter={() => setHover(d)}
                onMouseLeave={() => setHover(null)}
                onClick={(e) => {
                  e.stopPropagation()
                  onSelectCountry?.(null)
                  setSelected(d.label)
                }}
              />
            </g>
          ))}
        </svg>
        <div className="absolute top-2 right-2 flex flex-col gap-1">
          <button type="button" onClick={zoomIn} aria-label="Zoomer" title="Zoomer (Ctrl/Cmd + molette, ou double-clic)" className={BTN}><Plus className="w-3.5 h-3.5" /></button>
          <button type="button" onClick={zoomOut} aria-label="Dézoomer" title="Dézoomer" className={BTN}><Minus className="w-3.5 h-3.5" /></button>
          {zoomed && (
            <button
              type="button" onClick={() => { reset(); setSelected(null); onSelectCountry?.(null) }}
              aria-label="Réinitialiser le zoom" title="Vue monde" className={BTN}
            ><RotateCcw className="w-3.5 h-3.5" /></button>
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
              onClick={() => { onSelectCountry?.(null); setSelected(d.label); focus(d.x, d.y) }}
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
