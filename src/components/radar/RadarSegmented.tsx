interface RadarSegmentedProps<T extends string> {
  options: readonly { value: T; label: string }[]
  value: T
  onChange: (v: T) => void
  ariaLabel?: string
}

/** Contrôle segmenté façon iOS (le curseur glisse sous l'onglet actif). */
export function RadarSegmented<T extends string>({ options, value, onChange, ariaLabel }: RadarSegmentedProps<T>) {
  const idx = Math.max(0, options.findIndex((o) => o.value === value))
  const w = 100 / options.length
  return (
    <div className="radar-seg relative flex" role="tablist" aria-label={ariaLabel}>
      <div
        className="radar-seg-thumb absolute top-[3px] bottom-[3px] pointer-events-none"
        style={{ width: `calc(${w}% - 3px)`, left: `calc(${idx * w}% + 1.5px)`, transition: 'left 0.28s cubic-bezier(0.22,1,0.36,1)' }}
      />
      {options.map((o) => (
        <button
          key={o.value}
          role="tab"
          aria-selected={o.value === value}
          onClick={() => onChange(o.value)}
          className="radar-tap relative z-10 flex-1 py-[7px] text-[13px] font-semibold"
          style={{ color: o.value === value ? 'var(--radar-text)' : 'var(--radar-text-2)' }}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}
