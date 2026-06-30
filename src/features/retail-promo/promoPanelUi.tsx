import { useState, type ReactNode } from 'react'
import { ChevronRight } from 'lucide-react'

export const inputCls = 'w-full rounded border border-white/10 bg-well px-2 py-1 text-sm text-white outline-none focus:border-[#6366f1] placeholder:text-white/25 [&>option]:bg-neutral-900'
const labelCls = 'flex flex-col gap-1 text-[11px] uppercase tracking-wide text-white/40'

/** Section repliable (icône chevron). */
export function Section({ title, children, defaultOpen = true, badge }: { title: string; children: ReactNode; defaultOpen?: boolean; badge?: ReactNode }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="border-b border-white/5">
      <button onClick={() => setOpen((o) => !o)} className="flex w-full items-center gap-2 py-2.5 text-xs font-semibold uppercase tracking-wide text-white/60 hover:text-white">
        <ChevronRight className={`h-3.5 w-3.5 transition-transform ${open ? 'rotate-90' : ''}`} /> {title}
        {badge != null && <span className="ml-auto text-[#818cf8]">{badge}</span>}
      </button>
      {open && <div className="pb-3">{children}</div>}
    </div>
  )
}

/** Champ numérique avec unité (auto si vide). */
export function NumField({ label, value, onChange, step = 1, min, max, unit, placeholder = 'auto' }: {
  label: string; value?: number; onChange: (v: number | undefined) => void; step?: number; min?: number; max?: number; unit?: string; placeholder?: string
}) {
  return (
    <label className={labelCls}>{label}{unit ? ` (${unit})` : ''}
      <input type="number" value={value ?? ''} step={step} min={min} max={max} placeholder={placeholder}
        onChange={(e) => onChange(e.target.value === '' ? undefined : Number(e.target.value))} className={inputCls} />
    </label>
  )
}

/** Liste déroulante. */
export function SelectField<T extends string>({ label, value, options, onChange }: {
  label: string; value: T; options: Array<{ v: T; label: string }>; onChange: (v: T) => void
}) {
  return (
    <label className={labelCls}>{label}
      <select value={value} onChange={(e) => onChange(e.target.value as T)} className={inputCls}>
        {options.map((o) => <option key={o.v} value={o.v}>{o.label}</option>)}
      </select>
    </label>
  )
}

/** Curseur 0-100 % (valeur stockée 0..1). */
export function SliderField({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <label className={labelCls}>{label} ({Math.round(value * 100)} %)
      <input type="range" min={0} max={1} step={0.01} value={value} onChange={(e) => onChange(Number(e.target.value))} className="w-full accent-[#6366f1]" />
    </label>
  )
}

/** Groupe de boutons icône/texte exclusifs. */
export function SegButtons<T extends string>({ value, options, onChange }: {
  value: T | undefined; options: Array<{ v: T; node: ReactNode; title?: string }>; onChange: (v: T) => void
}) {
  return (
    <div className="flex gap-1">
      {options.map((o) => (
        <button key={o.v} type="button" title={o.title} onClick={() => onChange(o.v)}
          className={`flex flex-1 items-center justify-center rounded border border-white/10 py-1 text-sm ${value === o.v ? 'bg-[#6366f1] text-[#fff]' : 'bg-well text-white/70 hover:bg-white/10'}`}>
          {o.node}
        </button>
      ))}
    </div>
  )
}
