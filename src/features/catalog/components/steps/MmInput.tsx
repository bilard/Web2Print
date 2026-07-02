import { useState } from 'react'

const inputClass = 'w-24 px-3 py-1.5 rounded-md bg-surface-2 text-sm text-white outline-none focus:ring-1 focus:ring-indigo-600'

const MIN_MM = 50
const MAX_MM = 2000

function clampMm(v: number): number {
  if (Number.isNaN(v)) return MIN_MM
  return Math.min(MAX_MM, Math.max(MIN_MM, Math.round(v)))
}

export function MmInput({ value, onValueChange }: {
  value: number
  onValueChange: (v: number) => void
}) {
  const [draft, setDraft] = useState(String(value))

  const handleBlur = () => {
    const n = Number(draft)
    if (Number.isNaN(n) || draft.trim() === '') {
      // Vide ou invalide → retomber sur la valeur courante
      setDraft(String(value))
    } else {
      // Nombre valide → clamper et appliquer
      const clamped = clampMm(n)
      onValueChange(clamped)
      setDraft(String(clamped))
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.currentTarget.blur()
      // blur() triggers onBlur handler which commits once — no double-invoke
    }
  }

  return (
    <input
      type="text"
      inputMode="numeric"
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={handleBlur}
      onKeyDown={handleKeyDown}
      className={inputClass}
    />
  )
}
