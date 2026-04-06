import { useState } from 'react'
import { FileText, Monitor, Smartphone, Image, LayoutGrid, Loader2 } from 'lucide-react'

export interface DocumentConfig {
  title: string
  canvasWidth: number
  canvasHeight: number
  canvasBg: string
}

interface NewDocumentPanelProps {
  onConfirm: (config: DocumentConfig) => void
  loading: boolean
}

interface FormatPreset {
  label: string
  width: number
  height: number
  icon: React.ReactNode
  category: string
}

const FORMAT_PRESETS: FormatPreset[] = [
  { label: 'A4 Portrait', width: 794, height: 1123, icon: <FileText className="w-5 h-5" />, category: 'print' },
  { label: 'A4 Paysage', width: 1123, height: 794, icon: <FileText className="w-5 h-5" />, category: 'print' },
  { label: 'A3 Portrait', width: 1123, height: 1587, icon: <FileText className="w-5 h-5" />, category: 'print' },
  { label: 'A3 Paysage', width: 1587, height: 1123, icon: <FileText className="w-5 h-5" />, category: 'print' },
  { label: 'A5 Portrait', width: 559, height: 794, icon: <FileText className="w-5 h-5" />, category: 'print' },
  { label: 'Letter', width: 816, height: 1056, icon: <FileText className="w-5 h-5" />, category: 'print' },
  { label: 'Full HD (1920x1080)', width: 1920, height: 1080, icon: <Monitor className="w-5 h-5" />, category: 'screen' },
  { label: '4K (3840x2160)', width: 3840, height: 2160, icon: <Monitor className="w-5 h-5" />, category: 'screen' },
  { label: 'Présentation 16:9', width: 1280, height: 720, icon: <Monitor className="w-5 h-5" />, category: 'screen' },
  { label: 'Instagram Post', width: 1080, height: 1080, icon: <Image className="w-5 h-5" />, category: 'social' },
  { label: 'Instagram Story', width: 1080, height: 1920, icon: <Smartphone className="w-5 h-5" />, category: 'social' },
  { label: 'Facebook Cover', width: 820, height: 312, icon: <Image className="w-5 h-5" />, category: 'social' },
  { label: 'Twitter Post', width: 1200, height: 675, icon: <Image className="w-5 h-5" />, category: 'social' },
  { label: 'LinkedIn Banner', width: 1584, height: 396, icon: <Image className="w-5 h-5" />, category: 'social' },
]

const BG_COLORS = [
  '#ffffff', '#f5f5f5', '#e5e5e5', '#0f0f0f', '#1a1a1a', '#000000',
  '#fef2f2', '#fef9c3', '#ecfdf5', '#eff6ff', '#f5f3ff', '#fdf2f8',
]

const CATEGORIES = [
  { key: 'all', label: 'Tous' },
  { key: 'print', label: 'Impression' },
  { key: 'screen', label: 'Écran' },
  { key: 'social', label: 'Réseaux sociaux' },
  { key: 'custom', label: 'Personnalisé' },
]

