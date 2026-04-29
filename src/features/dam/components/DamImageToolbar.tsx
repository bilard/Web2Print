import { useCallback, useState } from 'react'
import {
  ZoomIn, ZoomOut, Maximize2, RotateCw, FlipHorizontal2, FlipVertical2,
  Palette, Crop, Download, RotateCcw, Save, Layers, Loader2, Eye, EyeOff,
} from 'lucide-react'
import type { DamCropMask } from '../types'
import { DEFAULT_MASK } from '../utils/renderEditedImage'

export interface ColorFilters {
  brightness: number
  contrast: number
  saturation: number
  hue: number
}

export const DEFAULT_FILTERS: ColorFilters = {
  brightness: 100,
  contrast: 100,
  saturation: 100,
  hue: 0,
}

export type ActiveTool = 'colors' | 'crop' | 'export' | null

interface Props {
  zoom: number
  onZoomChange: (z: number) => void
  rotation: number
  onRotate: () => void
  flipH: boolean
  onFlipH: () => void
  flipV: boolean
  onFlipV: () => void
  filters: ColorFilters
  onFiltersChange: (f: Partial<ColorFilters>) => void
  activeTool: ActiveTool
  onToolChange: (t: ActiveTool) => void
  onExport: (format: string, quality: number, scale: number) => void
  mask: DamCropMask
  onMaskChange: (m: DamCropMask) => void
  cropRatio: number | null
  onCropRatioChange: (r: number | null) => void
  onReset: () => void
  imageWidth: number
  imageHeight: number
  onSaveVariant: (name: string) => void
  onUpdateVariant?: () => void
  isVariantLoaded: boolean
  saving: boolean
  variantsCount: number
  variantsPanelOpen: boolean
  onToggleVariantsPanel: () => void
  isDirty: boolean
}

function ToolBtn({
  icon: Icon,
  label,
  active,
  onClick,
}: {
  icon: React.ElementType
  label: string
  active?: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      title={label}
      className={`p-1.5 rounded-md transition ${
        active ? 'bg-indigo-500/20 text-indigo-400' : 'text-white/40 hover:text-white/70 hover:bg-white/10'
      }`}
    >
      <Icon className="w-4 h-4" />
    </button>
  )
}

const CROP_RATIOS: { label: string; value: number | null }[] = [
  { label: 'Libre', value: null },
  { label: '1:1', value: 1 },
  { label: '4:3', value: 4 / 3 },
  { label: '3:2', value: 3 / 2 },
  { label: '16:9', value: 16 / 9 },
  { label: '2:3', value: 2 / 3 },
  { label: '3:4', value: 3 / 4 },
]

const EXPORT_FORMATS = [
  { value: 'image/png', label: 'PNG', lossless: true },
  { value: 'image/jpeg', label: 'JPEG', lossless: false },
  { value: 'image/webp', label: 'WebP', lossless: false },
]

const FILTER_SLIDERS: { key: keyof ColorFilters; label: string; min: number; max: number; unit: string }[] = [
  { key: 'brightness', label: 'Luminosité', min: 0, max: 200, unit: '%' },
  { key: 'contrast', label: 'Contraste', min: 0, max: 200, unit: '%' },
  { key: 'saturation', label: 'Saturation', min: 0, max: 200, unit: '%' },
  { key: 'hue', label: 'Teinte', min: 0, max: 360, unit: 'deg' },
]

