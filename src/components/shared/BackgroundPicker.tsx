import { useRef } from 'react'
import { ImagePlus, Trash2, Palette, Layers, Image as ImageIcon } from 'lucide-react'
import { ColorPicker } from './ColorPicker'
import { GradientPicker, gradientToCss } from './GradientPicker'
import type { GradientConfig } from '@/stores/editor.store'
import type { CanvasBgType } from '@/stores/ui.store'

export interface BackgroundValue {
  type: CanvasBgType
  color: string
  gradient: GradientConfig
  image: string | null
}

interface BackgroundPickerProps {
  value: BackgroundValue
  onChange: (next: BackgroundValue) => void
}

const SOLID_SWATCHES = [
  '#ffffff', '#f5f5f5', '#e5e5e5', '#0f0f0f', '#1a1a1a', '#000000',
  '#fef2f2', '#fef9c3', '#ecfdf5', '#eff6ff', '#f5f3ff', '#fdf2f8',
]

const GRADIENT_PRESETS: GradientConfig[] = [
  { type: 'linear', angle: 90,  stops: [{ offset: 0, color: '#667eea' }, { offset: 1, color: '#764ba2' }] },
  { type: 'linear', angle: 135, stops: [{ offset: 0, color: '#f093fb' }, { offset: 1, color: '#f5576c' }] },
  { type: 'linear', angle: 90,  stops: [{ offset: 0, color: '#4facfe' }, { offset: 1, color: '#00f2fe' }] },
  { type: 'linear', angle: 90,  stops: [{ offset: 0, color: '#43e97b' }, { offset: 1, color: '#38f9d7' }] },
  { type: 'linear', angle: 90,  stops: [{ offset: 0, color: '#fa709a' }, { offset: 1, color: '#fee140' }] },
  { type: 'linear', angle: 90,  stops: [{ offset: 0, color: '#a18cd1' }, { offset: 1, color: '#fbc2eb' }] },
  { type: 'linear', angle: 90,  stops: [{ offset: 0, color: '#ffecd2' }, { offset: 1, color: '#fcb69f' }] },
  { type: 'linear', angle: 180, stops: [{ offset: 0, color: '#0f0f0f' }, { offset: 1, color: '#1a1a1a' }] },
  { type: 'radial', angle: 0,   stops: [{ offset: 0, color: '#ffffff' }, { offset: 1, color: '#000000' }] },
  { type: 'radial', angle: 0,   stops: [{ offset: 0, color: '#fde68a' }, { offset: 1, color: '#f97316' }] },
  { type: 'linear', angle: 45,  stops: [{ offset: 0, color: '#6366f1' }, { offset: 0.5, color: '#a855f7' }, { offset: 1, color: '#ec4899' }] },
  { type: 'linear', angle: 90,  stops: [{ offset: 0, color: '#1e3a8a' }, { offset: 1, color: '#06b6d4' }] },
]

const TABS: { value: CanvasBgType; label: string; icon: React.ElementType }[] = [
  { value: 'solid',    label: 'Couleur unie', icon: Palette },
  { value: 'gradient', label: 'Dégradé',      icon: Layers },
  { value: 'image',    label: 'Image',        icon: ImageIcon },
]

export function BackgroundPicker({ value, onChange }: BackgroundPickerProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)

  const setType = (type: CanvasBgType) => onChange({ ...value, type })

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      const dataUrl = reader.result as string
      onChange({ ...value, type: 'image', image: dataUrl })
    }
    reader.readAsDataURL(file)
    e.target.value = ''
  }

  return (
    <div className="space-y-3">
      {/* Type tabs */}
      <div className="flex gap-1 bg-[#111] border border-white/5 rounded-lg p-1">
        {TABS.map(({ value: tabValue, label, icon: Icon }) => {
          const active = value.type === tabValue
          return (
            <button
              key={tabValue}
              onClick={() => setType(tabValue)}
              className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 text-xs rounded-md transition-colors ${
                active ? 'bg-indigo-500 text-white' : 'text-white/50 hover:text-white hover:bg-white/5'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {label}
            </button>
          )
        })}
      </div>

      {/* Solid color */}
      {value.type === 'solid' && (
        <div className="space-y-2.5">
          <div className="flex flex-wrap gap-1.5">
            {SOLID_SWATCHES.map((color) => (
              <button
                key={color}
                onClick={() => onChange({ ...value, type: 'solid', color })}
                className={`w-8 h-8 rounded-lg border-2 transition-all ${
                  value.color === color ? 'border-indigo-500 scale-110' : 'border-white/10 hover:border-white/30'
                }`}
                style={{ backgroundColor: color }}
                title={color}
              />
            ))}
          </div>
          <ColorPicker
            value={value.color}
            onChange={(c) => onChange({ ...value, type: 'solid', color: c })}
            label="Couleur personnalisée"
          />
        </div>
      )}

      {/* Gradient */}
      {value.type === 'gradient' && (
        <div className="space-y-3">
          <div>
            <p className="text-[10px] text-white/40 uppercase tracking-wider font-medium mb-1.5">Présélections</p>
            <div className="grid grid-cols-6 gap-1.5">
              {GRADIENT_PRESETS.map((g, i) => {
                const css = gradientToCss(g)
                const active = gradientToCss(value.gradient) === css
                return (
                  <button
                    key={i}
                    onClick={() => onChange({ ...value, type: 'gradient', gradient: g })}
                    className={`h-10 rounded-lg border-2 transition-all ${
                      active ? 'border-indigo-500 scale-105' : 'border-white/10 hover:border-white/30'
                    }`}
                    style={{ background: css }}
                  />
                )
              })}
            </div>
          </div>
          <div className="bg-[#111] border border-white/5 rounded-lg p-3">
            <GradientPicker
              value={value.gradient}
              onChange={(g) => onChange({ ...value, type: 'gradient', gradient: g })}
            />
          </div>
        </div>
      )}

      {/* Image */}
      {value.type === 'image' && (
        <div className="space-y-2">
          {value.image ? (
            <div className="relative group">
              <img
                src={value.image}
                alt="Fond"
                className="w-full h-32 object-cover rounded-lg border border-white/10"
              />
              <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity rounded-lg flex items-center justify-center gap-2">
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="px-3 py-1.5 text-xs bg-white/10 hover:bg-white/20 border border-white/20 rounded-md text-white transition-colors"
                >
                  Changer
                </button>
                <button
                  onClick={() => onChange({ ...value, image: null })}
                  className="p-1.5 text-red-400 bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 rounded-md transition-colors"
                  title="Supprimer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => fileInputRef.current?.click()}
              className="w-full flex items-center justify-center gap-2 py-8 border-2 border-dashed border-white/10 hover:border-indigo-500/30 rounded-lg text-white/30 hover:text-indigo-400 transition-colors"
            >
              <ImagePlus className="w-5 h-5" />
              <span className="text-xs">Choisir une image</span>
            </button>
          )}
          <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
        </div>
      )}
    </div>
  )
}

/** Aperçu CSS de l'arrière-plan, peu importe le type. À utiliser avec
 *  `style={{ background: backgroundCss(value) }}` ou comme `backgroundImage`. */
export function backgroundCss(value: BackgroundValue): string {
  if (value.type === 'gradient') return gradientToCss(value.gradient)
  if (value.type === 'image' && value.image) return `url("${value.image}") center/cover no-repeat`
  return value.color
}
