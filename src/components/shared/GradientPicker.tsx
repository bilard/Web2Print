import { useState, useRef, useCallback } from 'react'
import { Plus } from 'lucide-react'
import { Gradient } from 'fabric'
import type { GradientConfig, GradientStop } from '@/stores/editor.store'
import { usePaletteStore, savePaletteToFirestore } from '@/stores/palette.store'

// ── Helpers ─────────────────────────────────────────────────────────────────

export function gradientToCss(g: GradientConfig): string {
  const stops = g.stops.map(s => `${s.color} ${Math.round(s.offset * 100)}%`).join(', ')
  if (g.type === 'radial') return `radial-gradient(circle, ${stops})`
  return `linear-gradient(${g.angle}deg, ${stops})`
}

export function gradientToFabric(g: GradientConfig, width: number, height: number): InstanceType<typeof Gradient> {
  const colorStops = g.stops.map(s => ({ offset: s.offset, color: s.color }))

  if (g.type === 'radial') {
    return new Gradient({
      type: 'radial',
      coords: { x1: width / 2, y1: height / 2, x2: width / 2, y2: height / 2, r1: 0, r2: Math.max(width, height) / 2 },
      colorStops,
    })
  }

  const rad = (g.angle * Math.PI) / 180
  const cos = Math.cos(rad), sin = Math.sin(rad)
  return new Gradient({
    type: 'linear',
    coords: {
      x1: width / 2 - cos * width / 2,
      y1: height / 2 - sin * height / 2,
      x2: width / 2 + cos * width / 2,
      y2: height / 2 + sin * height / 2,
    },
    colorStops,
  })
}

export const DEFAULT_GRADIENT: GradientConfig = {
  type: 'linear',
  angle: 90,
  stops: [
    { offset: 0, color: '#6366f1' },
    { offset: 1, color: '#ec4899' },
  ],
}

const PRESETS: GradientConfig[] = [
  { type: 'linear', angle: 90, stops: [{ offset: 0, color: '#667eea' }, { offset: 1, color: '#764ba2' }] },
  { type: 'linear', angle: 135, stops: [{ offset: 0, color: '#f093fb' }, { offset: 1, color: '#f5576c' }] },
  { type: 'linear', angle: 90, stops: [{ offset: 0, color: '#4facfe' }, { offset: 1, color: '#00f2fe' }] },
  { type: 'linear', angle: 90, stops: [{ offset: 0, color: '#43e97b' }, { offset: 1, color: '#38f9d7' }] },
  { type: 'linear', angle: 90, stops: [{ offset: 0, color: '#fa709a' }, { offset: 1, color: '#fee140' }] },
  { type: 'linear', angle: 90, stops: [{ offset: 0, color: '#a18cd1' }, { offset: 1, color: '#fbc2eb' }] },
  { type: 'linear', angle: 90, stops: [{ offset: 0, color: '#ffecd2' }, { offset: 1, color: '#fcb69f' }] },
  { type: 'radial', angle: 0, stops: [{ offset: 0, color: '#ffffff' }, { offset: 1, color: '#000000' }] },
]

// ── Project Gradient Swatches ────────────────────────────────────────────

function ProjectGradientSwatches({ currentGradient, onChange }: { currentGradient: GradientConfig; onChange: (g: GradientConfig) => void }) {
  const { gradients, addGradient } = usePaletteStore()

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <p className="text-[9px] text-white/30 uppercase">Dégradés du projet</p>
        <button onClick={() => { addGradient(currentGradient); savePaletteToFirestore() }}
          title="Sauvegarder ce dégradé dans le projet"
          className="flex items-center gap-0.5 text-[9px] text-indigo-400/60 hover:text-indigo-400 transition-colors">
          <Plus className="w-2.5 h-2.5" /> Sauver
        </button>
      </div>
      {gradients.length > 0 ? (
        <div className="grid grid-cols-4 gap-1">
          {gradients.map((g) => (
            <button key={g.id} onClick={() => onChange(g.gradient)}
              className="h-6 rounded border border-white/10 hover:border-white/30 transition-colors"
              style={{ background: gradientToCss(g.gradient) }}
              title={g.name} />
          ))}
        </div>
      ) : (
        <p className="text-[9px] text-white/15 italic">Aucun dégradé sauvegardé</p>
      )}
    </div>
  )
}

