import { useCallback, useEffect, useRef, useState } from 'react'
import {
  X, Heart, Bookmark, Plus, Download, ExternalLink,
  Ruler, Palette, MonitorSmartphone, MapPin, Tag, Sparkles, Loader2, Info, Camera,
  Type, Award, Smile, Brush, Crop, Sun,
  MessageSquareText, Wand2, Copy, Check,
} from 'lucide-react'
import { httpsCallable } from 'firebase/functions'
import { functions } from '../../../lib/firebase/config'
import { useDamStore } from '../../../stores/dam.store'
import { useUIStore } from '../../../stores/ui.store'
import { useDamFavorites } from '../hooks/useDamFavorites'
import { useDamSaveImage } from '../hooks/useDamSaveImage'
import { useDamCanvasInsert } from '../hooks/useDamCanvasInsert'
import { useDamVariants } from '../hooks/useDamVariants'
import { renderEditedImage, buildCssFilter, buildMaskClipPath, DEFAULT_MASK } from '../utils/renderEditedImage'
import {
  DamImageToolbar, DEFAULT_FILTERS,
  type ColorFilters, type ActiveTool,
} from './DamImageToolbar'
import { DamCropOverlay } from './DamCropOverlay'
import { DamVariantsPanel } from './DamVariantsPanel'
import type { DamCropMask, DamImageVariant, DamVariantEdits } from '../types'

interface ImageAnalysis {
  subject: string
  description: string
  labels: string[]
  colors: string[]
  objects: string[]
  text: string[]
  brands: string[]
  mood: string
  style: string
  composition: string
  lighting: string
  tags: string[]
}

const analyzeImageFn = httpsCallable<{ imageUrl: string }, ImageAnalysis>(
  functions,
  'damAnalyzeImage'
)

function InfoRow({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: React.ReactNode }) {
  if (!value) return null
  return (
    <div className="flex items-start gap-2.5 py-1.5">
      <Icon className="w-3.5 h-3.5 text-white/30 mt-0.5 shrink-0" />
      <div className="min-w-0">
        <div className="text-[9px] text-white/30 uppercase tracking-wider">{label}</div>
        <div className="text-[11px] text-white/70 mt-0.5 break-words">{value}</div>
      </div>
    </div>
  )
}

