import { useEffect, useRef, useState } from 'react'
import { Sparkles, Loader2 } from 'lucide-react'
import { FormatSelector } from './FormatSelector'
import { PrintSettingsPanel } from './PrintSettingsPanel'
import { DesignProgress } from './DesignProgress'
import { useGenerateDesign } from './useGenerateDesign'
import type { DesignStyle, DesignRequest } from './types'
import { PRINT_FORMATS, getFormatById } from '@/features/print/PRINT_FORMATS'
import { useUIStore } from '@/stores/ui.store'
import { useDesignBrief, useDesignBriefStore } from '@/stores/designBrief.store'
import { mmToPx, pxToMm } from '@/features/print/dimensions'

const STYLES: Array<{ id: DesignStyle; label: string; emoji: string }> = [
  { id: 'corporate',   label: 'Corporate',    emoji: '🏢' },
  { id: 'minimaliste', label: 'Minimaliste',  emoji: '◽' },
  { id: 'bold',        label: 'Bold',         emoji: '💥' },
  { id: 'elegant',     label: 'Élégant',      emoji: '✨' },
  { id: 'playful',     label: 'Playful',      emoji: '🎨' },
  { id: 'retro',       label: 'Rétro',        emoji: '📻' },
]

export function DesignPromptPanel() {
  const brief = useDesignBrief()
  const setBrief = useDesignBriefStore((s) => s.setBrief)
  const [progressDismissed, setProgressDismissed] = useState(false)

  const { state, generate } = useGenerateDesign()
  const isRunning = state.step !== 'idle' && state.step !== 'done' && state.step !== 'error'
  const showProgress = !progressDismissed && state.step !== 'idle'

  const canvasWidth = useUIStore((s) => s.canvasWidth)
  const canvasHeight = useUIStore((s) => s.canvasHeight)
  // Distingue « l'utilisateur a changé le dropdown » vs « la dropdown a été
  // resync depuis le canvas externe ». Évite de boucler / d'écraser le format
  // choisi via « Créer un document » ou un import.
  const userChangedFormatRef = useRef(false)

  // (1) Push : seulement quand l'utilisateur change le dropdown.
  // Utilise le `nativeDpi` du format pour la conversion mm → px (300 print, 96 écran/social).
  useEffect(() => {
    if (!userChangedFormatRef.current) return
    userChangedFormatRef.current = false
    let widthMm: number | undefined
    let heightMm: number | undefined
    let dpiToUse = useUIStore.getState().dpi
    if (brief.formatId === 'custom') {
      widthMm = brief.customWidthMm
      heightMm = brief.customHeightMm
    } else {
      const f = getFormatById(brief.formatId)
      if (f) {
        widthMm = f.widthMm
        heightMm = f.heightMm
        dpiToUse = f.nativeDpi ?? dpiToUse
      }
    }
    if (!widthMm || !heightMm) return
    const wPx = Math.round(mmToPx(widthMm, dpiToUse))
    const hPx = Math.round(mmToPx(heightMm, dpiToUse))
    if (canvasWidth !== wPx || canvasHeight !== hPx) {
      useUIStore.getState().setCanvasSize(wPx, hPx, useUIStore.getState().canvasBg)
    }
  }, [brief.formatId, brief.customWidthMm, brief.customHeightMm, canvasWidth, canvasHeight])

  // (2) Pull : reflète passivement le canvas réel dans la dropdown.
  // Test chaque format avec son `nativeDpi` propre — un canvas 1584×396 px
  // matche LinkedIn Banner (96 DPI), pas un format print arbitraire.
  useEffect(() => {
    const uiDpi = useUIStore.getState().dpi
    // If the hydrated brief already matches the canvas dims, don't rewrite it.
    // Prevents silent clobber on project load (e.g. 'pos-a6-counter' → 'a6'
    // because they share 105×148mm, or a deliberate 'custom' at A4 dims).
    if (brief.formatId === 'custom') {
      if (brief.customWidthMm && brief.customHeightMm) {
        const wPx = Math.round(mmToPx(brief.customWidthMm, uiDpi))
        const hPx = Math.round(mmToPx(brief.customHeightMm, uiDpi))
        if (Math.abs(wPx - canvasWidth) <= 2 && Math.abs(hPx - canvasHeight) <= 2) return
      }
    } else {
      const current = getFormatById(brief.formatId)
      if (current) {
        const dpi = current.nativeDpi ?? uiDpi
        const wPx = Math.round(mmToPx(current.widthMm, dpi))
        const hPx = Math.round(mmToPx(current.heightMm, dpi))
        if (Math.abs(wPx - canvasWidth) <= 2 && Math.abs(hPx - canvasHeight) <= 2) return
      }
    }
    const match = PRINT_FORMATS.find((f) => {
      const dpi = f.nativeDpi ?? uiDpi
      const wPx = Math.round(mmToPx(f.widthMm, dpi))
      const hPx = Math.round(mmToPx(f.heightMm, dpi))
      return Math.abs(wPx - canvasWidth) <= 2 && Math.abs(hPx - canvasHeight) <= 2
    })
    if (match) {
      if (match.id !== brief.formatId) setBrief({ formatId: match.id })
    } else {
      const wMm = Math.round(pxToMm(canvasWidth, uiDpi))
      const hMm = Math.round(pxToMm(canvasHeight, uiDpi))
      if (brief.formatId !== 'custom' || brief.customWidthMm !== wMm || brief.customHeightMm !== hMm) {
        setBrief({ formatId: 'custom', customWidthMm: wMm, customHeightMm: hMm })
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canvasWidth, canvasHeight])

  const onSubmit = () => {
    if (!brief.prompt.trim() || isRunning) return

    const palette = brief.paletteText
      .split(/[\s,]+/)
      .map((c) => c.trim())
      .filter((c) => /^#[0-9a-fA-F]{6}$/.test(c))

    const req: DesignRequest = {
      prompt: brief.prompt.trim(),
      formatId: brief.formatId,
      customWidthMm: brief.customWidthMm,
      customHeightMm: brief.customHeightMm,
      style: brief.style,
      includeBleed: brief.includeBleed,
      palette: palette.length > 0 ? palette : undefined,
    }
    setProgressDismissed(false)
    generate(req)
  }

  return (
    <div className="flex flex-col gap-4 p-4 text-neutral-200">
      <div className="space-y-1">
        <label className="text-xs uppercase tracking-wide text-neutral-400">Votre brief</label>
        <textarea
          value={brief.prompt}
          onChange={(e) => setBrief({ prompt: e.target.value })}
          placeholder="Ex : Affiche promo soldes d'été -30% pour magasin de chaussures, ambiance bord de mer"
          rows={4}
          className="w-full bg-[#1a1a1a] border border-neutral-800 rounded px-2 py-1.5 text-sm resize-none"
        />
      </div>

      <FormatSelector
        formatId={brief.formatId}
        customWidthMm={brief.customWidthMm}
        customHeightMm={brief.customHeightMm}
        disabled={isRunning}
        onChange={(v) => {
          userChangedFormatRef.current = true
          setBrief({
            formatId: v.formatId,
            customWidthMm: v.customWidthMm,
            customHeightMm: v.customHeightMm,
          })
        }}
      />

      <div className="space-y-1">
        <label className="text-xs uppercase tracking-wide text-neutral-400">Style</label>
        <div className="grid grid-cols-3 gap-1.5">
          {STYLES.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => setBrief({ style: s.id })}
              className={`text-xs py-2 rounded border transition-colors ${
                brief.style === s.id
                  ? 'bg-indigo-500/20 border-indigo-500 text-indigo-200'
                  : 'bg-[#1a1a1a] border-neutral-800 hover:border-neutral-700'
              }`}
            >
              <div>{s.emoji}</div>
              <div>{s.label}</div>
            </button>
          ))}
        </div>
      </div>

      <label className="flex items-center gap-2 text-sm cursor-pointer">
        <input
          type="checkbox"
          checked={brief.includeBleed}
          onChange={(e) => setBrief({ includeBleed: e.target.checked })}
          className="accent-indigo-500"
        />
        <span>Inclure fond perdu (recommandé si impression)</span>
      </label>

      <div className="space-y-1">
        <label className="text-xs uppercase tracking-wide text-neutral-400">Palette (optionnel)</label>
        <input
          type="text"
          value={brief.paletteText}
          onChange={(e) => setBrief({ paletteText: e.target.value })}
          placeholder="#ff6b35, #1a1a1a, #ffffff"
          className="w-full bg-[#1a1a1a] border border-neutral-800 rounded px-2 py-1 text-sm font-mono"
        />
        <p className="text-[10px] text-neutral-500">Hex séparés par virgule. Laisser vide = Claude choisit.</p>
      </div>

      <PrintSettingsPanel />

      <button
        type="button"
        onClick={onSubmit}
        disabled={isRunning || !brief.prompt.trim()}
        className="flex items-center justify-center gap-2 py-2 rounded bg-indigo-500 text-white font-medium text-sm disabled:opacity-40 disabled:cursor-not-allowed hover:bg-indigo-400 transition-colors"
      >
        {isRunning ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
        {isRunning ? 'Génération…' : 'Générer'}
      </button>

      {showProgress && (
        <DesignProgress
          step={state.step}
          progress={state.progress}
          error={state.error}
          lastResult={state.lastResult}
          lastPlan={state.lastPlan}
          onClose={() => setProgressDismissed(true)}
          onRetry={() => {
            setProgressDismissed(true)
            setTimeout(onSubmit, 50)
          }}
        />
      )}
    </div>
  )
}
