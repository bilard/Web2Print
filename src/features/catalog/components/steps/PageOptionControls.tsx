// src/features/catalog/components/steps/PageOptionControls.tsx
// Contrôles partagés du panneau « Fond de page » (aperçu) : section, toggle,
// slider et champ texte — mêmes idiomes que le reste de l'app (options à droite).
import type { ReactNode } from 'react'
import { PropertySection } from '@/components/shared/panel'

export const optFieldClass = 'w-full px-2.5 py-1.5 rounded-md bg-well text-xs text-white outline-none border border-white/10 focus:border-[#6366f1]'

/** Alias repliable du kit partagé — même signature `{ title, children }`, tous les
 * appelants (PageOptionsPanel/Cover/Theme) deviennent repliables sans changer. */
export function OptSection({ title, children }: { title: string; children: ReactNode }) {
  return <PropertySection title={title}>{children}</PropertySection>
}

export function OptToggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center gap-2 text-xs text-white/40 cursor-pointer select-none">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="accent-indigo-600" />
      {label}
    </label>
  )
}

interface SliderProps { label: string; value: number; min: number; max: number; step: number; unit?: string; onChange: (v: number) => void }

export function OptSlider({ label, value, min, max, step, unit, onChange }: SliderProps) {
  return (
    <label className="flex flex-col gap-1 text-xs text-white/40">
      <span className="flex items-center justify-between">
        {label}
        <span className="tabular-nums text-white">{unit ? `${value}${unit}` : `${Math.round(value * 100)}%`}</span>
      </span>
      <input type="range" min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(Number(e.target.value))} className="w-full accent-indigo-500" />
    </label>
  )
}