export function DamLightbox() {
  const { lightboxImage, closeLightbox } = useDamStore()
  const damPickerMode = useUIStore((s) => s.damPickerMode)
  const damPickerTargetId = useUIStore((s) => s.damPickerTargetId)
  const setDamPickerOpen = useUIStore((s) => s.setDamPickerOpen)
  const { isFavorite, toggleFavorite } = useDamFavorites()
  const { isSaved, toggleSave } = useDamSaveImage()
  const { insertOnCanvas, replaceOnCanvas } = useDamCanvasInsert()
  const [analysis, setAnalysis] = useState<ImageAnalysis | null>(null)
  const [analyzing, setAnalyzing] = useState(false)
  const [fileSize, setFileSize] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'infos' | 'prompts' | 'analysis'>('infos')
  const [copiedPrompt, setCopiedPrompt] = useState<'original' | 'improved' | null>(null)

  // Editing state
  const [zoom, setZoom] = useState(1)
  const [rotation, setRotation] = useState(0)
  const [flipH, setFlipH] = useState(false)
  const [flipV, setFlipV] = useState(false)
  const [filters, setFilters] = useState<ColorFilters>(DEFAULT_FILTERS)
  const [activeTool, setActiveTool] = useState<ActiveTool>(null)
  const [mask, setMask] = useState<DamCropMask>({ ...DEFAULT_MASK })
  const [cropRatio, setCropRatio] = useState<number | null>(null)
  const [variantsPanelOpen, setVariantsPanelOpen] = useState(false)
  const [loadedVariantId, setLoadedVariantId] = useState<string | null>(null)
  const imgContainerRef = useRef<HTMLDivElement>(null)

  // Variants
  const {
    variants,
    loading: variantsLoading,
    saving: savingVariant,
    saveVariant,
    updateVariant,
    deleteVariant,
    renameVariant,
    recoverOrphans,
  } = useDamVariants(lightboxImage?.id ?? null)

  useEffect(() => {
    if (!lightboxImage) {
      setAnalysis(null)
      setFileSize(null)
      setActiveTab('infos')
      resetEditing()
      return
    }
    // Reset l'onglet actif au change d'image (sinon on garde "Prompts" sur une
    // image qui n'en a pas → onglet vide).
    setActiveTab('infos')
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeLightbox()
    }
    window.addEventListener('keydown', handler)

    fetch(lightboxImage.fullUrl, { method: 'HEAD' })
      .then((res) => {
        const len = res.headers.get('content-length')
        if (len) {
          const bytes = parseInt(len, 10)
          if (bytes > 1024 * 1024) setFileSize(`${(bytes / (1024 * 1024)).toFixed(1)} MB`)
          else setFileSize(`${(bytes / 1024).toFixed(0)} KB`)
        }
      })
      .catch(() => {})

    return () => window.removeEventListener('keydown', handler)
  }, [lightboxImage, closeLightbox])

  // Mouse wheel zoom
  useEffect(() => {
    const container = imgContainerRef.current
    if (!container || !lightboxImage) return
    const handler = (e: WheelEvent) => {
      e.preventDefault()
      const delta = e.deltaY > 0 ? -0.1 : 0.1
      setZoom((z) => Math.min(5, Math.max(0.1, z + delta)))
    }
    container.addEventListener('wheel', handler, { passive: false })
    return () => container.removeEventListener('wheel', handler)
  }, [lightboxImage])

  const resetEditing = useCallback(() => {
    setZoom(1)
    setRotation(0)
    setFlipH(false)
    setFlipV(false)
    setFilters(DEFAULT_FILTERS)
    setActiveTool(null)
    setMask({ ...DEFAULT_MASK })
    setCropRatio(null)
    setLoadedVariantId(null)
  }, [])

  const currentEdits = useCallback<() => DamVariantEdits>(
    () => ({ zoom, rotation, flipH, flipV, filters, mask }),
    [zoom, rotation, flipH, flipV, filters, mask]
  )

  const loadedVariant = loadedVariantId ? variants.find((v) => v.id === loadedVariantId) : null

  const isDirty = (() => {
    const current = { rotation, flipH, flipV, filters, mask }
    const baseline: DamVariantEdits = loadedVariant?.edits ?? {
      zoom: 1,
      rotation: 0,
      flipH: false,
      flipV: false,
      filters: DEFAULT_FILTERS,
      mask: { ...DEFAULT_MASK },
    }
    if (current.rotation !== baseline.rotation) return true
    if (current.flipH !== baseline.flipH) return true
    if (current.flipV !== baseline.flipV) return true
    const f = current.filters
    const bf = baseline.filters
    if (f.brightness !== bf.brightness || f.contrast !== bf.contrast || f.saturation !== bf.saturation || f.hue !== bf.hue) return true
    const m = current.mask
    const bm = baseline.mask ?? DEFAULT_MASK
    if (m.enabled !== bm.enabled || m.x !== bm.x || m.y !== bm.y || m.width !== bm.width || m.height !== bm.height) return true
    return false
  })()

  const handleSaveVariant = useCallback(
    async (name: string) => {
      if (!lightboxImage) return
      try {
        await saveVariant(lightboxImage, currentEdits(), name)
        setVariantsPanelOpen(true)
      } catch (err) {
        console.error('Save variant failed:', err)
        alert('Erreur lors de la sauvegarde de la variante')
      }
    },
    [lightboxImage, saveVariant, currentEdits]
  )

  const handleUpdateVariant = useCallback(async () => {
    if (!lightboxImage || !loadedVariantId) return
    const target = variants.find((v) => v.id === loadedVariantId)
    if (!target) return
    try {
      await updateVariant(target, lightboxImage, currentEdits())
    } catch (err) {
      console.error('Update variant failed:', err)
      alert('Erreur lors de la mise à jour de la variante')
    }
  }, [lightboxImage, loadedVariantId, variants, updateVariant, currentEdits])

  const handleLoadVariant = useCallback((v: DamImageVariant) => {
    setZoom(v.edits.zoom)
    setRotation(v.edits.rotation)
    setFlipH(v.edits.flipH)
    setFlipV(v.edits.flipV)
    setFilters(v.edits.filters)
    setMask(v.edits.mask ?? { ...DEFAULT_MASK })
    setCropRatio(null)
    setLoadedVariantId(v.id)
  }, [])

  const handleAnalyze = useCallback(async () => {
    if (!lightboxImage || analyzing) return
    setAnalyzing(true)
    try {
      const result = await analyzeImageFn({ imageUrl: lightboxImage.previewUrl })
      setAnalysis(result.data)
    } catch (err) {
      console.error('Image analysis failed:', err)
    } finally {
      setAnalyzing(false)
    }
  }, [lightboxImage, analyzing])

  const handleFiltersChange = useCallback(
    (partial: Partial<ColorFilters>) => setFilters((f) => ({ ...f, ...partial })),
    []
  )

  const handleExport = useCallback(
    async (format: string, quality: number, scale: number) => {
      if (!lightboxImage) return
      try {
        const { blob } = await renderEditedImage(lightboxImage.fullUrl, currentEdits(), {
          format: format as 'image/png' | 'image/jpeg' | 'image/webp',
          quality: quality / 100,
          scale,
        })
        const ext = format === 'image/png' ? 'png' : format === 'image/webp' ? 'webp' : 'jpg'
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `dam-export-${Date.now()}.${ext}`
        a.click()
        URL.revokeObjectURL(url)
      } catch (err) {
        console.error('Export failed:', err)
      }
    },
    [lightboxImage, currentEdits]
  )

  if (!lightboxImage) return null

  const image = lightboxImage
  const isProjectImage = image.sourceProvider === 'project'
  const fav = isFavorite(image.id)
  const saved = isSaved(image.id)
  const megapixels = ((image.width * image.height) / 1_000_000).toFixed(1)
  const aspectRatio = (image.width / image.height).toFixed(2)

  const handleInsert = () => {
    if (damPickerMode === 'replace') {
      replaceOnCanvas(image, damPickerTargetId ?? undefined)
      closeLightbox()
      setDamPickerOpen(false)
    } else {
      insertOnCanvas(image)
      closeLightbox()
    }
  }

  const cssFilter = buildCssFilter(filters)
  const transform = `scale(${zoom}) rotate(${rotation}deg) scaleX(${flipH ? -1 : 1}) scaleY(${flipV ? -1 : 1})`
  // Apply the mask via CSS clip-path when not actively cropping. In crop mode the
  // overlay handles the visualization so we render the full image underneath.
  const clipPath = activeTool !== 'crop' ? buildMaskClipPath(mask, flipH, flipV) : undefined

  return (
    <div className="fixed inset-0 z-[100] bg-black/90 flex" onClick={closeLightbox}>
      {/* Main area */}
      <div className="flex-1 flex flex-col min-w-0" onClick={(e) => e.stopPropagation()}>
        {/* Action toolbar */}
        <div className="flex items-center justify-between px-4 py-2.5 shrink-0">
          <div className="flex items-center gap-2">
            <button
              onClick={() => toggleFavorite(image)}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs transition ${
                fav ? 'bg-red-500/20 text-red-400' : 'bg-white/10 text-white/60 hover:bg-white/15'
              }`}
            >
              <Heart className="w-3.5 h-3.5" fill={fav ? 'currentColor' : 'none'} />
              {fav ? 'Favori' : 'Favoris'}
            </button>
            <button
              onClick={() => toggleSave(image)}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs transition ${
                saved ? 'bg-indigo-500/20 text-indigo-400' : 'bg-white/10 text-white/60 hover:bg-white/15'
              }`}
            >
              <Bookmark className="w-3.5 h-3.5" fill={saved ? 'currentColor' : 'none'} />
              {saved ? 'Sauvegardée' : 'Sauvegarder'}
            </button>
            <button
              onClick={handleInsert}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs bg-indigo-500 text-white hover:bg-indigo-600 transition"
            >
              <Plus className="w-3.5 h-3.5" />
              {damPickerMode === 'replace' ? 'Remplacer' : 'Canvas'}
            </button>
            <a
              href={image.fullUrl}
              target="_blank"
              rel="noopener"
              download
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs bg-white/10 text-white/60 hover:bg-white/15 transition"
            >
              <Download className="w-3.5 h-3.5" />
              Télécharger
            </a>
          </div>
          <button onClick={closeLightbox} className="p-1.5 rounded-lg text-white/40 hover:text-white hover:bg-white/10">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Edit toolbar */}
        <DamImageToolbar
          zoom={zoom}
          onZoomChange={setZoom}
          rotation={rotation}
          onRotate={() => setRotation((r) => (r + 90) % 360)}
          flipH={flipH}
          onFlipH={() => setFlipH((v) => !v)}
          flipV={flipV}
          onFlipV={() => setFlipV((v) => !v)}
          filters={filters}
          onFiltersChange={handleFiltersChange}
          activeTool={activeTool}
          onToolChange={setActiveTool}
          onExport={handleExport}
          mask={mask}
          onMaskChange={setMask}
          cropRatio={cropRatio}
          onCropRatioChange={setCropRatio}
          onReset={resetEditing}
          imageWidth={image.width}
          imageHeight={image.height}
          onSaveVariant={handleSaveVariant}
          onUpdateVariant={handleUpdateVariant}
          isVariantLoaded={loadedVariantId !== null}
          saving={savingVariant}
          variantsCount={variants.length}
          variantsPanelOpen={variantsPanelOpen}
          onToggleVariantsPanel={() => setVariantsPanelOpen((v) => !v)}
          isDirty={isDirty}
        />

        {/* Image */}
        <div
          ref={imgContainerRef}
          className="flex-1 flex items-center justify-center min-h-0 px-4 pb-4 overflow-hidden relative"
        >
          <div className="relative" style={{ transform }}>
            <img
              src={image.fullUrl}
              alt={image.description}
              onClick={clipPath ? () => setActiveTool('crop') : undefined}
              className={`max-w-full max-h-[calc(100vh-180px)] object-contain rounded-lg transition-[filter] duration-150 ${
                clipPath ? 'cursor-pointer' : ''
              }`}
              style={{ filter: cssFilter, clipPath }}
              title={clipPath ? 'Cliquez pour modifier le masque' : undefined}
              draggable={false}
            />
            {/* Interactive crop overlay — only in crop mode */}
            {activeTool === 'crop' && (
              <DamCropOverlay
                mask={mask}
                onChange={setMask}
                ratio={cropRatio}
                flipH={flipH}
                flipV={flipV}
              />
            )}
          </div>
        </div>
      </div>

      {/* Variants panel */}
      {variantsPanelOpen && (
        <div onClick={(e) => e.stopPropagation()}>
          <DamVariantsPanel
            originalImage={image}
            variants={variants}
            loading={variantsLoading}
            loadedVariantId={loadedVariantId}
            onLoadOriginal={resetEditing}
            onLoadVariant={handleLoadVariant}
            onDelete={deleteVariant}
            onRename={renameVariant}
            onRecoverOrphans={() => recoverOrphans(image)}
          />
        </div>
      )}

      {/* Right panel — Info */}
      <div
        className="w-[280px] bg-[#141414] border-l border-white/5 overflow-y-auto shrink-0 flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {(() => {
          const hasPrompts = !!(image.originalPrompt || image.improvedPrompt)
          const tabs: Array<{ id: 'infos' | 'prompts' | 'analysis'; label: string; icon: React.ElementType; visible: boolean }> = [
            { id: 'infos', label: 'Infos', icon: Info, visible: true },
            { id: 'prompts', label: 'Prompts', icon: MessageSquareText, visible: hasPrompts },
            { id: 'analysis', label: 'Analyse IA', icon: Sparkles, visible: true },
          ]
          const visibleTabs = tabs.filter((t) => t.visible)
          const effectiveTab = visibleTabs.some((t) => t.id === activeTab) ? activeTab : 'infos'
          return (
            <div className="flex border-b border-white/5 shrink-0">
              {visibleTabs.map((t) => {
                const active = effectiveTab === t.id
                return (
                  <button
                    key={t.id}
                    onClick={() => setActiveTab(t.id)}
                    className={`flex-1 flex items-center justify-center gap-1.5 px-2 py-3 text-[11px] font-medium transition border-b-2 ${
                      active
                        ? 'text-white border-indigo-400'
                        : 'text-white/40 hover:text-white/70 border-transparent'
                    }`}
                  >
                    <t.icon className="w-3.5 h-3.5" />
                    {t.label}
                  </button>
                )
              })}
            </div>
          )
        })()}

        {activeTab === 'infos' && (
        <div className="px-4 py-2 flex flex-col divide-y divide-white/5">
          {/* Dimensions */}
          <div className="py-2">
            <InfoRow icon={Ruler} label="Dimensions" value={`${image.width} x ${image.height} px`} />
            <InfoRow icon={MonitorSmartphone} label="Résolution" value={`${megapixels} MP — Ratio ${aspectRatio}`} />
            {fileSize && <InfoRow icon={Info} label="Taille fichier" value={fileSize} />}
            <InfoRow
              icon={Ruler}
              label="Orientation"
              value={image.orientation === 'landscape' ? 'Paysage' : image.orientation === 'portrait' ? 'Portrait' : 'Carré'}
            />
          </div>

          {/* Color */}
          <div className="py-2">
            <InfoRow
              icon={Palette}
              label="Couleur dominante"
              value={
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 rounded border border-white/10" style={{ backgroundColor: image.color }} />
                  <span className="font-mono text-[10px]">{image.color}</span>
                </div>
              }
            />
            <InfoRow icon={Palette} label="Espace colorimétrique" value="sRGB" />
          </div>

          {/* Source (hidden for project-owned images) */}
          {!isProjectImage && (
            <div className="py-2">
              <InfoRow
                icon={MapPin}
                label="Source"
                value={
                  <a href={image.sourceUrl} target="_blank" rel="noopener" className="text-indigo-400 hover:underline flex items-center gap-1">
                    <span className="capitalize">{image.sourceProvider}</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                }
              />
              <InfoRow
                icon={Camera}
                label="Photographe"
                value={
                  <a href={image.photographerUrl} target="_blank" rel="noopener" className="text-indigo-400 hover:underline flex items-center gap-1">
                    {image.photographer}
                    <ExternalLink className="w-3 h-3" />
                  </a>
                }
              />
              <InfoRow icon={Info} label="ID Source" value={<span className="font-mono text-[10px]">{image.sourceId}</span>} />
            </div>
          )}

          {/* Project asset — filename */}
          {isProjectImage && (
            <div className="py-2">
              <InfoRow icon={Info} label="Nom du fichier" value={<span className="font-mono text-[10px] break-all">{image.description}</span>} />
            </div>
          )}

          {/* Description — cachée si l'image a un improvedPrompt (le contenu est
              identique et accessible via l'onglet Prompts, plus structuré). */}
          {image.description && !image.improvedPrompt && (
            <div className="py-2">
              <InfoRow icon={Info} label="Description" value={image.description} />
            </div>
          )}

          {/* Tags */}
          {image.tags && image.tags.length > 0 && (
            <div className="py-2">
              <div className="flex items-start gap-2.5 py-1.5">
                <Tag className="w-3.5 h-3.5 text-white/30 mt-0.5 shrink-0" />
                <div>
                  <div className="text-[9px] text-white/30 uppercase tracking-wider">Tags</div>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {image.tags.map((tag) => (
                      <span key={tag} className="px-1.5 py-0.5 rounded bg-white/5 text-[10px] text-white/50">
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
        )}

        {activeTab === 'prompts' && (image.originalPrompt || image.improvedPrompt) && (
          <div className="px-4 py-3 flex flex-col gap-4">
            {image.originalPrompt && (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-[9px] text-white/40 uppercase tracking-wider">
                    <Wand2 className="w-3 h-3" />
                    Prompt d'origine
                  </div>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(image.originalPrompt ?? '')
                      setCopiedPrompt('original')
                      setTimeout(() => setCopiedPrompt(null), 1500)
                    }}
                    className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] text-white/40 hover:text-white/80 hover:bg-white/5 transition"
                    title="Copier dans le presse-papier"
                  >
                    {copiedPrompt === 'original' ? (
                      <>
                        <Check className="w-3 h-3 text-emerald-400" />
                        <span className="text-emerald-400">Copié</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3 h-3" />
                        Copier
                      </>
                    )}
                  </button>
                </div>
                <div className="text-[11px] text-white/70 leading-relaxed whitespace-pre-wrap bg-white/5 border border-white/10 rounded-lg px-3 py-2">
                  {image.originalPrompt}
                </div>
              </div>
            )}

            {image.improvedPrompt && (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-[9px] text-indigo-300 uppercase tracking-wider">
                    <Sparkles className="w-3 h-3" />
                    Prompt amélioré (envoyé à Nano Banana)
                  </div>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(image.improvedPrompt ?? '')
                      setCopiedPrompt('improved')
                      setTimeout(() => setCopiedPrompt(null), 1500)
                    }}
                    className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] text-white/40 hover:text-white/80 hover:bg-white/5 transition"
                    title="Copier dans le presse-papier"
                  >
                    {copiedPrompt === 'improved' ? (
                      <>
                        <Check className="w-3 h-3 text-emerald-400" />
                        <span className="text-emerald-400">Copié</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3 h-3" />
                        Copier
                      </>
                    )}
                  </button>
                </div>
                <div className="text-[11px] text-white/80 leading-relaxed whitespace-pre-wrap bg-indigo-500/5 border border-indigo-500/20 rounded-lg px-3 py-2">
                  {image.improvedPrompt}
                </div>
              </div>
            )}

            {image.promptClarifications && image.promptClarifications.length > 0 && (
              <div className="space-y-1.5">
                <div className="flex items-center gap-1.5 text-[9px] text-emerald-300 uppercase tracking-wider">
                  <MessageSquareText className="w-3 h-3" />
                  Précisions Q&R ({image.promptClarifications.length})
                </div>
                <ol className="space-y-2">
                  {image.promptClarifications.map((qa, i) => (
                    <li
                      key={i}
                      className="bg-emerald-500/[0.04] border border-emerald-500/20 rounded-lg px-3 py-2"
                    >
                      <div className="text-[10px] text-emerald-300/80 mb-1">
                        {i + 1}. {qa.question}
                      </div>
                      <div className="text-[11px] text-white/80 leading-snug">
                        → {qa.answer}
                      </div>
                    </li>
                  ))}
                </ol>
              </div>
            )}

            {!image.originalPrompt && image.improvedPrompt && (
              <div className="text-[10px] text-white/30 italic px-1">
                Cette image a été générée sans étape d'amélioration IA — seul le prompt final est disponible.
              </div>
            )}
          </div>
        )}

        {activeTab === 'analysis' && (
        <div className="px-4 py-2 flex flex-col divide-y divide-white/5">
          {/* AI Analysis */}
          <div className="py-2">
            {!analysis && !analyzing && (
              <button
                onClick={handleAnalyze}
                className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-indigo-500/10 text-indigo-400 text-xs hover:bg-indigo-500/20 transition"
              >
                <Sparkles className="w-3.5 h-3.5" />
                Analyser avec IA
              </button>
            )}
            {analyzing && (
              <div className="flex items-center justify-center gap-2 py-2 text-xs text-white/40">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                Analyse en cours...
              </div>
            )}
            {analysis && (
              <div className="space-y-2.5">
                <div className="flex items-center gap-1.5 text-[9px] text-indigo-400 uppercase tracking-wider">
                  <Sparkles className="w-3 h-3" />
                  Analyse IA
                </div>

                {/* Subject — prominent */}
                {analysis.subject && (
                  <div className="px-2.5 py-2 rounded-lg bg-indigo-500/10 border border-indigo-500/20">
                    <div className="text-[9px] text-indigo-400 uppercase tracking-wider mb-1">Sujet</div>
                    <div className="text-[12px] text-white/90 font-medium leading-snug">{analysis.subject}</div>
                  </div>
                )}

                {analysis.description && (
                  <InfoRow icon={Info} label="Description" value={analysis.description} />
                )}

                {/* Brands */}
                {analysis.brands.length > 0 && (
                  <div className="py-1">
                    <div className="flex items-center gap-1 text-[9px] text-amber-400/80 uppercase tracking-wider mb-1">
                      <Award className="w-3 h-3" />
                      Marques identifiées
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {analysis.brands.map((b) => (
                        <span
                          key={b}
                          className="px-2 py-0.5 rounded-full bg-amber-500/15 text-[10px] text-amber-300 border border-amber-500/20 font-medium"
                        >
                          {b}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* OCR text */}
                {analysis.text.length > 0 && (
                  <div className="py-1">
                    <div className="flex items-center gap-1 text-[9px] text-emerald-400/80 uppercase tracking-wider mb-1">
                      <Type className="w-3 h-3" />
                      Texte détecté (OCR)
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {analysis.text.map((t, i) => (
                        <span
                          key={`${t}-${i}`}
                          className="px-1.5 py-0.5 rounded bg-emerald-500/10 text-[10px] text-emerald-300 font-mono border border-emerald-500/20"
                        >
                          {t}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Art direction: mood / style / composition / lighting */}
                {(analysis.mood || analysis.style || analysis.composition || analysis.lighting) && (
                  <div className="grid grid-cols-1 gap-1 py-1">
                    {analysis.mood && <InfoRow icon={Smile} label="Ambiance" value={analysis.mood} />}
                    {analysis.style && <InfoRow icon={Brush} label="Style" value={analysis.style} />}
                    {analysis.composition && <InfoRow icon={Crop} label="Composition" value={analysis.composition} />}
                    {analysis.lighting && <InfoRow icon={Sun} label="Éclairage" value={analysis.lighting} />}
                  </div>
                )}

                {analysis.labels.length > 0 && (
                  <div className="py-1">
                    <div className="text-[9px] text-white/30 uppercase tracking-wider mb-1">Labels</div>
                    <div className="flex flex-wrap gap-1">
                      {analysis.labels.map((label) => (
                        <span key={label} className="px-1.5 py-0.5 rounded bg-indigo-500/10 text-[10px] text-indigo-300">
                          {label}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {analysis.objects.length > 0 && (
                  <div className="py-1">
                    <div className="text-[9px] text-white/30 uppercase tracking-wider mb-1">Objets détectés</div>
                    <div className="flex flex-wrap gap-1">
                      {analysis.objects.map((obj) => (
                        <span key={obj} className="px-1.5 py-0.5 rounded bg-white/5 text-[10px] text-white/50">
                          {obj}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {analysis.tags.length > 0 && (
                  <div className="py-1">
                    <div className="text-[9px] text-white/30 uppercase tracking-wider mb-1">Tags recherche</div>
                    <div className="flex flex-wrap gap-1">
                      {analysis.tags.map((t) => (
                        <span key={t} className="px-1.5 py-0.5 rounded bg-white/5 text-[10px] text-white/60">
                          #{t}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {analysis.colors.length > 0 && (
                  <div className="py-1">
                    <div className="text-[9px] text-white/30 uppercase tracking-wider mb-1">Palette</div>
                    <div className="flex gap-1">
                      {analysis.colors.map((c) => (
                        <div key={c} className="flex flex-col items-center gap-0.5">
                          <div className="w-6 h-6 rounded border border-white/10" style={{ backgroundColor: c }} />
                          <span className="font-mono text-[8px] text-white/30">{c}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
        )}
      </div>
    </div>
  )
}

