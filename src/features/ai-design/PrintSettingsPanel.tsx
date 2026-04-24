import { useState } from 'react'
import { ChevronDown, Printer } from 'lucide-react'
import { useUIStore } from '@/stores/ui.store'

interface Props {
  defaultOpen?: boolean
}

export function PrintSettingsPanel({ defaultOpen = false }: Props) {
  const dpi = useUIStore((s) => s.dpi)
  const bleedMm = useUIStore((s) => s.bleedMm)
  const showPrintMarks = useUIStore((s) => s.showPrintMarks)
  const showSafeArea = useUIStore((s) => s.showSafeArea)
  const setDpi = useUIStore((s) => s.setDpi)
  const setBleedMm = useUIStore((s) => s.setBleedMm)
  const setShowPrintMarks = useUIStore((s) => s.setShowPrintMarks)
  const setShowSafeArea = useUIStore((s) => s.setShowSafeArea)

  const [isOpen, setIsOpen] = useState(defaultOpen)

  return (
    <div className="rounded border border-neutral-800 bg-[#1a1a1a] overflow-hidden">
      <button
        type="button"
        onClick={() => setIsOpen((v) => !v)}
        className="w-full flex items-center justify-between px-3 py-2.5 hover:bg-neutral-800/50 transition-colors"
        aria-expanded={isOpen}
      >
        <div className="flex items-center gap-2">
          <Printer className="w-3.5 h-3.5 text-neutral-400" />
          <span className="text-sm font-medium text-neutral-200">Paramètres PRINT</span>
          <span className="text-[10px] text-neutral-500 font-mono tabular-nums">
            {dpi} DPI · {bleedMm} mm bleed
          </span>
        </div>
        <ChevronDown
          className={`w-4 h-4 text-neutral-400 transition-transform ${isOpen ? 'rotate-180' : ''}`}
        />
      </button>

      {isOpen && (
        <div className="px-3 pb-3 pt-1 space-y-4 border-t border-neutral-800">
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
              className="w-full accent-indigo-500"
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
            Pour un PDF prêt à imprimer, ouvre <span className="text-neutral-300">Exporter → PDF</span> et coche
            <span className="text-neutral-300"> « Export print (traits de coupe + bleed) »</span>.
          </p>
        </div>
      )}
    </div>
  )
}
