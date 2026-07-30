import { useRef, useState, useEffect, type ComponentProps } from 'react'
import {
  X, AlignLeft, AlignCenter, AlignRight, AlignJustify,
  ChevronsUp, ArrowUp, ArrowDown, ChevronsDown, FlipHorizontal, FlipVertical,
  AlignStartVertical, AlignCenterHorizontal, AlignEndHorizontal,
  AlignStartHorizontal, AlignCenterVertical, AlignEndVertical,
  Lock, Unlock, Link, Unlink, GalleryHorizontalEnd, GalleryVerticalEnd,
  Copy, Trash2, Minimize2, ImagePlus, ChevronDown,
  Image as ImageIcon, FolderOpen, Heart, FolderHeart, Clock, Sparkles, Upload,
} from 'lucide-react'
import { Shadow } from 'fabric'
import { useShallow } from 'zustand/react/shallow'
import { useEditorStore } from '@/stores/editor.store'
import { getDynamicFontVariants } from '@/features/assets/useFonts'
import { EditorFontOptions } from '@/features/fonts/EditorFontOptions'
import { UserFontsPanel } from '@/features/fonts/UserFontsPanel'
import { useTextEditor, getCurrentTextStyle } from '@/features/editor/useTextEditor'
import { useObjectOperations } from '@/features/editor/useObjectOperations'
import { globalFabricCanvas } from '@/features/editor/globalCanvas'
import { syncToStore } from '@/features/editor/useAddObject'
import { applyImageFill as applyImageFillUtil } from '@/features/editor/applyImageFill'
import { ColorPicker } from '@/components/shared/ColorPicker'
import { GradientPicker, gradientToFabric, DEFAULT_GRADIENT } from '@/components/shared/GradientPicker'
import { PropertySection } from '@/components/shared/panel'
import type { Canvas } from 'fabric'
import type { GradientConfig, CanvasObjectProps } from '@/stores/editor.store'
import { useNanoBanaStore } from '@/stores/nanobana.store'
import { useImageGallery } from '@/features/nanobana/useImageGallery'
import { useUIStore } from '@/stores/ui.store'
import { useDamStore } from '@/stores/dam.store'
import type { DamTab } from '@/features/dam/types'
import { ImageMaskSection } from './ImageMaskSection'
import { findStoreObjectDeep, findFabricObjectDeep } from '@/features/editor/deepObjects'
import { MergeConnectorSection } from './MergeConnectorSection'
import { ConditionalRulesSection } from './ConditionalRulesSection'
import { TextFrameSection, ParagraphIndentsSection } from './TextFrameSection'
import { applyTextFrame, isTextFrame } from '@/features/editor/textFrame'
import { useTranslation, type TranslationKey } from '@/lib/i18n'

const FILL_IMAGE_SOURCES: { tab: DamTab; labelKey: TranslationKey; icon: typeof ImageIcon }[] = [
  { tab: 'stock', labelKey: 'props.tab.stock', icon: ImageIcon },
  { tab: 'my-images', labelKey: 'props.tab.myImages', icon: FolderOpen },
  { tab: 'favorites', labelKey: 'props.tab.favorites', icon: Heart },
  { tab: 'collections', labelKey: 'props.tab.collections', icon: FolderHeart },
  { tab: 'recent', labelKey: 'props.tab.recent', icon: Clock },
  { tab: 'generate', labelKey: 'props.tab.generate', icon: Sparkles },
]

// ── Image fill picker (galerie + upload) ────────────────────────────────────

