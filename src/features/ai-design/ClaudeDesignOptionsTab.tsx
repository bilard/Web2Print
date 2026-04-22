import { useDesignBrief, useDesignBriefStore } from '@/stores/designBrief.store'
import { getFormatById } from '@/features/print/PRINT_FORMATS'

export function ClaudeDesignOptionsTab() {
  const brief = useDesignBrief()
  const setBrief = useDesignBriefStore((s) => s.setBrief)

  // Get format label and dimensions for display
  let formatDisplay = 'Personnalisé'
  if (brief.formatId !== 'custom') {
    const fmt = getFormatById(brief.formatId)
    if (fmt) {
      formatDisplay = `${fmt.label} — ${fmt.widthMm} × ${fmt.heightMm} mm`
    }
  } else {
    formatDisplay = `Personnalisé — ${brief.customWidthMm ?? 0} × ${brief.customHeightMm ?? 0} mm`
  }

  return (
    <div className="space-y-6">
      {/* Format section - read-only display */}
      <div className="space-y-2">
        <label className="text-xs uppercase tracking-wide text-neutral-400">Format</label>
        <div className="px-3 py-2 bg-[#0f0f0f] border border-neutral-800 rounded text-sm text-neutral-300 flex items-center gap-2">
          <span>📄</span>
          <span>{formatDisplay}</span>
        </div>
      </div>

      {/* Palette section */}
      <div className="space-y-1">
        <label className="text-xs uppercase tracking-wide text-neutral-400">Palette (optionnel)</label>
        <input
          type="text"
          value={brief.paletteText}
          onChange={(e) => setBrief({ paletteText: e.target.value })}
          placeholder="#ff6b35, #1a1a1a, #ffffff"
          className="w-full bg-[#0f0f0f] border border-neutral-800 rounded px-3 py-2 text-sm font-mono text-neutral-200 placeholder-neutral-600"
        />
        <p className="text-[10px] text-neutral-500">Hex séparés par virgule. Laisser vide = Claude choisit.</p>
      </div>

      {/* Bleed section */}
      <label className="flex items-center gap-2 text-sm cursor-pointer">
        <input
          type="checkbox"
          checked={brief.includeBleed}
          onChange={(e) => setBrief({ includeBleed: e.target.checked })}
          className="accent-indigo-500 rounded"
        />
        <span className="text-neutral-200">Inclure fond perdu (recommandé si impression)</span>
      </label>
    </div>
  )
}
