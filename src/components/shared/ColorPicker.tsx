import { useState, useRef, useEffect, useCallback } from 'react'
import { Pipette, Plus } from 'lucide-react'
import { usePaletteStore, savePaletteToFirestore } from '@/stores/palette.store'

// ── Theme & Standard Colors ─────────────────────────────────────────────────

const THEME_BASE = [
  '#FFFFFF', '#000000', '#1F3864', '#2E75B6', '#BF8F00', '#C55A11',
  '#538135', '#2F5496', '#7030A0', '#404040',
]

const THEME_TINTS: string[][] = [
  ['#F2F2F2', '#D9D9D9', '#BFBFBF', '#A6A6A6', '#808080'],
  ['#7F7F7F', '#595959', '#404040', '#262626', '#0D0D0D'],
  ['#D6E4F0', '#AECAEB', '#2E75B6', '#1F4E79', '#1F3864'],
  ['#DAEAF6', '#B5D5ED', '#5B9BD5', '#2F75B5', '#1F4D78'],
  ['#FFF2CC', '#FFE599', '#FFD966', '#BF8F00', '#806000'],
  ['#FBE5D6', '#F7CAAC', '#ED7D31', '#C55A11', '#843C0C'],
  ['#E2EFDA', '#C5E0B4', '#A9D18E', '#538135', '#375623'],
  ['#D6DCE5', '#ACB9CA', '#8497B0', '#2F5496', '#1F3864'],
  ['#E2D0F0', '#C5A3E1', '#A070C8', '#7030A0', '#4B1F6B'],
  ['#D9D9D9', '#BFBFBF', '#A6A6A6', '#808080', '#404040'],
]

const STANDARD_COLORS = [
  '#C00000', '#FF0000', '#FFC000', '#FFFF00', '#92D050',
  '#00B050', '#00B0F0', '#0070C0', '#002060', '#7030A0',
]

// ── Helpers ─────────────────────────────────────────────────────────────────

function hexToRgb(hex: string): [number, number, number] {
  const c = hex.replace('#', '')
  const n = parseInt(c.length === 3 ? c.split('').map(x => x + x).join('') : c, 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

function rgbToHex(r: number, g: number, b: number): string {
  return '#' + [r, g, b].map(x => x.toString(16).padStart(2, '0')).join('')
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  s /= 100; l /= 100
  const k = (n: number) => (n + h / 30) % 12
  const a = s * Math.min(l, 1 - l)
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)))
  return [Math.round(f(0) * 255), Math.round(f(8) * 255), Math.round(f(4) * 255)]
}

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255; g /= 255; b /= 255
  const max = Math.max(r, g, b), min = Math.min(r, g, b)
  let h = 0, s = 0
  const l = (max + min) / 2
  if (max !== min) {
    const d = max - min
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6
    else if (max === g) h = ((b - r) / d + 2) / 6
    else h = ((r - g) / d + 4) / 6
  }
  return [Math.round(h * 360), Math.round(s * 100), Math.round(l * 100)]
}

function getRecentColors(): string[] {
  try {
    return JSON.parse(localStorage.getItem('designstudio-recent-colors') || '[]')
  } catch { return [] }
}

function addRecentColor(color: string) {
  const recent = getRecentColors().filter(c => c.toLowerCase() !== color.toLowerCase())
  recent.unshift(color)
  localStorage.setItem('designstudio-recent-colors', JSON.stringify(recent.slice(0, 12)))
}

// ── HSL Canvas Picker ───────────────────────────────────────────────────────