// ── Component ───────────────────────────────────────────────────────────────

interface GradientPickerProps {
  value: GradientConfig
  onChange: (gradient: GradientConfig) => void
}

function AngleControl({ angle, onChange }: { angle: number; onChange: (a: number) => void }) {
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange

  return (
    <div className="flex items-center gap-2">
      <span className="text-[10px] text-white/30 w-10">Angle</span>
      <input type="range" min={0} max={360} value={angle}
        onChange={(e) => onChangeRef.current(Number(e.target.value))}
        className="flex-1 accent-indigo-500" />
      <input type="number" min={0} max={360} value={angle}
        onChange={(e) => onChangeRef.current(Math.max(0, Math.min(360, Number(e.target.value) || 0)))}
        className="w-12 bg-white/5 border border-white/10 rounded px-1 py-0.5 text-[10px] text-white text-center" />
      <span className="text-[10px] text-white/20">°</span>
    </div>
  )
}

export function GradientPicker({ value, onChange }: GradientPickerProps) {
  const [selectedStop, setSelectedStop] = useState(0)
  const [showPresets, setShowPresets] = useState(false)
  const barRef = useRef<HTMLDivElement>(null)
  const dragging = useRef(false)

  const updateStop = (index: number, patch: Partial<GradientStop>) => {
    const stops = value.stops.map((s, i) => i === index ? { ...s, ...patch } : s)
    onChange({ ...value, stops })
  }

  const removeStop = (index: number) => {
    if (value.stops.length <= 2) return
    const stops = value.stops.filter((_, i) => i !== index)
    setSelectedStop(Math.min(selectedStop, stops.length - 1))
    onChange({ ...value, stops })
  }

  // Use refs to avoid stale closures during drag
  const valueRef = useRef(value)
  valueRef.current = value
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange

  const handleBarClick = useCallback((e: React.MouseEvent) => {
    // Don't add stop if we just finished dragging
    if (dragging.current) return
    // Don't add if click target is a stop handle
    if ((e.target as HTMLElement).dataset.stopHandle) return
    if (!barRef.current) return
    const rect = barRef.current.getBoundingClientRect()
    const offset = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
    const newStop: GradientStop = { offset, color: '#ffffff' }
    const v = valueRef.current
    const stops = [...v.stops, newStop].sort((a, b) => a.offset - b.offset)
    setSelectedStop(stops.indexOf(newStop))
    onChangeRef.current({ ...v, stops })
  }, [])

  const startDrag = useCallback((index: number, e: React.MouseEvent) => {
    e.stopPropagation()
    e.preventDefault()
    setSelectedStop(index)
    dragging.current = true
    const onMove = (ev: MouseEvent) => {
      if (!barRef.current) return
      const rect = barRef.current.getBoundingClientRect()
      const offset = Math.max(0, Math.min(1, (ev.clientX - rect.left) / rect.width))
      const v = valueRef.current
      const stops = v.stops.map((s, i) => i === index ? { ...s, offset } : s)
      onChangeRef.current({ ...v, stops })
    }
    const onUp = () => {
      // Delay clearing dragging flag so handleBarClick can check it
      setTimeout(() => { dragging.current = false }, 50)
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }, [])

  const currentStop = value.stops[selectedStop]

  return (
    <div className="flex flex-col gap-2">
      {/* Type toggle */}
      <div className="flex gap-1">
        {(['linear', 'radial'] as const).map(t => (
          <button key={t} onClick={() => onChange({ ...value, type: t })}
            className={`flex-1 py-1 text-[10px] rounded border transition-colors ${value.type === t ? 'bg-indigo-500/20 border-indigo-500/50 text-indigo-400' : 'bg-white/5 border-white/10 text-white/40'}`}>
            {t === 'linear' ? 'Linéaire' : 'Radial'}
          </button>
        ))}
      </div>

      {/* Angle (linear only) */}
      {value.type === 'linear' && (
        <AngleControl angle={value.angle} onChange={(a) => onChange({ ...value, angle: a })} />
      )}

      {/* Gradient bar with stops */}
      <div className="relative pb-5">
        <div ref={barRef} className="h-6 rounded cursor-crosshair border border-white/10"
          style={{ background: gradientToCss({ ...value, type: 'linear', angle: 90 }) }}
          onClick={handleBarClick} />
        {value.stops.map((stop, i) => (
          <div key={i} data-stop-handle="true"
            className={`absolute w-4 h-4 rounded-full border-2 cursor-grab active:cursor-grabbing ${i === selectedStop ? 'border-indigo-400 ring-1 ring-indigo-400/50 z-10' : 'border-white/60 z-0'}`}
            style={{ left: `${stop.offset * 100}%`, bottom: 0, transform: 'translateX(-50%)', backgroundColor: stop.color }}
            onMouseDown={(e) => startDrag(i, e)} />
        ))}
      </div>

      {/* Selected stop controls */}
      {currentStop && (
        <div className="flex flex-col gap-1.5">
          <div className="flex gap-2 items-end">
            <div className="flex-1 flex flex-col gap-0.5">
              <span className="text-[9px] text-white/30">Couleur</span>
              <div className="flex items-center gap-1 bg-white/5 border border-white/10 rounded px-1.5 py-0.5">
                <input type="color" value={currentStop.color}
                  onChange={(e) => updateStop(selectedStop, { color: e.target.value })}
                  className="w-4 h-4 rounded cursor-pointer bg-transparent border-0 p-0" />
                <input type="text" value={currentStop.color}
                  onChange={(e) => updateStop(selectedStop, { color: e.target.value })}
                  className="flex-1 bg-transparent text-[10px] text-white font-mono" />
              </div>
            </div>
            <div className="w-16 flex flex-col gap-0.5">
              <span className="text-[9px] text-white/30">Position</span>
              <input type="number" min={0} max={100}
                value={Math.round(currentStop.offset * 100)}
                onChange={(e) => updateStop(selectedStop, { offset: Number(e.target.value) / 100 })}
                className="w-full bg-white/5 border border-white/10 rounded px-1.5 py-0.5 text-[10px] text-white text-center" />
            </div>
            {value.stops.length > 2 && (
              <button onClick={() => removeStop(selectedStop)}
                className="mb-0.5 px-2 py-1 text-[10px] bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 rounded text-red-400 transition-colors"
                title="Supprimer ce point">
                ✕
              </button>
            )}
          </div>
          <p className="text-[9px] text-white/20 italic">Clic sur la barre = ajouter un point</p>
        </div>
      )}

      {/* Project gradients */}
      <ProjectGradientSwatches currentGradient={value} onChange={onChange} />

      {/* Presets (repliables) */}
      <div>
        <button onClick={() => setShowPresets(v => !v)}
          className="flex items-center gap-1 text-[9px] text-white/30 uppercase hover:text-white/50 transition-colors">
          <span className={`transition-transform ${showPresets ? 'rotate-90' : ''}`}>▶</span>
          Présélections
        </button>
        {showPresets && (
          <div className="grid grid-cols-4 gap-1 mt-1">
            {PRESETS.map((preset, i) => (
              <button key={i} onClick={() => onChange(preset)}
                className="h-6 rounded border border-white/10 hover:border-white/30 transition-colors"
                style={{ background: gradientToCss(preset) }} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

