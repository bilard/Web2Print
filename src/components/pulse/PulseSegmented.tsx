interface PulseSegmentedProps<T extends string> {
  options: readonly { value: T; label: string }[]
  value: T
  onChange: (v: T) => void
  ariaLabel?: string
}

/** Contrôle segmenté façon iOS (le curseur glisse sous l'option active). */
export function PulseSegmented<T extends string>({ options, value, onChange, ariaLabel }: PulseSegmentedProps<T>) {
  const idx = Math.max(0, options.findIndex((o) => o.value === value))
  const w = 100 / options.length
  return (
    <div className="pulse-seg relative flex" role="tablist" aria-label={ariaLabel}>
      <div
        className="pulse-seg-thumb absolute top-[3px] bottom-[3px] pointer-events-none"
        style={{ width: `calc(${w}% - 3px)`, left: `calc(${idx * w}% + 1.5px)`, transition: 'left 0.28s cubic-bezier(0.22,1,0.36,1)' }}
      />
      {options.map((o) => (
        <button
          key={o.value}
          role="tab"
          aria-selected={o.value === value}
          onClick={() => onChange(o.value)}
          className="pulse-tap relative z-10 flex-1 py-[7px] text-[13px] font-semibold"
          style={{ color: o.value === value ? 'var(--pulse-text)' : 'var(--pulse-text-2)' }}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}