function HslPicker({ hue, sat, light, onChange }: {
  hue: number; sat: number; light: number
  onChange: (h: number, s: number, l: number) => void
}) {
  const svCanvasRef = useRef<HTMLCanvasElement>(null)
  const hueBarRef = useRef<HTMLCanvasElement>(null)
  const dragging = useRef<'sv' | 'hue' | null>(null)

  // Draw SV square
  useEffect(() => {
    const canvas = svCanvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')!
    const w = canvas.width, h = canvas.height
    for (let x = 0; x < w; x++) {
      for (let y = 0; y < h; y++) {
        const s = (x / w) * 100
        const l = 100 - (y / h) * 100
        const [r, g, b] = hslToRgb(hue, s, l)
        ctx.fillStyle = `rgb(${r},${g},${b})`
        ctx.fillRect(x, y, 1, 1)
      }
    }
  }, [hue])

  // Draw hue bar
  useEffect(() => {
    const canvas = hueBarRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')!
    const w = canvas.width
    for (let x = 0; x < w; x++) {
      const h = (x / w) * 360
      const [r, g, b] = hslToRgb(h, 100, 50)
      ctx.fillStyle = `rgb(${r},${g},${b})`
      ctx.fillRect(x, 0, 1, canvas.height)
    }
  }, [])

  const handleSV = useCallback((e: React.MouseEvent | MouseEvent) => {
    const rect = svCanvasRef.current?.getBoundingClientRect()
    if (!rect) return
    const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
    const y = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height))
    onChange(hue, Math.round(x * 100), Math.round(100 - y * 100))
  }, [hue, onChange])

  const handleHue = useCallback((e: React.MouseEvent | MouseEvent) => {
    const rect = hueBarRef.current?.getBoundingClientRect()
    if (!rect) return
    const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
    onChange(Math.round(x * 360), sat, light)
  }, [sat, light, onChange])

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (dragging.current === 'sv') handleSV(e)
      else if (dragging.current === 'hue') handleHue(e)
    }
    const onUp = () => { dragging.current = null }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp) }
  }, [handleSV, handleHue])

  return (
    <div className="flex flex-col gap-2">
      {/* SV square */}
      <div className="relative">
        <canvas ref={svCanvasRef} width={200} height={150}
          className="w-full h-[150px] rounded cursor-crosshair"
          onMouseDown={(e) => { dragging.current = 'sv'; handleSV(e) }} />
        <div className="absolute w-3 h-3 border-2 border-white rounded-full pointer-events-none shadow-md"
          style={{ left: `${sat}%`, top: `${100 - light}%`, transform: 'translate(-50%, -50%)' }} />
      </div>
      {/* Hue bar */}
      <div className="relative">
        <canvas ref={hueBarRef} width={200} height={14}
          className="w-full h-3.5 rounded cursor-pointer"
          onMouseDown={(e) => { dragging.current = 'hue'; handleHue(e) }} />
        <div className="absolute top-0 w-1 h-full bg-white border border-black/30 rounded pointer-events-none"
          style={{ left: `${(hue / 360) * 100}%`, transform: 'translateX(-50%)' }} />
      </div>
    </div>
  )
}

// ── Project Color Swatches ───────────────────────────────────────────────────

function ProjectColorSwatches({ onSelect, currentColor }: { onSelect: (c: string) => void; currentColor: string }) {
  const { colors, addColor } = usePaletteStore()
  const canAdd = currentColor && currentColor !== 'transparent' && !colors.some(c => c.color.toLowerCase() === currentColor.toLowerCase())

  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <p className="text-[9px] text-white/30 uppercase">Couleurs du projet</p>
        {canAdd && (
          <button onClick={() => { addColor(currentColor); savePaletteToFirestore() }}
            title="Ajouter la couleur actuelle au projet"
            className="flex items-center gap-0.5 text-[9px] text-indigo-400/60 hover:text-indigo-400 transition-colors">
            <Plus className="w-2.5 h-2.5" /> Ajouter
          </button>
        )}
      </div>
      {colors.length > 0 ? (
        <div className="flex gap-1 flex-wrap">
          {colors.map((c) => (
            <button key={c.id} onClick={() => onSelect(c.color)}
              className="w-6 h-6 rounded border border-white/10 hover:border-white/40 transition-colors hover:scale-110"
              style={{ backgroundColor: c.color }}
              title={c.name} />
          ))}
        </div>
      ) : (
        <p className="text-[9px] text-white/15 italic">Aucune — cliquez « Ajouter »</p>
      )}
    </div>
  )
}

// ── Main ColorPicker ────────────────────────────────────────────────────────

interface ColorPickerProps {
  value: string
  onChange: (color: string) => void
  allowNoFill?: boolean
  label?: string
}