function ImageFillPicker({ fillImage, objId, applyImageFill }: {
  fillImage: string | null
  objId: string
  applyImageFill: (fObj: any, canvas: Canvas, url: string) => void
}) {
  const { t } = useTranslation()
  const galleryImages = useNanoBanaStore((s) => s.images)
  const { uploadToGallery } = useImageGallery()
  const openDamPickerForFill = useUIStore((s) => s.openDamPickerForFill)
  const setActiveDamTab = useDamStore((s) => s.setActiveTab)
  const [uploading, setUploading] = useState(false)
  const [brokenIds, setBrokenIds] = useState<Set<string>>(new Set())
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Fermer le menu quand on clique ailleurs
  useEffect(() => {
    if (!menuOpen) return
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [menuOpen])

  const applyUrl = (url: string, name?: string) => {
    const canvas = globalFabricCanvas
    const fObj = findFabricObjectDeep(canvas, objId)
    if (!fObj || !canvas) return
    if (name) (fObj as any).data = { ...(fObj as any).data, fillImageName: name }
    applyImageFill(fObj, canvas, url)
  }

  const handleFileUpload = async (file: File) => {
    const originalName = file.name
    // Appliquer immédiatement avec blob URL
    const blobUrl = URL.createObjectURL(file)
    applyUrl(blobUrl, originalName)
    // Upload en galerie en arrière-plan
    setUploading(true)
    try {
      const galleryImg = await uploadToGallery(file)
      if (galleryImg) {
        // Remplacer le blob URL par l'URL permanente
        applyUrl(galleryImg.url, originalName)
      }
    } catch (err) {
      console.warn('[ImageFill] Gallery upload failed', err)
    } finally {
      setUploading(false)
    }
  }

  const handlePickFromDam = (tab: DamTab) => {
    setActiveDamTab(tab)
    openDamPickerForFill(objId)
    setMenuOpen(false)
  }

  return (
    <div className="flex flex-col gap-2">
      {fillImage && (
        <div className="relative group">
          <img src={fillImage} alt={t('props.fill')} className="w-full h-20 object-cover rounded border border-white/10" />
          <button
            onClick={() => {
              const canvas = globalFabricCanvas
              const fObj = findFabricObjectDeep(canvas, objId)
              if (!fObj || !canvas) return
              ;(fObj as any).data = { ...(fObj as any).data, fillImage: null }
              fObj.set('fill', 'transparent')
              ;(fObj as any).dirty = true
              canvas.fire('object:modified', { target: fObj })
              canvas.renderAll()
              syncToStore(canvas)
            }}
            className="absolute top-1 right-1 p-1 bg-black/60 rounded opacity-0 group-hover:opacity-100 transition-opacity"
          >
            <X size={12} className="text-white/60" />
          </button>
        </div>
      )}
      <div ref={menuRef} className="relative">
        <button
          type="button"
          onClick={() => setMenuOpen((v) => !v)}
          disabled={uploading}
          className={`flex items-center gap-2 w-full px-3 py-2 bg-white/5 border border-white/10 rounded hover:bg-white/10 transition-colors ${uploading ? 'opacity-50 pointer-events-none' : ''}`}
        >
          <ImagePlus size={14} className="text-white/40" />
          <span className="text-[11px] text-white/50 flex-1 text-left">
            {uploading ? 'Upload en cours…' : fillImage ? "Changer l'image" : 'Importer une image'}
          </span>
          <ChevronDown size={12} className="text-white/30" />
        </button>
        {menuOpen && (
          <div className="absolute top-full left-0 right-0 mt-1 bg-surface border border-white/10 rounded-md shadow-xl overflow-hidden z-40">
            {FILL_IMAGE_SOURCES.map((source) => {
              const Icon = source.icon
              return (
                <button
                  key={source.tab}
                  type="button"
                  onClick={() => handlePickFromDam(source.tab)}
                  className="flex items-center gap-2 w-full px-3 py-2 text-[11px] text-white/80 hover:bg-surface-2 hover:text-white transition-colors text-left"
                >
                  <Icon className="w-3.5 h-3.5 opacity-70" />
                  <span>{t(source.labelKey)}</span>
                </button>
              )
            })}
            <div className="h-px bg-white/10" />
            <button
              type="button"
              onClick={() => {
                fileInputRef.current?.click()
                setMenuOpen(false)
              }}
              className="flex items-center gap-2 w-full px-3 py-2 text-[11px] text-white/80 hover:bg-surface-2 hover:text-white transition-colors text-left"
            >
              <Upload className="w-3.5 h-3.5 opacity-70" />
              <span>{t('props.fromComputer')}</span>
            </button>
          </div>
        )}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (!file) return
            handleFileUpload(file)
            e.target.value = ''
          }}
        />
      </div>
      {galleryImages.filter((img) => img.url && !brokenIds.has(img.id)).length > 0 && (
        <>
          <p className="text-[10px] text-white/30 uppercase tracking-wider">{t('props.gallery')}</p>
          <div className="grid grid-cols-4 gap-1 max-h-32 overflow-y-auto">
            {galleryImages.filter((img) => img.url && !brokenIds.has(img.id)).map((img) => (
              <button key={img.id} onClick={() => applyUrl(img.url, img.name)}
                className={`rounded border overflow-hidden aspect-square transition-colors ${fillImage === img.url ? 'border-indigo-500' : 'border-white/10 hover:border-white/30'}`}>
                <img src={img.thumbnailUrl || img.url} alt={img.name} className="w-full h-full object-cover" loading="lazy"
                  onError={() => setBrokenIds((prev) => new Set(prev).add(img.id))} />
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

// ── Shared sub-components ───────────────────────────────────────────────────

function Row({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-2 gap-2">{children}</div>
}

function Label({ children }: { children: React.ReactNode }) {
  return <label className="text-[10px] text-white/30 uppercase tracking-wider">{children}</label>
}

function NumInput({ label, value, onChange, unit = 'px', step = 1, min, max }: {
  label: string; value: number; onChange: (v: number) => void; unit?: string; step?: number; min?: number; max?: number
}) {
  return (
    <div className="flex flex-col gap-1">
      <Label>{label}</Label>
      <div className="flex items-center bg-white/5 border border-white/10 rounded-md overflow-hidden focus-within:border-indigo-500/50">
        <input type="number" value={Math.round(value * 100) / 100} step={step} min={min} max={max}
          onChange={(e) => onChange(Number(e.target.value))}
          className="w-full bg-transparent px-2 py-1.5 text-xs text-white focus:outline-none" />
        {unit && <span className="text-[10px] text-white/20 pr-1.5 shrink-0">{unit}</span>}
      </div>
    </div>
  )
}

function Toggle({ active, onClick, children, title }: { active: boolean; onClick: () => void; children: React.ReactNode; title?: string }) {
  return (
    <button onClick={onClick} title={title}
      className={`p-1.5 rounded border transition-colors ${active ? 'bg-indigo-500/20 border-indigo-500/50 text-indigo-400' : 'bg-white/5 border-white/10 text-white/40 hover:text-white'}`}>
      {children}
    </button>
  )
}

// Accordéon mutualisé (kit shared/panel) ; l'Éditeur garde ses sections REPLIÉES par
// défaut (defaultOpen=false) — un appelant peut toujours surcharger.
function Section(props: ComponentProps<typeof PropertySection>) {
  return <PropertySection defaultOpen={false} {...props} />
}

function SelectInput({ label, value, onChange, options }: {
  label: string; value: string; onChange: (v: string) => void; options: { value: string; label: string }[]
}) {
  return (
    <div className="flex flex-col gap-1">
      <Label>{label}</Label>
      <select value={value} onChange={(e) => onChange(e.target.value)}
        className="bg-white/5 border border-white/10 rounded-md px-2 py-1.5 text-xs text-white focus:outline-none focus:border-indigo-500/50 cursor-pointer">
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  )
}

function SliderInput({ label, value, onChange, min = 0, max = 100, step = 1, unit = '%' }: {
  label: string; value: number; onChange: (v: number) => void; min?: number; max?: number; step?: number; unit?: string
}) {
  return (
    <div className="flex flex-col gap-1">
      <Label>{label}</Label>
      <div className="flex items-center gap-2 h-[30px]">
        <input type="range" min={min} max={max} step={step} value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="flex-1 accent-indigo-500" />
        <span className="text-xs text-white/40 w-10 text-right">{Math.round(value * (unit === '%' && max <= 1 ? 100 : 1))}{unit}</span>
      </div>
    </div>
  )
}

// ── Stroke dash presets ─────────────────────────────────────────────────────

const DASH_PRESETS: { labelKey: TranslationKey; value: number[] }[] = [
  { labelKey: 'dash.solid', value: [] },
  { labelKey: 'dash.dashed', value: [12, 6] },
  { labelKey: 'dash.dotted', value: [2, 4] },
  { labelKey: 'dash.dashDot', value: [12, 4, 2, 4] },
  { labelKey: 'dash.longDash', value: [20, 6] },
]

// ── Blend modes ─────────────────────────────────────────────────────────────

// ⚠️ `value` est la clé Fabric (globalCompositeOperation) — JAMAIS traduite.
const BLEND_MODES: { value: string; labelKey: TranslationKey }[] = [
  { value: 'source-over', labelKey: 'blend.normal' },
  { value: 'multiply', labelKey: 'blend.multiply' },
  { value: 'screen', labelKey: 'blend.screen' },
  { value: 'overlay', labelKey: 'blend.overlay' },
  { value: 'darken', labelKey: 'blend.darken' },
  { value: 'lighten', labelKey: 'blend.lighten' },
  { value: 'color-dodge', labelKey: 'blend.colorDodge' },
  { value: 'color-burn', labelKey: 'blend.colorBurn' },
  { value: 'hard-light', labelKey: 'blend.hardLight' },
  { value: 'soft-light', labelKey: 'blend.softLight' },
  { value: 'difference', labelKey: 'blend.difference' },
  { value: 'exclusion', labelKey: 'blend.exclusion' },
  { value: 'hue', labelKey: 'blend.hue' },
  { value: 'saturation', labelKey: 'blend.saturation' },
  { value: 'color', labelKey: 'blend.color' },
  { value: 'luminosity', labelKey: 'blend.luminosity' },
]

// ── Main component ──────────────────────────────────────────────────────────

export function PropertiesPanel() {
  const { t } = useTranslation()
  const { selectedObjectId, canvasObjects } = useEditorStore(
    useShallow((s) => ({ selectedObjectId: s.selectedObjectId, canvasObjects: s.canvasObjects })),
  )
  const fabricRef = { current: globalFabricCanvas as Canvas | null }
  const { applyStyle } = useTextEditor(fabricRef)
  const ops = useObjectOperations()
  const [activeTab, setActiveTab] = useState<'shape' | 'text'>('shape')

  const storeObj = findStoreObjectDeep(canvasObjects, selectedObjectId)

  // Track cursor-level text style for per-character properties
  const [cursorTextStyle, setCursorTextStyle] = useState<Record<string, unknown> | null>(null)
  useEffect(() => {
    const canvas = globalFabricCanvas
    if (!canvas || storeObj?.type !== 'text') { setCursorTextStyle(null); return }
    const update = () => {
      const cs = getCurrentTextStyle(canvas)
      setCursorTextStyle(cs as Record<string, unknown> | null)
    }
    update()
    canvas.on('text:selection:changed' as any, update)
    canvas.on('text:editing:entered' as any, update)
    canvas.on('text:editing:exited' as any, update)
    return () => {
      canvas.off('text:selection:changed' as any, update)
      canvas.off('text:editing:entered' as any, update)
      canvas.off('text:editing:exited' as any, update)
    }
  }, [selectedObjectId, storeObj?.type])

  // Merge cursor-level style into store object for display
  const obj = storeObj ? (cursorTextStyle ? {
    ...storeObj,
    fontSize: (cursorTextStyle.fontSize as number) ?? storeObj.fontSize,
    fontFamily: (cursorTextStyle.fontFamily as string) ?? storeObj.fontFamily,
    fontWeight: (cursorTextStyle.fontWeight as string) ?? storeObj.fontWeight,
    fontStyle: (cursorTextStyle.fontStyle as string) ?? storeObj.fontStyle,
    fill: (cursorTextStyle.fill as string) ?? storeObj.fill,
  } : storeObj) : undefined

  // Auto-switch to text tab when selecting a text object
  useEffect(() => {
    if (storeObj?.type === 'text') setActiveTab('text')
    else setActiveTab('shape')
  }, [selectedObjectId, storeObj?.type])

  const applyToFabric = (patch: Partial<CanvasObjectProps>) => {
    if (!obj) return
    const canvas = globalFabricCanvas
    const fObj = findFabricObjectDeep(canvas, obj.id)
    if (!fObj || !canvas) return

    if ('x' in patch) {
      const w = ((fObj as any).width ?? 0) * (fObj.scaleX ?? 1)
      fObj.set('left', patch.x! + ((fObj as any).originX === 'center' ? w / 2 : 0))
    }
    if ('y' in patch) {
      const h = ((fObj as any).height ?? 0) * (fObj.scaleY ?? 1)
      fObj.set('top', patch.y! + ((fObj as any).originY === 'center' ? h / 2 : 0))
    }
    if ('fill' in patch) {
      fObj.set('fill', patch.fill as any)
      ;(fObj as any).dirty = true
      ;(fObj as any)._cacheCanvas = null
      if (obj.type === 'text' && (fObj as any).styles) {
        const styles = (fObj as any).styles as Record<string, Record<string, Record<string, unknown>>>
        for (const lineKey of Object.keys(styles)) {
          for (const charKey of Object.keys(styles[lineKey])) {
            delete styles[lineKey][charKey].fill
          }
        }
      }
    }
    if ('stroke' in patch) fObj.set('stroke', patch.stroke || undefined)
    if ('strokeWidth' in patch) fObj.set('strokeWidth', patch.strokeWidth)
    if ('strokeDashArray' in patch) fObj.set('strokeDashArray', patch.strokeDashArray ?? undefined)
    if ('strokeLineCap' in patch) fObj.set('strokeLineCap', patch.strokeLineCap)
    if ('strokeLineJoin' in patch) fObj.set('strokeLineJoin', patch.strokeLineJoin)
    if ('opacity' in patch) fObj.set('opacity', patch.opacity)
    if ('angle' in patch) fObj.set('angle', patch.angle)
    if ('blendMode' in patch) (fObj as any).globalCompositeOperation = patch.blendMode

    // Width/Height
    if ('width' in patch && patch.width !== undefined) {
      if (obj.type === 'text') {
        // Preserve existing scaleX (e.g. hScaleFactor from IDML horizontal scale)
        const curScaleX = fObj.scaleX ?? 1
        const localW = patch.width / curScaleX
        ;(fObj as any).set({ width: localW })
        // Un bloc de texte : la largeur saisie est celle du CADRE.
        if (isTextFrame(fObj)) applyTextFrame(fObj, { frameW: localW })
      } else {
        const origW = (fObj as any).width ?? 1
        if (origW > 0) fObj.set('scaleX', patch.width! / origW)
      }
    }
    if ('height' in patch && patch.height !== undefined) {
      if (obj.type === 'text') {
        // Sur un bloc de texte, la hauteur est celle du cadre — l'appliquer via
        // scaleY déformerait les glyphes au lieu d'agrandir le bloc.
        if (isTextFrame(fObj)) {
          applyTextFrame(fObj, { frameH: patch.height / (fObj.scaleY ?? 1) })
        }
      } else {
        const origH = (fObj as any).height ?? 1
        if (origH > 0) fObj.set('scaleY', patch.height! / origH)
      }
    }

    // Shadow
    if ('shadow' in patch) {
      const s = patch.shadow
      fObj.set('shadow', s ? new Shadow({ color: s.color, blur: s.blur, offsetX: s.offsetX, offsetY: s.offsetY }) : null)
    }
    // Corner radius — un bloc de texte arrondit son CADRE, pas une boîte Fabric.
    if ('cornerRadius' in patch) {
      if (fObj.type === 'rect') {
        (fObj as any).set({ rx: patch.cornerRadius, ry: patch.cornerRadius })
      } else if (obj.type === 'text') {
        applyTextFrame(fObj, { cornerRadius: patch.cornerRadius ?? 0 })
      }
    }
    // Text props
    if ('charSpacing' in patch) (fObj as any).set('charSpacing', patch.charSpacing)
    if ('lineHeight' in patch) (fObj as any).set('lineHeight', patch.lineHeight)
    if ('underline' in patch) (fObj as any).set('underline', patch.underline)
    if ('linethrough' in patch) (fObj as any).set('linethrough', patch.linethrough)

    // Lock aspect ratio (store in data)
    if ('lockAspectRatio' in patch) {
      (fObj as any).data = { ...(fObj as any).data, lockAspectRatio: patch.lockAspectRatio }
    }
    // Text transform (store in data)
    if ('textTransform' in patch) {
      (fObj as any).data = { ...(fObj as any).data, textTransform: patch.textTransform }
    }

    fObj.setCoords()
    canvas.renderAll()
    syncToStore(canvas)
    canvas.fire('object:modified', { target: fObj })
  }

  const applyGradient = (gradient: GradientConfig) => {
    if (!obj) return
    const canvas = globalFabricCanvas
    const fObj = findFabricObjectDeep(canvas, obj.id)
    if (!fObj || !canvas) return

    const w = (fObj as any).width ?? 100
    const h = (fObj as any).height ?? 100
    fObj.set('fill', gradientToFabric(gradient, w, h) as any)
    ;(fObj as any).dirty = true
    ;(fObj as any)._cacheCanvas = null
    // Clear per-character fill styles so the gradient applies to the whole text
    if (obj.type === 'text' && (fObj as any).styles) {
      const styles = (fObj as any).styles as Record<string, Record<string, Record<string, unknown>>>
      for (const lineKey of Object.keys(styles)) {
        for (const charKey of Object.keys(styles[lineKey])) {
          delete styles[lineKey][charKey].fill
        }
      }
    }
    ;(fObj as any).data = { ...(fObj as any).data, gradient }
    fObj.setCoords()
    canvas.renderAll()
    canvas.fire('object:modified', { target: fObj })
    syncToStore(canvas)
  }

  // Délégué à l'util partagé (utilisé aussi par DamImageCard en mode "fill")
  const applyImageFill = (fObj: any, canvas: Canvas, url: string) => {
    applyImageFillUtil(fObj, canvas, url)
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between shrink-0">
        <h3 className="text-xs font-semibold text-white/60 uppercase tracking-wider">{t('props.title')}</h3>
        {obj && (
          <button onClick={() => ops.deleteSelected()} className="text-white/20 hover:text-red-400 transition-colors" title={t('props.delete')}>
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {!obj ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-2 text-white/20 p-4">
          <svg viewBox="0 0 24 24" className="w-10 h-10 opacity-20" fill="none" stroke="currentColor" strokeWidth="1">
            <rect x="3" y="3" width="18" height="18" rx="2" /><path d="M3 9h18M9 21V9" />
          </svg>
          <p className="text-sm text-center">{t('props.selectObject')}</p>
        </div>
      ) : (
        <>
          {/* Tabs for text objects */}
          {obj.type === 'text' && (
            <div className="flex border-b border-white/10 shrink-0">
              <button onClick={() => setActiveTab('shape')}
                className={`flex-1 py-2 text-[10px] uppercase tracking-wider transition-colors ${activeTab === 'shape' ? 'text-indigo-400 border-b-2 border-indigo-500' : 'text-white/30 hover:text-white/50'}`}>
                {t('props.tab.shape')}
              </button>
              <button onClick={() => setActiveTab('text')}
                className={`flex-1 py-2 text-[10px] uppercase tracking-wider transition-colors ${activeTab === 'text' ? 'text-indigo-400 border-b-2 border-indigo-500' : 'text-white/30 hover:text-white/50'}`}>
                {t('props.tab.text')}
              </button>
            </div>
          )}

          <div className="flex-1 overflow-y-auto flex flex-col gap-4 p-4">

            {/* ═══════════════════════ SHAPE OPTIONS TAB ═══════════════════════ */}
            {(obj.type !== 'text' || activeTab === 'shape') && (
              <>
                {/* ── Remplissage ── */}
                <Section title={t('props.fill')} tourId="prop-fill" help={t('props.help.fill')}>

                  <div className="flex gap-1 mb-1">
                    {(['solid', 'gradient', 'image', 'none'] as const).map(ft => (
                      <button key={ft} onClick={() => {
                        const canvas = globalFabricCanvas
                        const fObj = findFabricObjectDeep(canvas, obj.id)
                        if (!fObj || !canvas) return
                        // Clear image fillType marker when switching away
                        if (ft !== 'image') {
                          const d = (fObj as any).data ?? {}
                          if (d.fillType === 'image') {
                            ;(fObj as any).data = { ...d, fillType: undefined }
                          }
                        }
                        if (ft === 'none') {
                          fObj.set('fill', 'transparent')
                        } else if (ft === 'solid') {
                          const color = (obj.fill && obj.fill !== 'transparent') ? obj.fill : '#6366f1'
                          fObj.set('fill', color)
                        } else if (ft === 'gradient') {
                          const g = obj.gradient ?? DEFAULT_GRADIENT
                          const w = (fObj as any).width ?? 100
                          const h = (fObj as any).height ?? 100
                          fObj.set('fill', gradientToFabric(g, w, h) as any)
                          ;(fObj as any).data = { ...(fObj as any).data, gradient: g }
                          // Clear per-character fills for text objects
                          if (obj.type === 'text' && (fObj as any).styles) {
                            const styles = (fObj as any).styles as Record<string, Record<string, Record<string, unknown>>>
                            for (const lineKey of Object.keys(styles)) {
                              for (const charKey of Object.keys(styles[lineKey])) {
                                delete styles[lineKey][charKey].fill
                              }
                            }
                          }
                        } else if (ft === 'image') {
                          ;(fObj as any).data = { ...(fObj as any).data, fillType: 'image' }
                          // If there's already a fill image saved, re-apply it
                          const savedUrl = (fObj as any).data?.fillImage
                          if (savedUrl) {
                            applyImageFill(fObj, canvas, savedUrl)
                          }
                        }
                        ;(fObj as any).dirty = true
                        ;(fObj as any)._cacheCanvas = null
                        fObj.setCoords()
                        canvas.fire('object:modified', { target: fObj })
                        canvas.renderAll()
                        syncToStore(canvas)
                      }}
                        className={`flex-1 py-1 text-[10px] rounded border transition-colors ${(obj.fillType ?? 'solid') === ft ? 'bg-indigo-500/20 border-indigo-500/50 text-indigo-400' : 'bg-white/5 border-white/10 text-white/40 hover:text-white/60'}`}>
                        {t(ft === 'solid' ? 'props.fill.solid' : ft === 'gradient' ? 'props.fill.gradient' : ft === 'image' ? 'props.fill.image' : 'props.fill.none')}
                      </button>
                    ))}
                  </div>

                  {(obj.fillType ?? 'solid') === 'solid' && (
                    <ColorPicker label={t('props.colour')} value={obj.fill}
                      onChange={(v) => obj.type === 'text' ? applyStyle({ fill: v }) : applyToFabric({ fill: v })} />
                  )}

                  {obj.fillType === 'gradient' && (
                    <GradientPicker
                      value={obj.gradient ?? DEFAULT_GRADIENT}
                      onChange={applyGradient} />
                  )}

                  {obj.fillType === 'image' && (
                    <ImageFillPicker
                      fillImage={obj.fillImage ?? null}
                      objId={obj.id}
                      applyImageFill={applyImageFill}
                    />
                  )}
                </Section>

                {/* ── Bloc de texte (cadre InDesign) ── */}
                {obj.type === 'text' && <TextFrameSection selectedObjectId={selectedObjectId} />}

                {/* ── Contour ── */}
                <Section title={t('props.stroke')} tourId="prop-stroke" help={t('props.help.stroke')}>

                  <ColorPicker label={t('props.colour')} value={obj.stroke}
                    onChange={(v) => applyToFabric({ stroke: v })} />
                  <Row>
                    <NumInput label={t('props.stroke.width')} value={obj.strokeWidth} onChange={(v) => applyToFabric({ strokeWidth: v })} />
                    <SelectInput label={t('props.stroke.dash')} value={JSON.stringify(obj.strokeDashArray ?? [])}
                      onChange={(v) => applyToFabric({ strokeDashArray: JSON.parse(v) })}
                      options={DASH_PRESETS.map(p => ({ value: JSON.stringify(p.value), label: t(p.labelKey) }))} />
                  </Row>
                  <Row>
                    <SelectInput label={t('props.stroke.cap')} value={obj.strokeLineCap ?? 'butt'}
                      onChange={(v) => applyToFabric({ strokeLineCap: v as any })}
                      options={[
                        { value: 'butt', label: t('props.cap.butt') },
                        { value: 'round', label: t('props.cap.round') },
                        { value: 'square', label: t('props.cap.square') },
                      ]} />
                    <SelectInput label={t('props.stroke.join')} value={obj.strokeLineJoin ?? 'miter'}
                      onChange={(v) => applyToFabric({ strokeLineJoin: v as any })}
                      options={[
                        { value: 'miter', label: t('props.join.miter') },
                        { value: 'round', label: t('props.join.round') },
                        { value: 'bevel', label: t('props.join.bevel') },
                      ]} />
                  </Row>
                </Section>

                {/* ── Opacité & Mode de fusion ── */}
                <Section title={t('props.opacityBlend')} tourId="prop-opacity" help={t('props.help.opacity')}>

                  <SliderInput label={t('props.opacity')} value={obj.opacity} onChange={(v) => applyToFabric({ opacity: v })}
                    min={0} max={1} step={0.01} unit="%" />
                  <SelectInput label={t('props.blend')} value={obj.blendMode ?? 'source-over'}
                    onChange={(v) => applyToFabric({ blendMode: v })}
                    options={BLEND_MODES.map(m => ({ value: m.value, label: t(m.labelKey) }))} />
                </Section>

                {/* ── Ombre ── */}
                <Section title={t('props.shadow')} tourId="prop-shadow" help={t('props.help.shadow')}>

                  <label className="flex items-center gap-2 cursor-pointer">
                    <div
                      onClick={() => applyToFabric({ shadow: obj.shadow ? null : { color: 'rgba(0,0,0,0.4)', blur: 10, offsetX: 5, offsetY: 5 } })}
                      className={`w-9 h-5 rounded-full transition-colors relative ${obj.shadow ? 'bg-indigo-500' : 'bg-white/10'}`}>
                      <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-[#fff] shadow transition-transform ${obj.shadow ? 'left-4' : 'left-0.5'}`} />
                    </div>
                    <span className="text-xs text-white/50">{obj.shadow ? t('props.shadow.on') : t('props.shadow.off')}</span>
                  </label>
                  {obj.shadow && (
                    <div className="flex flex-col gap-2 pl-2 border-l-2 border-indigo-500/30">
                      <ColorPicker label={t('props.colour')} value={obj.shadow.color}
                        onChange={(v) => applyToFabric({ shadow: { ...obj.shadow!, color: v } })} />
                      <Row>
                        <NumInput label={t('props.shadow.blur')} value={obj.shadow.blur} onChange={(v) => applyToFabric({ shadow: { ...obj.shadow!, blur: v } })} />
                        <NumInput label={t('props.shadow.offsetX')} value={obj.shadow.offsetX} onChange={(v) => applyToFabric({ shadow: { ...obj.shadow!, offsetX: v } })} />
                      </Row>
                      <NumInput label={t('props.shadow.offsetY')} value={obj.shadow.offsetY} onChange={(v) => applyToFabric({ shadow: { ...obj.shadow!, offsetY: v } })} />
                    </div>
                  )}
                </Section>

                {/* ── Taille & Position ── */}
                <Section title={t('props.sizePosition')} tourId="prop-transform" help={t('props.help.size')}>

                  <Row>
                    <NumInput label="X" value={obj.x} onChange={(v) => applyToFabric({ x: v })} unit="pt" />
                    <NumInput label="Y" value={obj.y} onChange={(v) => applyToFabric({ y: v })} unit="pt" />
                  </Row>
                  <Row>
                    <NumInput label={t('props.width')} value={obj.width} onChange={(v) => {
                      if (obj.lockAspectRatio && obj.width > 0) {
                        const ratio = obj.height / obj.width
                        applyToFabric({ width: v, height: Math.round(v * ratio) })
                      } else {
                        applyToFabric({ width: v })
                      }
                    }} unit="pt" />
                    <NumInput label={t('props.height')} value={obj.height} onChange={(v) => {
                      if (obj.lockAspectRatio && obj.height > 0) {
                        const ratio = obj.width / obj.height
                        applyToFabric({ height: v, width: Math.round(v * ratio) })
                      } else {
                        applyToFabric({ height: v })
                      }
                    }} unit="pt" />
                  </Row>
                  {/* Aspect ratio lock */}
                  <div className="flex items-center gap-2">
                    <button onClick={() => applyToFabric({ lockAspectRatio: !obj.lockAspectRatio })}
                      className={`flex items-center gap-1.5 px-2 py-1 text-[10px] rounded border transition-colors ${obj.lockAspectRatio ? 'bg-indigo-500/20 border-indigo-500/50 text-indigo-400' : 'bg-white/5 border-white/10 text-white/40 hover:text-white'}`}>
                      {obj.lockAspectRatio ? <Link className="w-3 h-3" /> : <Unlink className="w-3 h-3" />}
                      {obj.lockAspectRatio ? t('props.linkedRatio') : 'Proportions libres'}
                    </button>
                  </div>
                  <Row>
                    <NumInput label={t('props.rotation')} value={obj.angle} onChange={(v) => applyToFabric({ angle: v })} unit="°" />
                    {(obj.type === 'rect' || obj.type === 'text') && (
                      <NumInput label={t('props.radius')} value={obj.cornerRadius ?? 0} onChange={(v) => applyToFabric({ cornerRadius: v })} />
                    )}
                  </Row>
                  {/* Flip & Lock */}
                  <div className="flex gap-2">
                    <button onClick={ops.flipHorizontal}
                      className="flex-1 flex items-center justify-center gap-1.5 py-1.5 text-xs bg-white/5 hover:bg-white/10 border border-white/10 hover:border-white/30 rounded-md text-white/40 hover:text-white transition-colors">
                      <FlipHorizontal className="w-3.5 h-3.5" /> H
                    </button>
                    <button onClick={ops.flipVertical}
                      className="flex-1 flex items-center justify-center gap-1.5 py-1.5 text-xs bg-white/5 hover:bg-white/10 border border-white/10 hover:border-white/30 rounded-md text-white/40 hover:text-white transition-colors">
                      <FlipVertical className="w-3.5 h-3.5" /> V
                    </button>
                    <button onClick={ops.lockSelected}
                      className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 text-xs border rounded-md transition-colors ${obj.locked ? 'bg-amber-500/20 border-amber-500/50 text-amber-400' : 'bg-white/5 border-white/10 text-white/40 hover:text-white hover:bg-white/10'}`}>
                      {obj.locked ? <Lock className="w-3.5 h-3.5" /> : <Unlock className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                  {/* Ajuster à la taille du contenu (texte uniquement) */}
                  {obj.type === 'text' && (
                    <button
                      onClick={() => {
                        const canvas = globalFabricCanvas
                        if (!canvas) return
                        const fObj = findFabricObjectDeep(canvas, obj.id)
                        if (!fObj) return
                        const tb = fObj as any
                        if (typeof tb.calcTextWidth === 'function') {
                          const minW = tb.calcTextWidth()
                          tb.set({ width: Math.max(minW, 10), scaleX: 1, scaleY: 1 })
                          tb.initDimensions?.()
                          tb.setCoords()
                          canvas.requestRenderAll()
                          syncToStore(canvas)
                        }
                      }}
                      className="w-full flex items-center justify-center gap-1.5 py-1.5 text-xs bg-white/5 hover:bg-white/10 border border-white/10 hover:border-indigo-500/50 rounded-md text-white/40 hover:text-indigo-300 transition-colors"
                    >
                      <Minimize2 className="w-3.5 h-3.5" />
                      {t('propertiesPanel.fitToThe')}
                    </button>
                  )}
                </Section>

                {/* ── Cadrage (FabricImage ou shape avec fill image) ── */}
                {(() => {
                  const fObj = findFabricObjectDeep(globalFabricCanvas, obj.id)
                  if (!fObj) return null
                  const isImage = (fObj as any).type === 'image'
                  const isPatternFilled = (fObj as any).fill?.type === 'pattern'
                  if (!isImage && !isPatternFilled) return null
                  return (
                    <Section title={t('props.crop')} tourId="prop-crop" help={t('props.help.crop')}>

                      <ImageMaskSection image={fObj} />
                    </Section>
                  )
                })()}
              </>
            )}

            {/* ═══════════════════════ TEXT OPTIONS TAB ═══════════════════════ */}
            {obj.type === 'text' && activeTab === 'text' && (
              <>
                {/* ── Police ── */}
                <Section title={t('props.font')} tourId="prop-font" help={t('props.help.font')}>

                  <div className="flex flex-col gap-1">
                    <Label>{t('props.font.family')}</Label>
                    <select value={obj.fontFamily ?? 'Inter'} onChange={(e) => applyStyle({ fontFamily: e.target.value })}
                      className="bg-white/5 border border-white/10 rounded px-2 py-1.5 text-xs text-white focus:outline-none focus:border-indigo-500 cursor-pointer"
                      style={{ fontFamily: obj.fontFamily ?? 'Inter' }}>
                      <EditorFontOptions />
                    </select>
                  </div>

                  {/* Mes polices : upload .woff2/.ttf + ajout par URL Google Fonts */}
                  <UserFontsPanel />

                  <Row>
                    <NumInput label={t('props.font.size')} value={obj.fontSize ?? 24} onChange={(v) => applyStyle({ fontSize: v })} unit="pt" />
                    <div className="flex flex-col gap-1">
                      <Label>{t('props.font.style')}</Label>
                      {(() => {
                        const family = obj.fontFamily ?? 'Inter'
                        const variants = getDynamicFontVariants(family)
                        const currentKey = `${obj.fontWeight ?? 'normal'}|${obj.fontStyle ?? 'normal'}`
                        if (variants.length > 0) {
                          return (
                            <select
                              value={currentKey}
                              onChange={(e) => {
                                const [w, s] = e.target.value.split('|')
                                applyStyle({ fontWeight: w as 'normal' | 'bold', fontStyle: s as 'normal' | 'italic' })
                              }}
                              className="bg-white/5 border border-white/10 rounded px-2 py-1.5 text-xs text-white focus:outline-none focus:border-indigo-500 cursor-pointer"
                            >
                              {variants.map(v => (
                                <option key={`${v.weight}|${v.style}`} value={`${v.weight}|${v.style}`}>{v.label}</option>
                              ))}
                            </select>
                          )
                        }
                        return (
                          <select
                            value={currentKey}
                            onChange={(e) => {
                              const [w, s] = e.target.value.split('|')
                              applyStyle({ fontWeight: w as 'normal' | 'bold', fontStyle: s as 'normal' | 'italic' })
                            }}
                            className="bg-white/5 border border-white/10 rounded px-2 py-1.5 text-xs text-white focus:outline-none focus:border-indigo-500 cursor-pointer"
                          >
                            <option value="normal|normal">{t('props.fontStyle.regular')}</option>
                            <option value="normal|italic">{t('props.fontStyle.italic')}</option>
                            <option value="bold|normal">{t('props.fontStyle.bold')}</option>
                            <option value="bold|italic">{t('props.fontStyle.boldItalic')}</option>
                          </select>
                        )
                      })()}
                    </div>
                  </Row>
                  <Row>
                    <div className="flex gap-1">
                      <Toggle active={!!obj.underline} onClick={() => applyToFabric({ underline: !obj.underline })} title={t('props.underline')}>
                        <span className="underline text-xs">S</span>
                      </Toggle>
                      <Toggle active={!!obj.linethrough} onClick={() => applyToFabric({ linethrough: !obj.linethrough })} title={t('props.strikethrough')}>
                        <span className="line-through text-xs">R</span>
                      </Toggle>
                    </div>
                  </Row>

                  <ColorPicker label={t('props.textColour')} value={obj.fill} onChange={(v) => applyStyle({ fill: v })} />
                </Section>

                {/* ── Paragraphe ── */}
                <Section title={t('props.paragraph')} tourId="prop-paragraph" help={t('props.help.paragraph')}>

                  <div className="flex flex-col gap-1">
                    <Label>{t('props.align')}</Label>
                    <div className="flex gap-1">
                      {(['left', 'center', 'right', 'justify'] as const).map((align) => (
                        <button key={align} onClick={() => applyStyle({ textAlign: align })}
                          className={`flex-1 py-1.5 flex items-center justify-center rounded-md border transition-colors ${obj.textAlign === align ? 'bg-indigo-500/20 border-indigo-500/50 text-indigo-400' : 'bg-white/5 border-white/10 text-white/40 hover:text-white/70'}`}>
                          {align === 'left' ? <AlignLeft className="w-3 h-3" /> : align === 'center' ? <AlignCenter className="w-3 h-3" /> : align === 'right' ? <AlignRight className="w-3 h-3" /> : <AlignJustify className="w-3 h-3" />}
                        </button>
                      ))}
                    </div>
                  </div>

                  <Row>
                    <NumInput label={t('props.spacing')} value={obj.charSpacing ?? 0} onChange={(v) => applyToFabric({ charSpacing: v })} unit="%" step={10} />
                    <NumInput label={t('props.lineHeight')} value={obj.lineHeight ?? 1.16} onChange={(v) => applyToFabric({ lineHeight: v })} unit="×" step={0.1} />
                  </Row>
                </Section>

                {/* ── Retrait et espacement ── */}
                <ParagraphIndentsSection selectedObjectId={selectedObjectId} />

                {/* ── Transformation texte ── */}
                <Section title={t('props.transform')} tourId="prop-texttransform" help={t('props.help.transform')}>

                  <div className="flex gap-1">
                    {([
                      { value: 'none', label: 'Aa' },
                      { value: 'uppercase', label: 'AA' },
                      { value: 'lowercase', label: 'aa' },
                      { value: 'capitalize', label: 'Aa.' },
                    ] as const).map(({ value, label }) => (
                      <button key={value} onClick={() => applyToFabric({ textTransform: value })}
                        className={`flex-1 py-1.5 text-xs rounded border transition-colors ${(obj.textTransform ?? 'none') === value ? 'bg-indigo-500/20 border-indigo-500/50 text-indigo-400' : 'bg-white/5 border-white/10 text-white/40 hover:text-white'}`}>
                        {label}
                      </button>
                    ))}
                  </div>
                </Section>
              </>
            )}

            {/* ── Connecteur IDML (always visible, renders null si pas de champ) ── */}
            <MergeConnectorSection selectedObjectId={selectedObjectId} />

            <ConditionalRulesSection selectedObjectId={selectedObjectId} />

            {/* ── Arranger (always visible) ── */}
            <Section title={t('props.arrange')} tourId="prop-arrange" help={t('props.help.arrange')}>

              {/* Z-order */}
              <div className="flex gap-1">
                {[
                  { icon: ChevronsUp, label: 'Premier plan', action: ops.bringToFront },
                  { icon: ArrowUp, label: 'Avancer', action: ops.bringForward },
                  { icon: ArrowDown, label: 'Reculer', action: ops.sendBackward },
                  { icon: ChevronsDown, label: t('props.background'), action: ops.sendToBack },
                ].map(({ icon: Icon, label, action }) => (
                  <button key={label} onClick={action} title={label}
                    className="flex-1 py-2 flex items-center justify-center bg-white/5 hover:bg-white/10 border border-white/10 hover:border-white/30 rounded-md transition-colors text-white/40 hover:text-white">
                    <Icon className="w-3.5 h-3.5" />
                  </button>
                ))}
              </div>
              {/* Align */}
              <div className="flex gap-1">
                {[
                  { icon: AlignStartVertical, label: 'Gauche', dir: 'left' },
                  { icon: AlignCenterHorizontal, label: 'Centrer H', dir: 'center' },
                  { icon: AlignEndHorizontal, label: 'Droite', dir: 'right' },
                  { icon: AlignStartHorizontal, label: 'Haut', dir: 'top' },
                  { icon: AlignCenterVertical, label: 'Centrer V', dir: 'middle' },
                  { icon: AlignEndVertical, label: 'Bas', dir: 'bottom' },
                ].map(({ icon: Icon, label, dir }) => (
                  <button key={dir} onClick={() => ops.alignObjects(dir as any)} title={label}
                    className="flex-1 py-2 flex items-center justify-center bg-white/5 hover:bg-white/10 border border-white/10 hover:border-indigo-500/40 rounded-md transition-colors text-white/40 hover:text-indigo-400">
                    <Icon className="w-3.5 h-3.5" />
                  </button>
                ))}
              </div>
              {/* Distribute */}
              <div className="flex gap-1">
                <button onClick={ops.distributeHorizontally} title={t('props.distributeH')}
                  className="flex-1 py-1.5 flex items-center justify-center gap-1.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-md text-white/40 hover:text-white text-[10px] transition-colors">
                  <GalleryHorizontalEnd className="w-3.5 h-3.5" /> Distribuer H
                </button>
                <button onClick={ops.distributeVertically} title={t('props.distributeV')}
                  className="flex-1 py-1.5 flex items-center justify-center gap-1.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-md text-white/40 hover:text-white text-[10px] transition-colors">
                  <GalleryVerticalEnd className="w-3.5 h-3.5" /> Distribuer V
                </button>
              </div>
              {/* Duplicate & Delete */}
              <div className="flex gap-2">
                <button onClick={ops.duplicateSelected}
                  className="flex-1 py-2 flex items-center justify-center gap-1.5 text-xs bg-white/5 hover:bg-white/10 border border-white/10 rounded-md text-white/40 hover:text-white transition-colors">
                  <Copy className="w-3 h-3" /> Dupliquer
                </button>
                <button onClick={ops.deleteSelected}
                  className="flex-1 py-2 flex items-center justify-center gap-1.5 text-xs bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 rounded-md text-red-400/70 hover:text-red-400 transition-colors">
                  <Trash2 className="w-3 h-3" /> Supprimer
                </button>
              </div>
            </Section>
          </div>
        </>
      )}
    </div>
  )
}
