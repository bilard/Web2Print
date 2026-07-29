import { useState } from 'react'
import { FileText, Monitor, Smartphone, Image, LayoutGrid, Loader2 } from 'lucide-react'
import { BackgroundPicker, backgroundCss, type BackgroundValue } from './BackgroundPicker'
import { DEFAULT_GRADIENT } from './GradientPicker'
import { useCan } from '@/features/access/useAccess'
import { OptionHelp } from '@/components/shared/OptionHelp'
import { useTranslation, type TranslationKey } from '@/lib/i18n'
import type { CanvasBgType } from '@/stores/ui.store'
import type { GradientConfig } from '@/stores/editor.store'

export interface DocumentConfig {
  title: string
  canvasWidth: number
  canvasHeight: number
  /** Couleur unie (utilisée quand `canvasBgType === 'solid'`). */
  canvasBg: string
  canvasBgType: CanvasBgType
  canvasBgGradient: GradientConfig
  canvasBgImage: string | null
}

interface NewDocumentPanelProps {
  onConfirm: (config: DocumentConfig) => void
  loading: boolean
}

interface FormatPreset {
  /** Clé React stable : le libellé traduit changerait à chaque bascule de langue. */
  id: string
  labelKey: TranslationKey
  width: number
  height: number
  icon: React.ReactNode
  category: string
}

const FORMAT_PRESETS: FormatPreset[] = [
  { id: 'a4-portrait', labelKey: 'newdoc.preset.a4Portrait', width: 794, height: 1123, icon: <FileText className="w-5 h-5" />, category: 'print' },
  { id: 'a4-landscape', labelKey: 'newdoc.preset.a4Landscape', width: 1123, height: 794, icon: <FileText className="w-5 h-5" />, category: 'print' },
  { id: 'a3-portrait', labelKey: 'newdoc.preset.a3Portrait', width: 1123, height: 1587, icon: <FileText className="w-5 h-5" />, category: 'print' },
  { id: 'a3-landscape', labelKey: 'newdoc.preset.a3Landscape', width: 1587, height: 1123, icon: <FileText className="w-5 h-5" />, category: 'print' },
  { id: 'a5-portrait', labelKey: 'newdoc.preset.a5Portrait', width: 559, height: 794, icon: <FileText className="w-5 h-5" />, category: 'print' },
  { id: 'letter', labelKey: 'newdoc.preset.letter', width: 816, height: 1056, icon: <FileText className="w-5 h-5" />, category: 'print' },
  { id: 'full-hd', labelKey: 'newdoc.preset.fullHd', width: 1920, height: 1080, icon: <Monitor className="w-5 h-5" />, category: 'screen' },
  { id: '4k', labelKey: 'newdoc.preset.4k', width: 3840, height: 2160, icon: <Monitor className="w-5 h-5" />, category: 'screen' },
  { id: 'slide-16-9', labelKey: 'newdoc.preset.slide169', width: 1280, height: 720, icon: <Monitor className="w-5 h-5" />, category: 'screen' },
  { id: 'ig-post', labelKey: 'newdoc.preset.igPost', width: 1080, height: 1080, icon: <Image className="w-5 h-5" />, category: 'social' },
  { id: 'ig-story', labelKey: 'newdoc.preset.igStory', width: 1080, height: 1920, icon: <Smartphone className="w-5 h-5" />, category: 'social' },
  { id: 'fb-cover', labelKey: 'newdoc.preset.fbCover', width: 820, height: 312, icon: <Image className="w-5 h-5" />, category: 'social' },
  { id: 'twitter-post', labelKey: 'newdoc.preset.twitterPost', width: 1200, height: 675, icon: <Image className="w-5 h-5" />, category: 'social' },
  { id: 'linkedin-banner', labelKey: 'newdoc.preset.linkedinBanner', width: 1584, height: 396, icon: <Image className="w-5 h-5" />, category: 'social' },
]

// ⚠️ `key` reste la clé de FILTRAGE (comparée à `p.category`) : seul le libellé
// est traduit. Traduire `key` casserait le filtre sans lever d'erreur.
const CATEGORIES: { key: string; labelKey: TranslationKey }[] = [
  { key: 'all',    labelKey: 'newdoc.cat.all' },
  { key: 'print',  labelKey: 'newdoc.cat.print' },
  { key: 'screen', labelKey: 'newdoc.cat.screen' },
  { key: 'social', labelKey: 'newdoc.cat.social' },
  { key: 'custom', labelKey: 'newdoc.cat.custom' },
]

