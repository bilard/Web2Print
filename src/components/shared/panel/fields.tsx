// Champs typés promus de src/features/retail-promo/promoPanelUi.tsx — repris VERBATIM
// (aucun changement de logique), pour être partagés par tous les panneaux de propriétés.
import { useState } from 'react'
import type { ReactNode, Ref } from 'react'

export const inputCls = 'w-full rounded border border-white/10 bg-well px-2 py-1 text-sm text-white outline-none focus:border-[#6366f1] placeholder:text-white/25 [&>option]:bg-neutral-900'
const labelCls = 'flex flex-col gap-1 text-[11px] uppercase tracking-wide text-white/40'

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

/**
 * Curseur. Défaut = pourcentage 0..1 affiché ×100 % (rétro-compatible).
 * `min/max/step/unit` permettent des bornes libres (mm, px, °, ×, s…) pour les
 * panneaux qui ont des sliders non-% (Print, Animation3D, DataMerge).
 */
export function SliderField({ label, value, onChange, min = 0, max = 1, step = 0.01, unit = '%', inputRef }: {
  label: string; value: number; onChange: (v: number) => void; min?: number; max?: number; step?: number; unit?: string
  /** Réf optionnelle sur l'`<input type="range">` (ex. scroll/focus programmatique). */
  inputRef?: Ref<HTMLInputElement>
}) {
  const isPct = unit === '%' && max <= 1
  // Champ numérique jumeau du curseur : édite la valeur AFFICHÉE (en % pour les
  // sliders 0..1). `draft` laisse taper librement (champ vide, « 1. ») — la
  // valeur n'est committée que si elle parse, et le blur resynchronise.
  const numValue = isPct ? Math.round(value * 100) : Math.round(value * 100) / 100
  const [draft, setDraft] = useState<string | null>(null)
  const commit = (raw: string) => {
    if (raw.trim() === '') return
    const n = Number(raw.replace(',', '.'))
    if (!Number.isFinite(n)) return
    const v = isPct ? n / 100 : n
    onChange(Math.min(max, Math.max(min, v)))
  }
  return (
    <label className={labelCls}>
      <span className="flex items-center justify-between gap-2">
        <span className="truncate">{label}</span>
        <span className="flex items-center gap-1 shrink-0 normal-case tracking-normal">
          {/* Stepper NATIF intégré au champ (même idiome que NumField) — flèches ▲▼
              toujours visibles, pas du slider, clamp aux bornes via commit(). */}
          <input type="number" value={draft ?? String(numValue)}
            min={isPct ? Math.round(min * 100) : min} max={isPct ? Math.round(max * 100) : max} step={isPct ? 1 : step}
            onChange={(e) => { setDraft(e.target.value); commit(e.target.value) }}
            onBlur={() => setDraft(null)}
            className="w-[72px] rounded border border-white/10 bg-well pl-1.5 py-0.5 text-[11px] text-white text-right tabular-nums outline-none focus:border-[#6366f1] [color-scheme:dark] [&::-webkit-inner-spin-button]:opacity-100" />
          <span className="text-white/30">{unit}</span>
        </span>
      </span>
      <input ref={inputRef} type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} className="w-full accent-[#6366f1]" />
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
