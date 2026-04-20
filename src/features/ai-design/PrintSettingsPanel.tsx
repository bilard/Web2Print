import { useUIStore } from '@/stores/ui.store'

export function PrintSettingsPanel() {
  const dpi = useUIStore((s) => s.dpi)
  const bleedMm = useUIStore((s) => s.bleedMm)
  const showPrintMarks = useUIStore((s) => s.showPrintMarks)
  const showSafeArea = useUIStore((s) => s.showSafeArea)
  const setDpi = useUIStore((s) => s.setDpi)
  const setBleedMm = useUIStore((s) => s.setBleedMm)
  const setShowPrintMarks = useUIStore((s) => s.setShowPrintMarks)
  const setShowSafeArea = useUIStore((s) => s.setShowSafeArea)

  return (
    <div className="space-y-4 p-3 bg-[#1a1a1a] border border-neutral-800 rounded">
      <h3 className="text-sm font-medium">Impression</h3>

      <div className="space-y-1">
        <label className="text-xs uppercase tracking-wide text-neutral-400">Résolution (DPI)</label>
        <select
          value={dpi}
          onChange={(e) => setDpi(Number(e.target.value))}
          className="w-full bg-[#0f0f0f] border border-neutral-800 rounded px-2 py-1 text-sm"
        >
          <option value={72}>72 DPI — web</option>
          <option value={150}>150 DPI — numérique léger</option>
          <option value={300}>300 DPI — offset (recommandé)</option>
          <option value={600}>600 DPI — très haute définition</option>
        </select>
      </div>

      <div className="space-y-1">
        <label className="text-xs uppercase tracking-wide text-neutral-400">
          Fond perdu (bleed) : <span className="text-neutral-200">{bleedMm} mm</span>
        </label>
        <input
          type="range"
          min={0}
          max={10}
          step={1}
          value={bleedMm}
          onChange={(e) => setBleedMm(Number(e.target.value))}
          className="w-full"
        />
        <div className="flex justify-between text-[10px] text-neutral-500">
          <span>Aucun</span>
          <span>3 mm (offset)</span>
          <span>5 mm (numérique)</span>
          <span>10 mm</span>
        </div>
      </div>

      <div className="space-y-2 pt-1 border-t border-neutral-800">
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <input
            type="checkbox"
            checked={showPrintMarks}
            onChange={(e) => setShowPrintMarks(e.target.checked)}
            className="accent-indigo-500"
          />
          <span>Afficher traits de coupe & bleed</span>
        </label>

        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <input
            type="checkbox"
            checked={showSafeArea}
            onChange={(e) => setShowSafeArea(e.target.checked)}
            className="accent-indigo-500"
          />
          <span>Afficher zone de sécurité</span>
        </label>
      </div>

      <p className="text-[11px] text-neutral-500 leading-relaxed">
        Les repères sont purement visuels et n'apparaissent pas dans l'export standard.
        Pour un export avec traits de coupe intégrés, utilisez l'option "Export print" (à venir).
      </p>
    </div>
  )
}