export function NewDocumentPanel({ onConfirm, loading }: NewDocumentPanelProps) {
  const [title, setTitle] = useState('Sans titre')
  const [selectedPreset, setSelectedPreset] = useState<number | null>(null)
  const [customWidth, setCustomWidth] = useState(1200)
  const [customHeight, setCustomHeight] = useState(900)
  const [bgColor, setBgColor] = useState('#ffffff')
  const [customBgColor, setCustomBgColor] = useState('#ffffff')
  const [activeCategory, setActiveCategory] = useState('all')

  const isCustom = activeCategory === 'custom' || selectedPreset === null

  const currentWidth = selectedPreset !== null ? FORMAT_PRESETS[selectedPreset].width : customWidth
  const currentHeight = selectedPreset !== null ? FORMAT_PRESETS[selectedPreset].height : customHeight

  const filteredPresets = activeCategory === 'all' || activeCategory === 'custom'
    ? FORMAT_PRESETS
    : FORMAT_PRESETS.filter((p) => p.category === activeCategory)

  const handleSelectPreset = (index: number) => {
    const realIndex = FORMAT_PRESETS.indexOf(filteredPresets[index])
    setSelectedPreset(realIndex)
    if (activeCategory === 'custom') setActiveCategory('all')
  }

  const handleCustom = () => {
    setActiveCategory('custom')
    setSelectedPreset(null)
  }

  const handleSubmit = () => {
    if (!title.trim()) return
    onConfirm({
      title: title.trim(),
      canvasWidth: currentWidth,
      canvasHeight: currentHeight,
      canvasBg: bgColor === 'custom' ? customBgColor : bgColor,
    })
  }

  // Preview ratio
  const maxPreviewSize = 200
  const ratio = Math.min(maxPreviewSize / currentWidth, maxPreviewSize / currentHeight)
  const previewW = currentWidth * ratio
  const previewH = currentHeight * ratio

  return (
    <div className="max-w-5xl mx-auto">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left: Formats */}
        <div className="lg:col-span-2 space-y-6">
          {/* Title */}
          <div>
            <label className="text-xs text-white/50 mb-1.5 block font-medium uppercase tracking-wider">Nom du document</label>
            <input
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleSubmit() }}
              className="w-full max-w-md bg-[#111] border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white placeholder-white/20 focus:outline-none focus:border-indigo-500 transition-colors"
              placeholder="Sans titre"
            />
          </div>

          {/* Category tabs */}
          <div>
            <label className="text-xs text-white/50 mb-3 block font-medium uppercase tracking-wider">Format</label>
            <div className="flex gap-1 mb-4">
              {CATEGORIES.map((cat) => (
                <button
                  key={cat.key}
                  onClick={() => cat.key === 'custom' ? handleCustom() : (setActiveCategory(cat.key))}
                  className={`px-3 py-1.5 text-xs rounded-md transition-colors ${
                    activeCategory === cat.key
                      ? 'bg-indigo-500 text-white'
                      : 'text-white/50 hover:text-white hover:bg-white/5'
                  }`}
                >
                  {cat.label}
                </button>
              ))}
            </div>

            {/* Presets grid */}
            {activeCategory !== 'custom' && (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {filteredPresets.map((preset, i) => {
                  const realIndex = FORMAT_PRESETS.indexOf(preset)
                  return (
                    <button
                      key={preset.label}
                      onClick={() => handleSelectPreset(i)}
                      className={`flex items-center gap-3 p-3 rounded-lg border transition-all text-left ${
                        selectedPreset === realIndex
                          ? 'border-indigo-500 bg-indigo-500/10'
                          : 'border-white/10 hover:border-white/20 bg-[#1a1a1a]'
                      }`}
                    >
                      <div className={`${selectedPreset === realIndex ? 'text-indigo-400' : 'text-white/30'}`}>
                        {preset.icon}
                      </div>
                      <div>
                        <p className="text-sm text-white font-medium">{preset.label}</p>
                        <p className="text-xs text-white/30">{preset.width} x {preset.height} px</p>
                      </div>
                    </button>
                  )
                })}
              </div>
            )}

            {/* Custom size */}
            {activeCategory === 'custom' && (
              <div className="flex items-center gap-4">
                <div>
                  <label className="text-xs text-white/40 mb-1 block">Largeur (px)</label>
                  <input
                    type="number"
                    value={customWidth}
                    onChange={(e) => setCustomWidth(Math.max(100, parseInt(e.target.value) || 100))}
                    className="w-32 bg-[#111] border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
                  />
                </div>
                <span className="text-white/20 mt-5">x</span>
                <div>
                  <label className="text-xs text-white/40 mb-1 block">Hauteur (px)</label>
                  <input
                    type="number"
                    value={customHeight}
                    onChange={(e) => setCustomHeight(Math.max(100, parseInt(e.target.value) || 100))}
                    className="w-32 bg-[#111] border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Background color */}
          <div>
            <label className="text-xs text-white/50 mb-3 block font-medium uppercase tracking-wider">Couleur de fond</label>
            <div className="flex gap-2 flex-wrap items-center">
              {BG_COLORS.map((color) => (
                <button
                  key={color}
                  onClick={() => setBgColor(color)}
                  className={`w-8 h-8 rounded-lg border-2 transition-all ${
                    bgColor === color ? 'border-indigo-500 scale-110' : 'border-white/10 hover:border-white/30'
                  }`}
                  style={{ backgroundColor: color }}
                />
              ))}
              <div className="flex items-center gap-1.5 ml-2">
                <button
                  onClick={() => setBgColor('custom')}
                  className={`w-8 h-8 rounded-lg border-2 transition-all flex items-center justify-center ${
                    bgColor === 'custom' ? 'border-indigo-500 scale-110' : 'border-white/10 hover:border-white/30'
                  }`}
                  style={{ background: 'conic-gradient(red, yellow, lime, aqua, blue, magenta, red)' }}
                />
                {bgColor === 'custom' && (
                  <input
                    type="color"
                    value={customBgColor}
                    onChange={(e) => setCustomBgColor(e.target.value)}
                    className="w-8 h-8 rounded cursor-pointer bg-transparent border-0"
                  />
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Right: Preview + Create */}
        <div className="space-y-6">
          <div className="bg-[#1a1a1a] border border-white/10 rounded-xl p-6 flex flex-col items-center gap-5">
            <p className="text-xs text-white/50 font-medium uppercase tracking-wider self-start">Aperçu</p>

            {/* Preview canvas */}
            <div className="flex items-center justify-center" style={{ width: maxPreviewSize, height: maxPreviewSize }}>
              <div
                className="border border-white/20 shadow-lg"
                style={{
                  width: previewW,
                  height: previewH,
                  backgroundColor: bgColor === 'custom' ? customBgColor : bgColor,
                }}
              />
            </div>

            {/* Dimensions */}
            <div className="text-center">
              <p className="text-sm text-white font-medium">
                {currentWidth} x {currentHeight} px
              </p>
              <p className="text-xs text-white/30 mt-1">
                {(currentWidth / 96 * 25.4).toFixed(0)} x {(currentHeight / 96 * 25.4).toFixed(0)} mm
              </p>
            </div>

            {/* Create button */}
            <button
              onClick={handleSubmit}
              disabled={loading || !title.trim()}
              className="w-full flex items-center justify-center gap-2 bg-indigo-500 hover:bg-indigo-600 disabled:opacity-50 text-white font-medium px-6 py-3 rounded-lg transition-colors text-sm"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Création...
                </>
              ) : (
                <>
                  <LayoutGrid className="w-4 h-4" />
                  Créer le document
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
