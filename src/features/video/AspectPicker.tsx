import type { AspectFormat } from './types'

export type AspectChoice = AspectFormat | 'auto' | 'custom'

export interface CustomDims {
  width: number
  height: number
}

const OPTIONS: Array<{ id: AspectChoice; label: string }> = [
  { id: 'auto', label: 'Auto' },
  { id: 'portrait', label: '9:16' },
  { id: 'square', label: '1:1' },
  { id: 'landscape', label: '16:9' },
  { id: 'custom', label: 'Custom' },
]

interface Props {
  value: AspectChoice
  onChange: (value: AspectChoice) => void
  custom: CustomDims
  onCustomChange: (next: CustomDims) => void
  disabled?: boolean
}

const MIN_DIM = 240
const MAX_DIM = 4096

function clampDim(n: number): number {
  if (!Number.isFinite(n)) return MIN_DIM
  return Math.max(MIN_DIM, Math.min(MAX_DIM, Math.round(n)))
}

export function AspectPicker({ value, onChange, custom, onCustomChange, disabled }: Props) {
  const ratio = custom.width / custom.height
  const ratioLabel = Number.isFinite(ratio) ? `${ratio.toFixed(2)} : 1` : '—'

  return (
    <div>
      <label className="block text-[10px] font-semibold text-white/40 uppercase tracking-[0.15em] mb-2.5">
        Format
      </label>
      <div className="flex gap-1.5">
        {OPTIONS.map(({ id, label }) => {
          const active = value === id
          return (
            <button
              key={id}
              type="button"
              onClick={() => onChange(id)}
              disabled={disabled}
              className={`group relative flex-1 py-2.5 text-[11px] font-medium rounded-xl border transition-all duration-200 ${
                active
                  ? 'bg-gradient-to-br from-indigo-500/25 via-indigo-500/15 to-fuchsia-500/10 border-indigo-400/60 text-white shadow-[0_0_24px_-4px_rgba(99,102,241,0.45)]'
                  : 'bg-white/[0.03] border-white/10 text-white/45 hover:bg-white/[0.06] hover:border-white/20 hover:text-white/80'
              } disabled:opacity-50 disabled:cursor-not-allowed`}
            >
              {active && (
                <span className="absolute top-1.5 right-1.5 w-1 h-1 rounded-full bg-indigo-400 shadow-[0_0_6px_rgba(99,102,241,0.8)]" />
              )}
              {label}
            </button>
          )
        })}
      </div>

      {value === 'custom' && (
        <div className="mt-2 flex items-end gap-2 bg-white/3 border border-white/10 rounded-lg p-2.5">
          <div className="flex-1">
            <label className="block text-[10px] font-semibold text-white/40 uppercase tracking-wider mb-1">
              Largeur (px)
            </label>
            <input
              type="number"
              min={MIN_DIM}
              max={MAX_DIM}
              step={1}
              value={custom.width}
              onChange={(e) => onCustomChange({ ...custom, width: clampDim(Number(e.target.value)) })}
              disabled={disabled}
              className="w-full bg-black/30 border border-white/10 rounded px-2 py-1.5 text-sm text-white focus:border-indigo-500/60 focus:outline-none disabled:opacity-50"
            />
          </div>
          <div className="text-white/30 pb-2 select-none">×</div>
          <div className="flex-1">
            <label className="block text-[10px] font-semibold text-white/40 uppercase tracking-wider mb-1">
              Hauteur (px)
            </label>
            <input
              type="number"
              min={MIN_DIM}
              max={MAX_DIM}
              step={1}
              value={custom.height}
              onChange={(e) => onCustomChange({ ...custom, height: clampDim(Number(e.target.value)) })}
              disabled={disabled}
              className="w-full bg-black/30 border border-white/10 rounded px-2 py-1.5 text-sm text-white focus:border-indigo-500/60 focus:outline-none disabled:opacity-50"
            />
          </div>
          <div className="text-[10px] text-white/40 pb-2 font-mono tabular-nums shrink-0 min-w-[60px] text-right">
            {ratioLabel}
          </div>
        </div>
      )}
    </div>
  )
}
