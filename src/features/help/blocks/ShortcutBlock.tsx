interface ShortcutBlockProps {
  keys: string[]
  label: string
}

export function ShortcutBlock({ keys, label }: ShortcutBlockProps) {
  return (
    <div className="my-2 flex items-center justify-between gap-3 py-1.5 px-2.5 rounded-md bg-white/[0.02] border border-white/5">
      <span className="text-xs text-white/70">{label}</span>
      <div className="flex items-center gap-1">
        {keys.map((k, i) => (
          <kbd
            key={i}
            className="min-w-[24px] h-6 px-1.5 flex items-center justify-center rounded border border-white/15 bg-white/5 text-[11px] text-white/70 font-mono"
          >
            {k}
          </kbd>
        ))}
      </div>
    </div>
  )
}
