// src/features/catalog/components/steps/PageOptionControls.tsx
// Contrôles partagés du panneau « Fond de page » (aperçu) : section, toggle,
// slider et champ texte — mêmes idiomes que le reste de l'app (options à droite).
import type { ReactNode } from 'react'

export const optFieldClass = 'w-full px-2.5 py-1.5 rounded-md bg-surface-2 text-xs text-white outline-none focus:ring-1 focus:ring-indigo-600'

export function OptSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-2 border-b border-border pb-3 last:border-b-0">
      <h4 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">{title}</h4>
      {children}
    </section>
  )
}

export function OptToggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer select-none">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="accent-indigo-600" />
      {label}
    </label>
  )
}

interface SliderProps { label: string; value: number; min: number; max: number; step: number; unit?: string; onChange: (v: number) => void }

export function OptSlider({ label, value, min, max, step, unit, onChange }: SliderProps) {
  return (
    <label className="flex flex-col gap-1 text-xs text-muted-foreground">
      <span className="flex items-center justify-between">
        {label}
        <span className="tabular-nums text-white">{unit ? `${value}${unit}` : `${Math.round(value * 100)}%`}</span>
      </span>
      <input type="range" min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(Number(e.target.value))} className="w-full accent-indigo-500" />
    </label>
  )
}
