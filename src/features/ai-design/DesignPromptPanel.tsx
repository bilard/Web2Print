import { useState } from 'react'
import { Sparkles, Loader2, AlertTriangle } from 'lucide-react'
import { FormatSelector } from './FormatSelector'
import { PrintSettingsPanel } from './PrintSettingsPanel'
import { useGenerateDesign } from './useGenerateDesign'
import type { DesignStyle, DesignRequest } from './types'
import { DEFAULT_FORMAT_ID } from '@/features/print/PRINT_FORMATS'

const STYLES: Array<{ id: DesignStyle; label: string; emoji: string }> = [
  { id: 'corporate',   label: 'Corporate',    emoji: '🏢' },
  { id: 'minimaliste', label: 'Minimaliste',  emoji: '◽' },
  { id: 'bold',        label: 'Bold',         emoji: '💥' },
  { id: 'elegant',     label: 'Élégant',      emoji: '✨' },
  { id: 'playful',     label: 'Playful',      emoji: '🎨' },
  { id: 'retro',       label: 'Rétro',        emoji: '📻' },
]

export function DesignPromptPanel() {
  const [prompt, setPrompt] = useState('')
  const [formatId, setFormatId] = useState(DEFAULT_FORMAT_ID)
  const [customWidthMm, setCustomWidthMm] = useState<number | undefined>()
  const [customHeightMm, setCustomHeightMm] = useState<number | undefined>()
  const [style, setStyle] = useState<DesignStyle>('corporate')
  const [includeBleed, setIncludeBleed] = useState(true)
  const [paletteText, setPaletteText] = useState('')

  const { state, generate } = useGenerateDesign()
  const isRunning = state.step !== 'idle' && state.step !== 'done' && state.step !== 'error'

  const onSubmit = () => {
    if (!prompt.trim() || isRunning) return

    const palette = paletteText
      .split(/[\s,]+/)
      .map((c) => c.trim())
      .filter((c) => /^#[0-9a-fA-F]{6}$/.test(c))

    const req: DesignRequest = {
      prompt: prompt.trim(),
      formatId,
      customWidthMm,
      customHeightMm,
      style,
      includeBleed,
      palette: palette.length > 0 ? palette : undefined,
    }
    generate(req)
  }

  return (
    <div className="flex flex-col gap-4 p-4 w-[320px] bg-[#0f0f0f] text-neutral-200 overflow-y-auto h-full">
      <div className="flex items-center gap-2">
        <Sparkles className="w-4 h-4 text-indigo-400" />
        <h2 className="text-sm font-semibold">Claude Design</h2>
      </div>

      <div className="space-y-1">
        <label className="text-xs uppercase tracking-wide text-neutral-400">Votre brief</label>
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="Ex : Affiche promo soldes d'été -30% pour magasin de chaussures, ambiance bord de mer"
          rows={4}
          className="w-full bg-[#1a1a1a] border border-neutral-800 rounded px-2 py-1.5 text-sm resize-none"
        />
      </div>

      <FormatSelector
        formatId={formatId}
        customWidthMm={customWidthMm}
        customHeightMm={customHeightMm}
        onChange={(v) => {
          setFormatId(v.formatId)
          setCustomWidthMm(v.customWidthMm)
          setCustomHeightMm(v.customHeightMm)
        }}
      />

      <div className="space-y-1">
        <label className="text-xs uppercase tracking-wide text-neutral-400">Style</label>
        <div className="grid grid-cols-3 gap-1.5">
          {STYLES.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => setStyle(s.id)}
              className={`text-xs py-2 rounded border transition-colors ${
                style === s.id
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
          checked={includeBleed}
          onChange={(e) => setIncludeBleed(e.target.checked)}
          className="accent-indigo-500"
        />
        <span>Inclure fond perdu (recommandé si impression)</span>
      </label>

      <div className="space-y-1">
        <label className="text-xs uppercase tracking-wide text-neutral-400">Palette (optionnel)</label>
        <input
          type="text"
          value={paletteText}
          onChange={(e) => setPaletteText(e.target.value)}
          placeholder="#ff6b35, #1a1a1a, #ffffff"
          className="w-full bg-[#1a1a1a] border border-neutral-800 rounded px-2 py-1 text-sm font-mono"
        />
        <p className="text-[10px] text-neutral-500">Hex séparés par virgule. Laisser vide = Claude choisit.</p>
      </div>

      <PrintSettingsPanel />

      <button
        type="button"
        onClick={onSubmit}
        disabled={isRunning || !prompt.trim()}
        className="flex items-center justify-center gap-2 py-2 rounded bg-indigo-500 text-white font-medium text-sm disabled:opacity-40 disabled:cursor-not-allowed hover:bg-indigo-400 transition-colors"
      >
        {isRunning ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
        {isRunning ? state.progress || 'Génération…' : 'Générer'}
      </button>

      {state.step === 'error' && (
        <div className="flex items-start gap-2 p-2 bg-red-500/10 border border-red-500/30 rounded text-xs text-red-300">
          <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <div>{state.error}</div>
        </div>
      )}

      {state.step === 'done' && state.lastResult && (
        <div className="p-2 bg-emerald-500/10 border border-emerald-500/30 rounded text-xs text-emerald-300 space-y-1">
          <div className="font-medium">Design prêt sur le canvas</div>
          <div className="text-neutral-400 text-[11px]">{state.lastResult.rationale}</div>
          {state.lastResult.slots.length > 0 && (
            <div className="text-[11px]">
              {state.lastResult.slots.length} slot(s) image à remplir manuellement
            </div>
          )}
        </div>
      )}
    </div>
  )
}
