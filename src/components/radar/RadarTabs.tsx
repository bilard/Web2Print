/** Menu d'onglets défilable horizontalement (pilules) — scale au-delà de 3-4 vues,
 *  contrairement au segmenté à curseur. Défilement masqué (radar-noscroll). */
export function RadarTabs<T extends string>({ options, value, onChange, ariaLabel }: {
  options: readonly { value: T; label: string }[]
  value: T
  onChange: (v: T) => void
  ariaLabel?: string
}) {
  return (
    <div className="radar-noscroll -mx-1 flex gap-1.5 overflow-x-auto px-1" role="tablist" aria-label={ariaLabel}>
      {options.map((o) => {
        const active = o.value === value
        return (
          <button
            key={o.value}
            role="tab"
            aria-selected={active}
            onClick={() => onChange(o.value)}
            className="radar-tap shrink-0 rounded-full px-3.5 py-1.5 text-[13px] font-semibold"
            style={{
              background: active ? 'var(--radar-accent)' : 'var(--radar-surface-2)',
              color: active ? '#fff' : 'var(--radar-text-2)',
            }}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}
