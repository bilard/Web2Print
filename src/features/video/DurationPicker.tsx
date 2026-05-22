import { useEffect, useState } from 'react'

export type DurationChoice = 5 | 10 | 15 | 30 | 'custom'

const OPTIONS: Array<{ id: DurationChoice; label: string }> = [
  { id: 5, label: '5 s' },
  { id: 10, label: '10 s' },
  { id: 15, label: '15 s' },
  { id: 30, label: '30 s' },
  { id: 'custom', label: 'Custom' },
]

interface Props {
  value: DurationChoice
  onChange: (value: DurationChoice) => void
  customSec: number
  onCustomSecChange: (next: number) => void
  disabled?: boolean
}

const MIN_SEC = 3
const MAX_SEC = 60

function clampSec(n: number): number {
  if (!Number.isFinite(n)) return MIN_SEC
  return Math.max(MIN_SEC, Math.min(MAX_SEC, Math.round(n)))
}

/** Résout le choix UI en valeur en secondes utilisable par le pipeline. */
export function resolveDurationSec(value: DurationChoice, customSec: number): number {
  return value === 'custom' ? clampSec(customSec) : value
}

export function DurationPicker({ value, onChange, customSec, onCustomSecChange, disabled }: Props) {
  return (
    <div>
      <label className="block text-[10px] font-semibold text-white/40 uppercase tracking-[0.15em] mb-2.5">
        Durée
      </label>
      <div className="flex gap-1.5">
        {OPTIONS.map(({ id, label }) => {
          const active = value === id
          return (
            <button
              key={String(id)}
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
        <CustomDurationInput
          customSec={customSec}
          onCustomSecChange={onCustomSecChange}
          disabled={disabled}
        />
      )}
    </div>
  )
}

/** Champ libre avec entrée brute pendant l'édition — on ne clamp qu'au blur,
 *  sinon `Number('')` → NaN → clamp force MIN_SEC à chaque keystroke et bloque
 *  l'utilisateur qui veut vider/retaper la valeur. */
function CustomDurationInput({
  customSec,
  onCustomSecChange,
  disabled,
}: {
  customSec: number
  onCustomSecChange: (n: number) => void
  disabled?: boolean
}) {
  const [raw, setRaw] = useState(String(customSec))

  useEffect(() => {
    setRaw(String(customSec))
  }, [customSec])

  const commit = () => {
    const n = Number(raw)
    const clamped = Number.isFinite(n) ? clampSec(n) : MIN_SEC
    setRaw(String(clamped))
    if (clamped !== customSec) onCustomSecChange(clamped)
  }

  return (
    <div className="mt-2 flex items-end gap-2 bg-white/3 border border-white/10 rounded-lg p-2.5">
      <div className="flex-1">
        <label className="block text-[10px] font-semibold text-white/40 uppercase tracking-wider mb-1">
          Secondes (3–60)
        </label>
        <input
          type="number"
          min={MIN_SEC}
          max={MAX_SEC}
          step={1}
          value={raw}
          onChange={(e) => setRaw(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
          }}
          disabled={disabled}
          className="w-full bg-black/30 border border-white/10 rounded px-2 py-1.5 text-sm text-white focus:border-indigo-500/60 focus:outline-none disabled:opacity-50"
        />
      </div>
    </div>
  )
}
