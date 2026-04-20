import { PRINT_FORMATS, type PrintFormat } from '@/features/print/PRINT_FORMATS'

interface Props {
  formatId: string
  customWidthMm?: number
  customHeightMm?: number
  onChange: (v: { formatId: string; customWidthMm?: number; customHeightMm?: number }) => void
}

const GROUPS: Array<{ category: PrintFormat['category']; label: string }> = [
  { category: 'paper',  label: 'Papier' },
  { category: 'flyer',  label: 'Flyers' },
  { category: 'poster', label: 'Affiches' },
  { category: 'pos',    label: 'PLV / POS' },
]

export function FormatSelector({ formatId, customWidthMm, customHeightMm, onChange }: Props) {
  const isCustom = formatId === 'custom'

  return (
    <div className="space-y-2">
      <label className="text-xs uppercase tracking-wide text-neutral-400">Format</label>
      <select
        value={formatId}
        onChange={(e) => onChange({ formatId: e.target.value, customWidthMm, customHeightMm })}
        className="w-full bg-[#1a1a1a] border border-neutral-800 rounded px-2 py-1.5 text-sm"
      >
        {GROUPS.map((g) => (
          <optgroup key={g.category} label={g.label}>
            {PRINT_FORMATS.filter((f) => f.category === g.category).map((f) => (
              <option key={f.id} value={f.id}>{f.label}</option>
            ))}
          </optgroup>
        ))}
        <option value="custom">Personnalisé…</option>
      </select>

      {isCustom && (
        <div className="grid grid-cols-2 gap-2 pt-1">
          <div>
            <label className="text-xs text-neutral-400">Largeur (mm)</label>
            <input
              type="number"
              min={10}
              max={2000}
              value={customWidthMm ?? 210}
              onChange={(e) => onChange({ formatId: 'custom', customWidthMm: Number(e.target.value), customHeightMm })}
              className="w-full bg-[#1a1a1a] border border-neutral-800 rounded px-2 py-1 text-sm"
            />
          </div>
          <div>
            <label className="text-xs text-neutral-400">Hauteur (mm)</label>
            <input
              type="number"
              min={10}
              max={2000}
              value={customHeightMm ?? 297}
              onChange={(e) => onChange({ formatId: 'custom', customWidthMm, customHeightMm: Number(e.target.value) })}
              className="w-full bg-[#1a1a1a] border border-neutral-800 rounded px-2 py-1 text-sm"
            />
          </div>
        </div>
      )}
    </div>
  )
}
