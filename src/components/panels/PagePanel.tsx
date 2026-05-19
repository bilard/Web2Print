import { useState, useRef, useEffect } from 'react'
import { ImagePlus, Trash2 } from 'lucide-react'
import { useUIStore, type CanvasBgType } from '@/stores/ui.store'
import { ColorPicker } from '@/components/shared/ColorPicker'
import { GradientPicker } from '@/components/shared/GradientPicker'
import { globalFabricCanvas } from '@/features/editor/CanvasContainer'
import { ensurePageBgRect } from '@/features/editor/useCanvas'
import { canvasPxToMm, mmToCanvasPx } from '@/features/print/dimensions'

// Le canvas Fabric stocke des points (1 px canvas = 1 pt = 1/72 inch).
// Les formats print sont exprimés en pt pour rester cohérents avec l'import
// IDML, l'export PNG (multiplier = dpi/72) et la conversion mm via CANVAS_DPI.
const FORMAT_PRESETS = [
  // Print (pt)
  { label: 'A4 Portrait', w: 595, h: 842 },
  { label: 'A4 Paysage', w: 842, h: 595 },
  { label: 'A3 Portrait', w: 842, h: 1191 },
  { label: 'A5 Portrait', w: 420, h: 595 },
  // Numérique (px = pt)
  { label: 'Full HD', w: 1920, h: 1080 },
  { label: '4K', w: 3840, h: 2160 },
  { label: '16:9', w: 1280, h: 720 },
  { label: 'Instagram Post', w: 1080, h: 1080 },
  { label: 'Instagram Story', w: 1080, h: 1920 },
  { label: 'Facebook Cover', w: 820, h: 312 },
]

/** Arrondi mm pour l'affichage : 1 décimale sous 10mm, entier au-delà. */
function roundMm(mm: number): number {
  if (!Number.isFinite(mm)) return 0
  return mm < 10 ? Math.round(mm * 10) / 10 : Math.round(mm)
}

export function PagePanel() {
  const {
    canvasWidth, canvasHeight, canvasBg,
    canvasBgType, canvasBgGradient, canvasBgImage,
    setCanvasSize, setCanvasBgType, setCanvasBgGradient, setCanvasBgImage,
  } = useUIStore()

  // L'UI affiche et saisit en mm ; le store reste en px canvas (= pt).
  const [widthMm, setWidthMm] = useState<number | string>(() => roundMm(canvasPxToMm(canvasWidth)))
  const [heightMm, setHeightMm] = useState<number | string>(() => roundMm(canvasPxToMm(canvasHeight)))
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setWidthMm(roundMm(canvasPxToMm(canvasWidth)))
    setHeightMm(roundMm(canvasPxToMm(canvasHeight)))
  }, [canvasWidth, canvasHeight])

  const triggerSave = () => {
    setTimeout(() => {
      const canvas = globalFabricCanvas
      if (!canvas) return
      ensurePageBgRect(canvas)
      canvas.fire('object:modified' as any)
    }, 50)
  }

  // Reçoit les dimensions en pt (= px canvas).
  const applySize = (wPt: number, hPt: number) => {
    const cw = Math.max(50, wPt)
    const ch = Math.max(50, hPt)
    setWidthMm(roundMm(canvasPxToMm(cw)))
    setHeightMm(roundMm(canvasPxToMm(ch)))
    setCanvasSize(cw, ch)
    triggerSave()
  }

  // Saisie utilisateur en mm → convertit en pt pour applySize.
  const applySizeMm = (wMm: number, hMm: number) => {
    applySize(mmToCanvasPx(Math.max(10, wMm)), mmToCanvasPx(Math.max(10, hMm)))
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

  return (
    <div className="p-3 flex flex-col gap-4">
      {/* ── Dimensions ── */}
      <section className="flex flex-col gap-2">
        <label className="text-[10px] text-white/40 uppercase tracking-wider font-semibold">Dimensions</label>
        <div className="flex items-center gap-2">
          <div className="flex-1 flex flex-col gap-1">
            <span className="text-[10px] text-white/30">Largeur</span>
            <input type="number" value={widthMm} min={10} step={0.1}
              onChange={(e) => setWidthMm(e.target.value === '' ? '' : Number(e.target.value))}
              onBlur={() => applySizeMm(Number(widthMm) || 10, Number(heightMm) || 10)}
              onKeyDown={(e) => e.key === 'Enter' && applySizeMm(Number(widthMm) || 10, Number(heightMm) || 10)}
              className="w-full bg-white/5 border border-white/10 rounded-md px-2 py-1.5 text-xs text-white focus:outline-none focus:border-indigo-500/50" />
          </div>
          <span className="text-white/20 mt-4">x</span>
          <div className="flex-1 flex flex-col gap-1">
            <span className="text-[10px] text-white/30">Hauteur</span>
            <input type="number" value={heightMm} min={10} step={0.1}
              onChange={(e) => setHeightMm(e.target.value === '' ? '' : Number(e.target.value))}
              onBlur={() => applySizeMm(Number(widthMm) || 10, Number(heightMm) || 10)}
              onKeyDown={(e) => e.key === 'Enter' && applySizeMm(Number(widthMm) || 10, Number(heightMm) || 10)}
              className="w-full bg-white/5 border border-white/10 rounded-md px-2 py-1.5 text-xs text-white focus:outline-none focus:border-indigo-500/50" />
          </div>
          <span className="text-[10px] text-white/20 mt-4">mm</span>
        </div>
        <div className="flex flex-wrap gap-1 mt-1">
          {FORMAT_PRESETS.map((p) => {
            const active = Math.round(canvasWidth) === p.w && Math.round(canvasHeight) === p.h
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

      {/* ── Arrière-plan ── */}
      <section className="flex flex-col gap-2 pt-3 border-t border-white/5">
        <label className="text-[10px] text-white/40 uppercase tracking-wider font-semibold">Arrière-plan</label>

        <div className="flex gap-1">
          {([
            { value: 'solid' as const, label: 'Uni' },
            { value: 'gradient' as const, label: 'Dégradé' },
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

        {canvasBgType === 'solid' && (
          <ColorPicker label="Couleur de fond" value={canvasBg} onChange={handleBgColorChange} />
        )}

        {canvasBgType === 'gradient' && (
          <GradientPicker value={canvasBgGradient} onChange={handleGradientChange} />
        )}

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

      <div className="text-[10px] text-white/20 text-center pt-2 border-t border-white/5">
        {roundMm(canvasPxToMm(canvasWidth))} x {roundMm(canvasPxToMm(canvasHeight))} mm &mdash; {Math.round(canvasWidth)} x {Math.round(canvasHeight)} pt
      </div>
    </div>
  )
}
