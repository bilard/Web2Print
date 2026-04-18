import { useState, useRef, useEffect } from 'react'

interface Props {
  initial: string
  onCommit: (value: string) => void
  onCancel: () => void
}

export function LayerNameInput({ initial, onCommit, onCancel }: Props) {
  const [value, setValue] = useState(initial)
  const ref = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    ref.current?.focus()
    ref.current?.select()
  }, [])

  return (
    <input
      ref={ref}
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={() => onCommit(value.trim())}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault()
          onCommit(value.trim())
        } else if (e.key === 'Escape') {
          e.preventDefault()
          onCancel()
        }
      }}
      onClick={(e) => e.stopPropagation()}
      className="text-xs flex-1 bg-black/40 border border-indigo-500/60 rounded px-1 py-0 text-white/90 outline-none focus:border-indigo-500"
    />
  )
}
