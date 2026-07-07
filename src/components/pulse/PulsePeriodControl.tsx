import { PULSE_PRESETS } from '@/features/analytics/useLivePulse'

export interface PeriodValue {
  /** Clé de preset (`24h`…`12m`) ou `custom`. */
  key: string
  /** Bornes de la plage perso au format `YYYY-MM-DD` (utilisées si key === 'custom'). */
  from: string
  to: string
}

const CHIPS = [...PULSE_PRESETS.map((p) => ({ key: p.key, label: p.label })), { key: 'custom', label: 'Perso' }]

function Chip({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      role="tab"
      aria-selected={active}
      className="pulse-tap rounded-full px-3.5 py-1.5 text-[13px] font-semibold"
      style={{
        background: active ? 'color-mix(in srgb, var(--pulse-accent) 26%, var(--pulse-surface))' : 'var(--pulse-surface-2)',
        color: active ? 'var(--pulse-text)' : 'var(--pulse-text-2)',
        boxShadow: active ? '0 1px 3px rgba(0,0,0,0.4)' : 'none',
      }}
    >
      {label}
    </button>
  )
}

function DateField({ label, value, max, onChange }: { label: string; value: string; max?: string; onChange: (v: string) => void }) {
  return (
    <label className="flex flex-1 items-center gap-2 rounded-xl px-3 py-2" style={{ background: 'var(--pulse-surface-2)' }}>
      <span className="text-[12px]" style={{ color: 'var(--pulse-text-3)' }}>{label}</span>
      <input
        type="date"
        value={value}
        max={max}
        onChange={(e) => onChange(e.target.value)}
        className="min-w-0 flex-1 bg-transparent text-[13px] font-medium outline-none"
        style={{ color: 'var(--pulse-text)', colorScheme: 'dark' }}
      />
    </label>
  )
}

/** Sélection de période souple : presets rapides + plage personnalisée (Du/Au). */
export function PulsePeriodControl({ value, onChange }: { value: PeriodValue; onChange: (v: PeriodValue) => void }) {
  const today = new Date().toISOString().slice(0, 10)
  return (
    <div>
      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Période">
        {CHIPS.map((c) => (
          <Chip key={c.key} active={value.key === c.key} label={c.label} onClick={() => onChange({ ...value, key: c.key })} />
        ))}
      </div>
      {value.key === 'custom' && (
        <div className="mt-2 flex gap-2">
          <DateField label="Du" value={value.from} max={value.to || today} onChange={(from) => onChange({ ...value, from })} />
          <DateField label="Au" value={value.to} max={today} onChange={(to) => onChange({ ...value, to })} />
        </div>
      )}
    </div>
  )
}