export function NewDocumentPanel({ onConfirm, loading }: NewDocumentPanelProps) {
  const canCreate = useCan('library.create')
  const { t } = useTranslation()
  const [title, setTitle] = useState('')
  const [selectedPreset, setSelectedPreset] = useState<number | null>(null)
  const [customWidth, setCustomWidth] = useState(1200)
  const [customHeight, setCustomHeight] = useState(900)
  const [bg, setBg] = useState<BackgroundValue>({
    type: 'solid',
    color: '#ffffff',
    gradient: DEFAULT_GRADIENT,
    image: null,
  })
  const [activeCategory, setActiveCategory] = useState('all')

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
    onConfirm({
      // Titre vide ⇒ « Sans titre » DANS LA LANGUE ACTIVE (avant, la valeur
      // française était écrite en dur dans l'état initial du champ).
      title: title.trim() || t('newdoc.untitled'),
      canvasWidth: currentWidth,
      canvasHeight: currentHeight,
      canvasBg: bg.color,
      canvasBgType: bg.type,
      canvasBgGradient: bg.gradient,
      canvasBgImage: bg.image,
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
          <div data-tour="opt-newdoc-name">
            <label className="text-xs text-white/50 mb-1.5 flex items-center gap-1 font-medium uppercase tracking-wider">
              {t('newdoc.name')}
              <OptionHelp text={t('newdoc.name.help')} />
            </label>
            <input
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleSubmit() }}
              className="w-full max-w-md bg-surface-2 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white placeholder-white/20 focus:outline-none focus:border-indigo-500 transition-colors"
              placeholder={t('newdoc.untitled')}
            />
          </div>

          {/* Category tabs */}
          <div data-tour="opt-newdoc-format">
            <label className="text-xs text-white/50 mb-3 flex items-center gap-1 font-medium uppercase tracking-wider">
              {t('newdoc.format')}
              <OptionHelp text={t('newdoc.format.help')} />
            </label>
            <div className="flex gap-1 mb-4">
              {CATEGORIES.map((cat) => (
                <button
                  key={cat.key}
                  onClick={() => cat.key === 'custom' ? handleCustom() : (setActiveCategory(cat.key))}
                  className={`px-3 py-1.5 text-xs rounded-md transition-colors ${
                    activeCategory === cat.key
                      ? 'bg-indigo-500 text-[#fff]'
                      : 'text-white/50 hover:text-white hover:bg-white/5'
                  }`}
                >
                  {t(cat.labelKey)}
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
                      key={preset.id}
                      onClick={() => handleSelectPreset(i)}
                      className={`flex items-center gap-3 p-3 rounded-lg border transition-all text-left ${
                        selectedPreset === realIndex
                          ? 'border-indigo-500 bg-indigo-500/10'
                          : 'border-white/10 hover:border-white/20 bg-surface'
                      }`}
                    >
                      <div className={`${selectedPreset === realIndex ? 'text-indigo-400' : 'text-white/30'}`}>
                        {preset.icon}
                      </div>
                      <div>
                        <p className="text-sm text-white font-medium">{t(preset.labelKey)}</p>
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
                  <label className="text-xs text-white/40 mb-1 block">{t('newdoc.width')}</label>
                  <input
                    type="number"
                    value={customWidth}
                    onChange={(e) => setCustomWidth(Math.max(100, parseInt(e.target.value) || 100))}
                    className="w-32 bg-surface-2 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
                  />
                </div>
                <span className="text-white/20 mt-5">x</span>
                <div>
                  <label className="text-xs text-white/40 mb-1 block">{t('newdoc.height')}</label>
                  <input
                    type="number"
                    value={customHeight}
                    onChange={(e) => setCustomHeight(Math.max(100, parseInt(e.target.value) || 100))}
                    className="w-32 bg-surface-2 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Background — solid / gradient / image */}
          <div data-tour="opt-newdoc-bg">
            <label className="text-xs text-white/50 mb-3 flex items-center gap-1 font-medium uppercase tracking-wider">
              {t('newdoc.background')}
              <OptionHelp text={t('newdoc.background.help')} />
            </label>
            <BackgroundPicker value={bg} onChange={setBg} />
          </div>
        </div>

        {/* Right: Preview + Create */}
        <div className="space-y-6">
          <div className="bg-surface border border-white/10 rounded-xl p-6 flex flex-col items-center gap-5">
            <p className="text-xs text-white/50 font-medium uppercase tracking-wider self-start">{t('newdoc.preview')}</p>

            {/* Preview canvas */}
            <div className="flex items-center justify-center" style={{ width: maxPreviewSize, height: maxPreviewSize }}>
              <div
                className="border border-white/20 shadow-lg"
                style={{
                  width: previewW,
                  height: previewH,
                  background: backgroundCss(bg),
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
            {canCreate && (
              <button
                onClick={handleSubmit}
                disabled={loading}
                className="w-full flex items-center justify-center gap-2 bg-indigo-500 hover:bg-indigo-600 disabled:opacity-50 text-[#fff] font-medium px-6 py-3 rounded-lg transition-colors text-sm"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    {t('newdoc.creating')}
                  </>
                ) : (
                  <>
                    <LayoutGrid className="w-4 h-4" />
                    {t('newdoc.create')}
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
