import { useState, useRef, useEffect } from 'react'
import { ImagePlus, Trash2 } from 'lucide-react'
import { useUIStore, type CanvasBgType } from '@/stores/ui.store'
import { ColorPicker } from '@/components/shared/ColorPicker'
import { GradientPicker } from '@/components/shared/GradientPicker'
import { globalFabricCanvas } from '@/features/editor/CanvasContainer'
import { ensurePageBgRect } from '@/features/editor/useCanvas'
import { canvasPxToMm, mmToCanvasPx } from '@/features/print/dimensions'
import { OptionHelp } from '@/components/shared/OptionHelp'
import { usePageReformat } from '@/features/editor/usePageReformat'
import { withProgress } from '@/stores/progress.store'
import { notify } from '@/lib/notify'
import { Sparkles } from 'lucide-react'

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
    originWidth, originHeight, setOrigin,
    canvasBgType, canvasBgGradient, canvasBgImage,
    setCanvasSize, setCanvasBgType, setCanvasBgGradient, setCanvasBgImage,
  } = useUIStore()
  const { resizeProportional, reflowWithAI } = usePageReformat()
  const [reflowing, setReflowing] = useState(false)

  // Préréglage « Origine » = taille d'ouverture du document (capturée au chargement).
  const originActive =
    originWidth != null && originHeight != null &&
    Math.round(canvasWidth) === Math.round(originWidth) &&
    Math.round(canvasHeight) === Math.round(originHeight)

  // L'UI affiche et saisit en mm ; le store reste en px canvas (= pt).
  const [widthMm, setWidthMm] = useState<number | string>(() => roundMm(canvasPxToMm(canvasWidth)))
  const [heightMm, setHeightMm] = useState<number | string>(() => roundMm(canvasPxToMm(canvasHeight)))
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setWidthMm(roundMm(canvasPxToMm(canvasWidth)))
    setHeightMm(roundMm(canvasPxToMm(canvasHeight)))
  }, [canvasWidth, canvasHeight])

  // Filet : si l'origine n'a pas été capturée au chargement (session ouverte avant
  // l'ajout du préréglage), mémorise la taille courante comme origine, une seule fois.
  useEffect(() => {
    if (originWidth == null || originHeight == null) setOrigin(canvasWidth, canvasHeight)
  }, [])

  const triggerSave = () => {
    setTimeout(() => {
      const canvas = globalFabricCanvas
      if (!canvas) return
      ensurePageBgRect(canvas)
      canvas.fire('object:modified' as any)
    }, 50)
  }

  // Reçoit les dimensions en pt (= px canvas). Change le format de la page COURANTE
  // et met le contenu à l'échelle proportionnellement (EN PLACE, pas de nouvelle
  // page) pour qu'il suive le nouveau format.
  const applySize = (wPt: number, hPt: number) => {
    const cw = Math.max(50, wPt)
    const ch = Math.max(50, hPt)
    setWidthMm(roundMm(canvasPxToMm(cw)))
    setHeightMm(roundMm(canvasPxToMm(ch)))
    resizeProportional(canvasWidth, canvasHeight, cw, ch)
    setCanvasSize(cw, ch)
    triggerSave()
  }

  // Ré-agencement « fluide » par l'IA, à la demande, sur la page courante (en place).
  const handleReflowAI = async () => {
    setReflowing(true)
    try {
      const { ok, usedFallback } = await withProgress('Mise en page fluide (IA)…', reflowWithAI)
      if (!ok) {
        notify.info('Rien à ré-agencer', 'La page ne contient aucun élément à disposer.')
      } else if (usedFallback) {
        notify.warning('IA indisponible', "Ré-agencement non appliqué (clé/budget DeepSeek manquant). Le contenu est inchangé.")
      } else {
        notify.success('Mise en page fluide appliquée', 'Le contenu a été ré-agencé pour le format courant.')
      }
    } catch (err) {
      console.error('[reflowAI]', err)
      notify.error('Ré-agencement échoué', String(err).slice(0, 160))
    } finally {
      setReflowing(false)
    }
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
      <section data-tour="opt-page-dims" className="flex flex-col gap-2">
        <label className="flex items-center gap-1 text-[10px] text-white/40 uppercase tracking-wider font-semibold">
          Dimensions
          <OptionHelp text="Taille de la page en millimètres. Saisissez largeur/hauteur, ou choisissez un format prédéfini ci-dessous (A4, Instagram…). Modifiable à tout moment." />
        </label>
        <div className="flex items-center gap-2">
          <div className="flex-1 flex flex-col gap-1">
            <span className="text-[10px] text-white/30">Largeur</span>
            <input type="number" value={widthMm} min={10} step={0.1} disabled={reflowing}
              onChange={(e) => setWidthMm(e.target.value === '' ? '' : Number(e.target.value))}
              onBlur={() => applySizeMm(Number(widthMm) || 10, Number(heightMm) || 10)}
              onKeyDown={(e) => e.key === 'Enter' && applySizeMm(Number(widthMm) || 10, Number(heightMm) || 10)}
              className="w-full bg-white/5 border border-white/10 rounded-md px-2 py-1.5 text-xs text-white focus:outline-none focus:border-indigo-500/50 disabled:opacity-40 disabled:cursor-not-allowed" />
          </div>
          <span className="text-white/20 mt-4">x</span>
          <div className="flex-1 flex flex-col gap-1">
            <span className="text-[10px] text-white/30">Hauteur</span>
            <input type="number" value={heightMm} min={10} step={0.1} disabled={reflowing}
              onChange={(e) => setHeightMm(e.target.value === '' ? '' : Number(e.target.value))}
              onBlur={() => applySizeMm(Number(widthMm) || 10, Number(heightMm) || 10)}
              onKeyDown={(e) => e.key === 'Enter' && applySizeMm(Number(widthMm) || 10, Number(heightMm) || 10)}
              className="w-full bg-white/5 border border-white/10 rounded-md px-2 py-1.5 text-xs text-white focus:outline-none focus:border-indigo-500/50 disabled:opacity-40 disabled:cursor-not-allowed" />
          </div>
          <span className="text-[10px] text-white/20 mt-4">mm</span>
        </div>
        <div className="flex flex-wrap gap-1 mt-1">
          {originWidth != null && originHeight != null && (
            <button
              onClick={() => applySize(originWidth, originHeight)}
              disabled={reflowing}
              title={`Taille d'ouverture du document : ${Math.round(canvasPxToMm(originWidth))}×${Math.round(canvasPxToMm(originHeight))} mm`}
              className={`px-2 py-1 text-[10px] rounded border transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${originActive
                ? 'bg-indigo-500/20 border-indigo-500/50 text-indigo-400'
                : 'bg-white/5 border-white/10 text-white/40 hover:text-white hover:border-white/20'}`}>
              Origine
            </button>
          )}
          {FORMAT_PRESETS.map((p) => {
            const active = Math.round(canvasWidth) === p.w && Math.round(canvasHeight) === p.h
            return (
              <button key={p.label} onClick={() => applySize(p.w, p.h)} disabled={reflowing}
                className={`px-2 py-1 text-[10px] rounded border transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${active
                  ? 'bg-indigo-500/20 border-indigo-500/50 text-indigo-400'
                  : 'bg-white/5 border-white/10 text-white/40 hover:text-white hover:border-white/20'}`}>
                {p.label}
              </button>
            )
          })}
        </div>

        {/* ── Ré-agencement IA (optionnel, en place) ── */}
        <div className="flex flex-col gap-1 mt-2 pt-2 border-t border-white/5">
          <label className="flex items-center gap-1 text-[10px] text-white/40 uppercase tracking-wider font-semibold">
            Mise en page
            <OptionHelp text="Changer le format met automatiquement le contenu à l'échelle (proportionnel, sur place). « Ré-agencer avec l'IA » redispose les blocs (produit, prix, texte) pour mieux remplir le format courant — optionnel, nécessite une clé DeepSeek. Le contenu reste éditable et tu peux annuler." />
          </label>
          <button onClick={handleReflowAI} disabled={reflowing}
            className="flex items-center justify-center gap-1.5 py-1.5 text-[10px] rounded border transition-colors disabled:opacity-40 disabled:cursor-not-allowed bg-white/5 border-white/10 text-white/60 hover:text-indigo-400 hover:border-indigo-500/40">
            <Sparkles className="w-3 h-3" />
            {reflowing ? 'Ré-agencement…' : "Ré-agencer avec l'IA (Fluide)"}
          </button>
        </div>
      </section>

      {/* ── Arrière-plan ── */}
      <section data-tour="opt-page-bg" className="flex flex-col gap-2 pt-3 border-t border-white/5">
        <label className="flex items-center gap-1 text-[10px] text-white/40 uppercase tracking-wider font-semibold">
          Arrière-plan
          <OptionHelp text="Fond de la page : couleur unie, dégradé, ou image. L'image de fond est verrouillée derrière les objets ; le dégradé est paramétrable (angle, étapes)." />
        </label>

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