export function ColorPicker({ value, onChange, allowNoFill, label }: ColorPickerProps) {
  const [open, setOpen] = useState(false)
  const [showCustom, setShowCustom] = useState(false)
  const [recentColors, setRecentColors] = useState(getRecentColors)
  const popoverRef = useRef<HTMLDivElement>(null)

  const isTransparent = !value || value === 'transparent' || value === ''
  const displayColor = isTransparent ? 'transparent' : value

  // Custom picker state
  const rgb = isTransparent ? [100, 100, 100] as [number, number, number] : hexToRgb(value.startsWith('#') ? value : '#6366f1')
  const [hsl, setHsl] = useState(() => rgbToHsl(...rgb))
  const [hexInput, setHexInput] = useState(isTransparent ? '' : value)

  // Sync hsl when value changes externally
  useEffect(() => {
    if (!isTransparent && value.startsWith('#')) {
      const r = hexToRgb(value)
      setHsl(rgbToHsl(...r))
      setHexInput(value)
    }
  }, [value, isTransparent])

  // Close on outside click
  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setOpen(false)
        setShowCustom(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const selectColor = (color: string) => {
    onChange(color)
    addRecentColor(color)
    setRecentColors(getRecentColors())
    setOpen(false)
    setShowCustom(false)
  }

  const handleHslChange = (h: number, s: number, l: number) => {
    setHsl([h, s, l])
    const [r, g, b] = hslToRgb(h, s, l)
    const hex = rgbToHex(r, g, b)
    setHexInput(hex)
    onChange(hex)
  }

  const handleHexSubmit = () => {
    const clean = hexInput.startsWith('#') ? hexInput : '#' + hexInput
    if (/^#[0-9a-fA-F]{6}$/.test(clean)) {
      selectColor(clean)
    }
  }

  const Swatch = ({ color, size = 'sm' }: { color: string; size?: 'sm' | 'xs' }) => {
    const s = size === 'sm' ? 'w-6 h-6' : 'w-5 h-5'
    return (
      <button onClick={() => selectColor(color)}
        className={`${s} rounded border border-white/10 hover:border-white/40 transition-colors hover:scale-110`}
        style={{ backgroundColor: color }}
        title={color} />
    )
  }

  return (
    <div className="flex flex-col gap-1 relative">
      {label && <label className="text-[10px] text-white/30 uppercase tracking-wider">{label}</label>}
      <button onClick={() => setOpen(!open)}
        className="flex items-center gap-2 bg-white/5 border border-white/10 rounded-md px-2 py-1.5 focus-within:border-indigo-500/50 hover:border-white/20 transition-colors">
        <div className="w-5 h-5 rounded border border-white/20 shrink-0"
          style={{
            backgroundColor: isTransparent ? undefined : displayColor,
            backgroundImage: isTransparent ? 'linear-gradient(45deg, #666 25%, transparent 25%, transparent 75%, #666 75%), linear-gradient(45deg, #666 25%, transparent 25%, transparent 75%, #666 75%)' : undefined,
            backgroundSize: isTransparent ? '6px 6px' : undefined,
            backgroundPosition: isTransparent ? '0 0, 3px 3px' : undefined,
          }} />
        <span className="flex-1 text-xs text-white/70 font-mono text-left uppercase">
          {isTransparent ? 'Aucun' : value}
        </span>
      </button>

      {open && (
        <div ref={popoverRef}
          className="absolute z-50 top-full mt-1 left-0 w-[260px] bg-[#1a1a1a] border border-white/10 rounded-lg shadow-2xl p-3 flex flex-col gap-2.5"
          style={{ maxHeight: 500, overflowY: 'auto' }}>

          {/* No fill */}
          <button onClick={() => selectColor('transparent')}
            className="w-full py-1.5 text-xs text-white/60 bg-white/5 hover:bg-white/10 border border-white/10 rounded transition-colors flex items-center justify-center gap-2">
            <div className="w-4 h-4 rounded border border-white/20 relative overflow-hidden"
              style={{
                backgroundImage: 'linear-gradient(45deg, #666 25%, transparent 25%, transparent 75%, #666 75%), linear-gradient(45deg, #666 25%, transparent 25%, transparent 75%, #666 75%)',
                backgroundSize: '6px 6px',
                backgroundPosition: '0 0, 3px 3px',
              }}>
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="w-[140%] h-[1.5px] bg-red-500 rotate-45" />
              </div>
            </div>
            Sans couleur
          </button>

          {!showCustom ? (
            <>
              {/* Theme colors */}
              <div>
                <p className="text-[9px] text-white/30 uppercase mb-1.5">Couleurs du thème</p>
                <div className="flex gap-1 mb-1">
                  {THEME_BASE.map((c, i) => <Swatch key={i} color={c} />)}
                </div>
                {[0, 1, 2, 3, 4].map(row => (
                  <div key={row} className="flex gap-1 mb-0.5">
                    {THEME_TINTS.map((tints, col) => (
                      <Swatch key={col} color={tints[row]} size="xs" />
                    ))}
                  </div>
                ))}
              </div>

              {/* Standard colors */}
              <div>
                <p className="text-[9px] text-white/30 uppercase mb-1.5">Couleurs standard</p>
                <div className="flex gap-1">
                  {STANDARD_COLORS.map((c, i) => <Swatch key={i} color={c} />)}
                </div>
              </div>

              {/* Project colors */}
              <ProjectColorSwatches onSelect={selectColor} currentColor={value} />

              {/* Recent colors */}
              {recentColors.length > 0 && (
                <div>
                  <p className="text-[9px] text-white/30 uppercase mb-1.5">Couleurs récentes</p>
                  <div className="flex gap-1 flex-wrap">
                    {recentColors.map((c, i) => <Swatch key={i} color={c} size="xs" />)}
                  </div>
                </div>
              )}

              {/* Custom color button */}
              <button onClick={() => setShowCustom(true)}
                className="flex items-center gap-2 py-1.5 px-2 text-xs text-white/50 hover:text-white bg-white/5 hover:bg-white/10 border border-white/10 rounded transition-colors">
                <Pipette className="w-3.5 h-3.5" />
                Autres couleurs...
              </button>
            </>
          ) : (
            <>
              {/* Custom color picker */}
              <button onClick={() => setShowCustom(false)}
                className="text-[10px] text-indigo-400 hover:text-indigo-300 text-left">
                &larr; Retour aux palettes
              </button>

              <HslPicker hue={hsl[0]} sat={hsl[1]} light={hsl[2]} onChange={handleHslChange} />

              {/* Preview */}
              <div className="flex gap-2 items-center">
                <div className="w-8 h-8 rounded border border-white/20" style={{ backgroundColor: value }} />
                <div className="flex-1 flex flex-col gap-1">
                  <div className="flex items-center gap-1">
                    <span className="text-[9px] text-white/30 w-6">HEX</span>
                    <input type="text" value={hexInput}
                      onChange={(e) => setHexInput(e.target.value)}
                      onBlur={handleHexSubmit}
                      onKeyDown={(e) => e.key === 'Enter' && handleHexSubmit()}
                      className="flex-1 bg-white/5 border border-white/10 rounded px-1.5 py-0.5 text-[10px] text-white font-mono" />
                  </div>
                </div>
              </div>

              {/* RGB inputs */}
              <div className="flex gap-1.5">
                {(['R', 'G', 'B'] as const).map((ch, i) => (
                  <div key={ch} className="flex-1 flex flex-col gap-0.5">
                    <span className="text-[9px] text-white/30 text-center">{ch}</span>
                    <input type="number" min={0} max={255}
                      value={hslToRgb(hsl[0], hsl[1], hsl[2])[i]}
                      onChange={(e) => {
                        const rgb = hslToRgb(hsl[0], hsl[1], hsl[2]) as [number, number, number]
                        rgb[i] = Math.max(0, Math.min(255, Number(e.target.value)))
                        const newHsl = rgbToHsl(...rgb)
                        handleHslChange(newHsl[0], newHsl[1], newHsl[2])
                      }}
                      className="w-full bg-white/5 border border-white/10 rounded px-1.5 py-0.5 text-[10px] text-white text-center" />
                  </div>
                ))}
              </div>

              {/* HSL inputs */}
              <div className="flex gap-1.5">
                {[
                  { label: 'H', value: hsl[0], max: 360 },
                  { label: 'S', value: hsl[1], max: 100 },
                  { label: 'L', value: hsl[2], max: 100 },
                ].map(({ label: l, value: v, max }) => (
                  <div key={l} className="flex-1 flex flex-col gap-0.5">
                    <span className="text-[9px] text-white/30 text-center">{l}</span>
                    <input type="number" min={0} max={max} value={v}
                      onChange={(e) => {
                        const val = Math.max(0, Math.min(max, Number(e.target.value)))
                        handleHslChange(
                          l === 'H' ? val : hsl[0],
                          l === 'S' ? val : hsl[1],
                          l === 'L' ? val : hsl[2]
                        )
                      }}
                      className="w-full bg-white/5 border border-white/10 rounded px-1.5 py-0.5 text-[10px] text-white text-center" />
                  </div>
                ))}
              </div>

              <div className="flex gap-1.5">
                <button onClick={() => {
                  addRecentColor(value)
                  setRecentColors(getRecentColors())
                  setShowCustom(false)
                  setOpen(false)
                }}
                  className="flex-1 py-1.5 text-xs bg-indigo-500 hover:bg-indigo-600 text-white rounded transition-colors">
                  Appliquer
                </button>
                <button onClick={() => {
                  usePaletteStore.getState().addColor(value)
                  savePaletteToFirestore()
                  addRecentColor(value)
                  setRecentColors(getRecentColors())
                  setShowCustom(false)
                  setOpen(false)
                }}
                  title="Sauvegarder dans la palette du projet"
                  className="py-1.5 px-2.5 text-xs bg-white/5 hover:bg-white/10 border border-white/10 text-white/60 hover:text-white rounded transition-colors">
                  <Plus className="w-3.5 h-3.5" />
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}

export default ColorPicker
