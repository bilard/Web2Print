import { useState, useRef, useEffect } from 'react'
import { X, ImagePlus, Trash2 } from 'lucide-react'
import { useUIStore, type CanvasBgType } from '@/stores/ui.store'
import { ColorPicker } from './ColorPicker'
import { GradientPicker } from './GradientPicker'
import { globalFabricCanvas } from '@/features/editor/CanvasContainer'
import { ensurePageBgRect } from '@/features/editor/useCanvas'

const FORMAT_PRESETS = [
  { label: 'A4 Portrait', w: 794, h: 1123 },
  { label: 'A4 Paysage', w: 1123, h: 794 },
  { label: 'A3 Portrait', w: 1123, h: 1587 },
  { label: 'A5 Portrait', w: 559, h: 794 },
  { label: 'Full HD', w: 1920, h: 1080 },
  { label: '4K', w: 3840, h: 2160 },
  { label: '16:9', w: 1280, h: 720 },
  { label: 'Instagram Post', w: 1080, h: 1080 },
  { label: 'Instagram Story', w: 1080, h: 1920 },
  { label: 'Facebook Cover', w: 820, h: 312 },
]

export function PageSettingsPopover() {
  const {
    pageSettingsOpen, setPageSettingsOpen,
    canvasWidth, canvasHeight, canvasBg,
    canvasBgType, canvasBgGradient, canvasBgImage,
    setCanvasSize, setCanvasBgType, setCanvasBgGradient, setCanvasBgImage,
  } = useUIStore()

  const [width, setWidth] = useState<number | string>(canvasWidth)
  const [height, setHeight] = useState<number | string>(canvasHeight)
  const popoverRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Sync local state when store changes
  useEffect(() => {
    setWidth(canvasWidth)
    setHeight(canvasHeight)
  }, [canvasWidth, canvasHeight])

  // Close on outside click
  useEffect(() => {
    if (!pageSettingsOpen) return
    const handler = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setPageSettingsOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [pageSettingsOpen, setPageSettingsOpen])

  if (!pageSettingsOpen) return null

  const applySize = (w: number, h: number) => {
    const cw = Math.max(100, w)
    const ch = Math.max(100, h)
    setWidth(cw)
    setHeight(ch)
    setCanvasSize(cw, ch)
    triggerSave()
  }

  const handleBgTypeChange = (type: CanvasBgType) => {
    setCanvasBgType(type)
    triggerSave()
  }

  const handleBgColorChange = (color: string) => {
    setCanvasSize(canvasWidth, canvasHeight, color)
    triggerSave()
  }

  const handleGradientChange = (g: typeof canvasBgGradient) => {
    setCanvasBgGradient(g)
    triggerSave()
  }

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      const dataUrl = reader.result as string
      setCanvasBgImage(dataUrl)
      setCanvasBgType('image')
      triggerSave()
    }
    reader.readAsDataURL(file)
    e.target.value = ''
  }

  const removeImage = () => {
    setCanvasBgImage(null)
    setCanvasBgType('solid')
    triggerSave()
  }

  /** Trigger canvas re-render + auto-save */
  const triggerSave = () => {
    setTimeout(() => {
      const canvas = globalFabricCanvas
      if (!canvas) return
      ensurePageBgRect(canvas)
      canvas.fire('object:modified' as any)
    }, 50)
  }

  return (
    <div ref={popoverRef}
      className="absolute bottom-full mb-2 left-0 w-[340px] bg-[#1a1a1a] border border-white/10 rounded-xl shadow-2xl z-50 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-white/10">
        <h3 className="text-xs font-semibold text-white/60 uppercase tracking-wider">Page</h3>
        <button onClick={() => setPageSettingsOpen(false)}
          className="text-white/30 hover:text-white transition-colors">
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="p-4 flex flex-col gap-4 max-h-[70vh] overflow-y-auto">
        {/* ── Dimensions ── */}
        <section className="flex flex-col gap-2">
          <label className="text-[10px] text-white/40 uppercase tracking-wider font-semibold">Dimensions</label>
          <div className="flex items-center gap-2">
            <div className="flex-1 flex flex-col gap-1">
              <span className="text-[10px] text-white/30">Largeur</span>
              <input type="number" value={width} min={100}
                onChange={(e) => setWidth(e.target.value === '' ? '' : Number(e.target.value))}
                onBlur={() => applySize(Number(width) || 100, Number(height) || 100)}
                onKeyDown={(e) => e.key === 'Enter' && applySize(Number(width) || 100, Number(height) || 100)}
                className="w-full bg-white/5 border border-white/10 rounded-md px-2 py-1.5 text-xs text-white focus:outline-none focus:border-indigo-500/50" />
            </div>
            <span className="text-white/20 mt-4">x</span>
            <div className="flex-1 flex flex-col gap-1">
              <span className="text-[10px] text-white/30">Hauteur</span>
              <input type="number" value={height} min={100}
                onChange={(e) => setHeight(e.target.value === '' ? '' : Number(e.target.value))}
                onBlur={() => applySize(Number(width) || 100, Number(height) || 100)}
                onKeyDown={(e) => e.key === 'Enter' && applySize(Number(width) || 100, Number(height) || 100)}
                className="w-full bg-white/5 border border-white/10 rounded-md px-2 py-1.5 text-xs text-white focus:outline-none focus:border-indigo-500/50" />
            </div>
            <span className="text-[10px] text-white/20 mt-4">px</span>
          </div>
          {/* Presets */}
          <div className="flex flex-wrap gap-1 mt-1">
            {FORMAT_PRESETS.map((p) => {
              const active = canvasWidth === p.w && canvasHeight === p.h
              return (
                <button key={p.label} onClick={() => applySize(p.w, p.h)}
                  className={`px-2 py-1 text-[10px] rounded border transition-colors ${active
                    ? 'bg-indigo-500/20 border-indigo-500/50 text-indigo-400'
                    : 'bg-white/5 border-white/10 text-white/40 hover:text-white hover:border-white/20'}`}>
                  {p.label}
                </button>
              )
            })}
          </div>
        </section>

        {/* ── Fond ── */}
        <section className="flex flex-col gap-2">
          <label className="text-[10px] text-white/40 uppercase tracking-wider font-semibold">Arriere-plan</label>

          {/* Type toggle */}
          <div className="flex gap-1">
            {([
              { value: 'solid' as const, label: 'Uni' },
              { value: 'gradient' as const, label: 'Degrade' },
              { value: 'image' as const, label: 'Image' },
            ]).map(({ value, label }) => (
              <button key={value} onClick={() => handleBgTypeChange(value)}
                className={`flex-1 py-1.5 text-[10px] rounded border transition-colors ${canvasBgType === value
                  ? 'bg-indigo-500/20 border-indigo-500/50 text-indigo-400'
                  : 'bg-white/5 border-white/10 text-white/40 hover:text-white/60'}`}>
                {label}
              </button>
            ))}
          </div>

          {/* Solid color */}
          {canvasBgType === 'solid' && (
            <ColorPicker label="Couleur de fond" value={canvasBg} onChange={handleBgColorChange} />
          )}

          {/* Gradient */}
          {canvasBgType === 'gradient' && (
            <GradientPicker value={canvasBgGradient} onChange={handleGradientChange} />
          )}

          {/* Image */}
          {canvasBgType === 'image' && (
            <div className="flex flex-col gap-2">
              {canvasBgImage ? (
                <div className="relative group">
                  <img src={canvasBgImage} alt="Fond"
                    className="w-full h-24 object-cover rounded-lg border border-white/10" />
                  <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity rounded-lg flex items-center justify-center gap-2">
                    <button onClick={() => fileInputRef.current?.click()}
                      className="px-3 py-1.5 text-xs bg-white/10 hover:bg-white/20 border border-white/20 rounded-md text-white transition-colors">
                      Changer
                    </button>
                    <button onClick={removeImage}
                      className="p-1.5 text-red-400 bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 rounded-md transition-colors">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ) : (
                <button onClick={() => fileInputRef.current?.click()}
                  className="flex items-center justify-center gap-2 py-6 border-2 border-dashed border-white/10 hover:border-indigo-500/30 rounded-lg text-white/30 hover:text-indigo-400 transition-colors">
                  <ImagePlus className="w-5 h-5" />
                  <span className="text-xs">Choisir une image</span>
                </button>
              )}
              <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
            </div>
          )}
        </section>

        {/* Info */}
        <div className="text-[10px] text-white/20 text-center pt-1 border-t border-white/5">
          {canvasWidth} x {canvasHeight} px &mdash; {(canvasWidth / 96 * 25.4).toFixed(0)} x {(canvasHeight / 96 * 25.4).toFixed(0)} mm
        </div>
      </div>
    </div>
  )
}