export function DamImageToolbar(props: Props) {
  const {
    zoom, onZoomChange, onRotate, flipH, onFlipH, flipV, onFlipV,
    filters, onFiltersChange, activeTool, onToolChange,
    onExport, mask, onMaskChange, cropRatio, onCropRatioChange, onReset,
    imageWidth, imageHeight,
    onSaveVariant, onUpdateVariant, isVariantLoaded,
    saving, variantsCount, variantsPanelOpen, onToggleVariantsPanel,
    isDirty,
  } = props

  const toggle = useCallback(
    (tool: ActiveTool) => onToolChange(activeTool === tool ? null : tool),
    [activeTool, onToolChange]
  )

  const handleSaveClick = useCallback(() => {
    const name = prompt('Nom de la variante :', `Version ${variantsCount + 1}`)
    if (name && name.trim()) onSaveVariant(name.trim())
  }, [onSaveVariant, variantsCount])

  return (
    <div className="shrink-0">
      {/* Toolbar row */}
      <div className="flex items-center gap-0.5 px-4 py-1 border-b border-white/5">
        <div className="flex items-center gap-0.5 pr-2 border-r border-white/10 mr-2">
          <ToolBtn icon={ZoomOut} label="Dézoomer" onClick={() => onZoomChange(Math.max(0.1, zoom - 0.25))} />
          <span className="text-[10px] text-white/40 font-mono w-10 text-center">{Math.round(zoom * 100)}%</span>
          <ToolBtn icon={ZoomIn} label="Zoomer" onClick={() => onZoomChange(Math.min(5, zoom + 0.25))} />
          <ToolBtn icon={Maximize2} label="Ajuster" onClick={() => onZoomChange(1)} />
        </div>

        <div className="flex items-center gap-0.5 pr-2 border-r border-white/10 mr-2">
          <ToolBtn icon={RotateCw} label="Rotation 90deg" onClick={onRotate} />
          <ToolBtn icon={FlipHorizontal2} label="Miroir H" active={flipH} onClick={onFlipH} />
          <ToolBtn icon={FlipVertical2} label="Miroir V" active={flipV} onClick={onFlipV} />
        </div>

        <div className="flex items-center gap-0.5 pr-2 border-r border-white/10 mr-2">
          <ToolBtn icon={Crop} label="Recadrer" active={activeTool === 'crop'} onClick={() => toggle('crop')} />
          <ToolBtn icon={Palette} label="Colorimétrie" active={activeTool === 'colors'} onClick={() => toggle('colors')} />
          <ToolBtn icon={Download} label="Exporter" active={activeTool === 'export'} onClick={() => toggle('export')} />
        </div>

        <ToolBtn icon={RotateCcw} label="Réinitialiser" onClick={onReset} />

        {/* Variants actions — right side */}
        <div className="ml-auto flex items-center gap-1">
          {isVariantLoaded && onUpdateVariant && (
            <button
              onClick={onUpdateVariant}
              disabled={!isDirty || saving}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 disabled:opacity-30 disabled:cursor-not-allowed transition"
              title="Mettre à jour la variante ouverte"
            >
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
              Mettre à jour
            </button>
          )}
          <button
            onClick={handleSaveClick}
            disabled={!isDirty || saving}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] bg-indigo-500/20 text-indigo-400 hover:bg-indigo-500/30 disabled:opacity-30 disabled:cursor-not-allowed transition"
            title="Enregistrer en tant que nouvelle variante"
          >
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
            {isVariantLoaded ? 'Nouvelle variante' : 'Enregistrer variante'}
          </button>
          <button
            onClick={onToggleVariantsPanel}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] transition ${
              variantsPanelOpen
                ? 'bg-indigo-500/20 text-indigo-400'
                : 'bg-white/5 text-white/60 hover:bg-white/10'
            }`}
            title="Afficher les versions"
          >
            <Layers className="w-3.5 h-3.5" />
            Versions
            {variantsCount > 0 && (
              <span className="px-1 rounded-full bg-indigo-500/30 text-[9px] font-medium">
                {variantsCount}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* Tool panels */}
      {activeTool === 'colors' && (
        <ColorPanel filters={filters} onChange={onFiltersChange} />
      )}
      {activeTool === 'crop' && (
        <CropPanel
          mask={mask}
          onMaskChange={onMaskChange}
          ratio={cropRatio}
          onRatioChange={onCropRatioChange}
          imageWidth={imageWidth}
          imageHeight={imageHeight}
        />
      )}
      {activeTool === 'export' && (
        <ExportPanel onExport={onExport} imageWidth={imageWidth} imageHeight={imageHeight} />
      )}
    </div>
  )
}

function ColorPanel({ filters, onChange }: { filters: ColorFilters; onChange: (f: Partial<ColorFilters>) => void }) {
  return (
    <div className="px-4 py-2.5 border-b border-white/5 flex gap-6">
      {FILTER_SLIDERS.map((s) => (
        <div key={s.key} className="flex-1 min-w-0">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[9px] text-white/40 uppercase tracking-wider">{s.label}</span>
            <span className="text-[9px] text-white/40 font-mono">{filters[s.key]}{s.unit === 'deg' ? '°' : ''}</span>
          </div>
          <input
            type="range"
            min={s.min}
            max={s.max}
            value={filters[s.key]}
            onChange={(e) => onChange({ [s.key]: parseInt(e.target.value) })}
            className="w-full h-1 bg-white/10 rounded-full appearance-none cursor-pointer accent-indigo-500
              [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-2.5 [&::-webkit-slider-thumb]:h-2.5
              [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-indigo-500"
          />
        </div>
      ))}
      <button
        onClick={() => onChange(DEFAULT_FILTERS)}
        className="self-end text-[9px] text-white/30 hover:text-white/50 shrink-0"
      >
        Reset
      </button>
    </div>
  )
}

function CropPanel({
  mask,
  onMaskChange,
  ratio,
  onRatioChange,
  imageWidth,
  imageHeight,
}: {
  mask: DamCropMask
  onMaskChange: (m: DamCropMask) => void
  ratio: number | null
  onRatioChange: (r: number | null) => void
  imageWidth: number
  imageHeight: number
}) {
  const maskW = Math.round(mask.width * imageWidth)
  const maskH = Math.round(mask.height * imageHeight)
  const isFull = mask.x === 0 && mask.y === 0 && mask.width === 1 && mask.height === 1

  const applyRatio = (r: number | null) => {
    onRatioChange(r)
    if (r === null) return
    // Fit a centered mask at the given ratio in image space
    const imgAspect = imageWidth / imageHeight
    let w: number
    let h: number
    if (imgAspect > r) {
      // Image is wider than target — fit to height
      h = 1
      w = r / imgAspect
    } else {
      w = 1
      h = imgAspect / r
    }
    onMaskChange({
      x: (1 - w) / 2,
      y: (1 - h) / 2,
      width: w,
      height: h,
      enabled: true,
    })
  }

  const toggleEnabled = () => {
    onMaskChange({ ...mask, enabled: !mask.enabled })
  }

  const resetMask = () => {
    onMaskChange({ ...DEFAULT_MASK })
    onRatioChange(null)
  }

  return (
    <div className="px-4 py-2.5 border-b border-white/5 flex items-center gap-3 flex-wrap">
      <span className="text-[9px] text-white/40 uppercase tracking-wider shrink-0">Ratio</span>
      <div className="flex gap-1">
        {CROP_RATIOS.map((r) => (
          <button
            key={r.label}
            onClick={() => applyRatio(r.value)}
            className={`px-2 py-1 rounded text-[10px] transition ${
              ratio === r.value ? 'bg-indigo-500/20 text-indigo-400' : 'bg-white/5 text-white/50 hover:bg-white/10'
            }`}
          >
            {r.label}
          </button>
        ))}
      </div>

      <div className="h-5 w-px bg-white/10" />

      <button
        onClick={toggleEnabled}
        disabled={isFull}
        title={mask.enabled ? 'Désactiver le masque' : 'Activer le masque'}
        className={`flex items-center gap-1 px-2 py-1 rounded text-[10px] transition disabled:opacity-30 ${
          mask.enabled
            ? 'bg-indigo-500/20 text-indigo-400'
            : 'bg-white/5 text-white/50 hover:bg-white/10'
        }`}
      >
        {mask.enabled ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
        {mask.enabled ? 'Masque actif' : 'Masque masqué'}
      </button>

      <button
        onClick={resetMask}
        className="px-2 py-1 rounded text-[10px] bg-white/5 text-white/50 hover:bg-white/10 transition"
      >
        Réinitialiser
      </button>

      <div className="ml-auto text-[9px] text-white/30 font-mono">
        {isFull ? (
          <span>Glisse pour recadrer</span>
        ) : (
          <span>
            {maskW} x {maskH} px
          </span>
        )}
      </div>
    </div>
  )
}

function ExportPanel({
  onExport,
  imageWidth,
  imageHeight,
}: {
  onExport: (format: string, quality: number, scale: number) => void
  imageWidth: number
  imageHeight: number
}) {
  const [format, setFormat] = useState('image/png')
  const [quality, setQuality] = useState(92)
  const [scale, setScale] = useState(1)

  const isLossless = EXPORT_FORMATS.find((f) => f.value === format)?.lossless

  const outW = Math.round(imageWidth * scale)
  const outH = Math.round(imageHeight * scale)
  const estimatedSize = isLossless
    ? `~${((outW * outH * 4) / 1024 / 1024).toFixed(1)} MB`
    : `~${((outW * outH * 3 * (quality / 100)) / 1024 / 1024).toFixed(1)} MB`

  return (
    <div className="px-4 py-2.5 border-b border-white/5 flex items-center gap-6">
      <div>
        <div className="text-[9px] text-white/40 uppercase tracking-wider mb-1">Format</div>
        <div className="flex gap-1">
          {EXPORT_FORMATS.map((f) => (
            <button
              key={f.value}
              onClick={() => setFormat(f.value)}
              className={`px-2 py-1 rounded text-[10px] transition ${
                format === f.value ? 'bg-indigo-500/20 text-indigo-400' : 'bg-white/5 text-white/50 hover:bg-white/10'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {!isLossless && (
        <div className="min-w-[120px]">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[9px] text-white/40 uppercase tracking-wider">Qualité</span>
            <span className="text-[9px] text-white/40 font-mono">{quality}%</span>
          </div>
          <input
            type="range"
            min={10}
            max={100}
            value={quality}
            onChange={(e) => setQuality(parseInt(e.target.value))}
            className="w-full h-1 bg-white/10 rounded-full appearance-none cursor-pointer accent-indigo-500
              [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-2.5 [&::-webkit-slider-thumb]:h-2.5
              [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-indigo-500"
          />
        </div>
      )}

      <div>
        <div className="text-[9px] text-white/40 uppercase tracking-wider mb-1">Échelle</div>
        <div className="flex gap-1">
          {[0.5, 1, 1.5, 2].map((s) => (
            <button
              key={s}
              onClick={() => setScale(s)}
              className={`px-2 py-1 rounded text-[10px] transition ${
                scale === s ? 'bg-indigo-500/20 text-indigo-400' : 'bg-white/5 text-white/50 hover:bg-white/10'
              }`}
            >
              {s === 1 ? '1x' : `${s}x`}
            </button>
          ))}
        </div>
      </div>

      <div className="text-[9px] text-white/30 shrink-0">
        <div>{outW} x {outH} px</div>
        <div>{estimatedSize}</div>
      </div>

      <button
        onClick={() => onExport(format, quality, scale)}
        className="ml-auto px-3 py-1.5 rounded-lg bg-indigo-500 text-white text-xs hover:bg-indigo-600 transition shrink-0"
      >
        Exporter
      </button>
    </div>
  )
}
