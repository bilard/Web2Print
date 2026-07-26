// Sélecteur d'émoji pour les modèles de workflow : bouton affichant l'émoji
// courant + popover de grille. Liste curée orientée automatisation / data /
// e-commerce. Saisie libre conservée en repli (champ texte du popover).
import { useEffect, useRef, useState } from 'react'

const EMOJIS = [
  '⭐', '🚀', '⚡', '🔧', '⚙️', '🤖', '🧠', '✨',
  '🛒', '🏷️', '💰', '📈', '📉', '📊', '⚖️', '🧮',
  '🔍', '🔎', '🌐', '🔗', '📡', '📥', '📤', '📦',
  '🗂️', '📁', '📋', '📝', '🗓️', '⏰', '🔔', '🚨',
  '✅', '🛂', '🔁', '🔂', '🧩', '🎯', '💡', '🏭',
  '📷', '🖼️', '🎨', '✂️', '📄', '📨', '💬', '🤝',
]

interface Props {
  value: string
  onChange: (emoji: string) => void
}

export function EmojiPicker({ value, onChange }: Props) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="mt-1 w-full bg-well border border-neutral-700 rounded px-2 py-2 text-center text-lg outline-none hover:border-indigo-500 focus:border-indigo-500"
        aria-label="Choisir un émoji"
        title="Choisir un émoji"
      >
        {value || '⭐'}
      </button>
      {open && (
        <div className="absolute z-10 mt-1 left-0 w-64 bg-surface border border-neutral-700 rounded-lg p-2 shadow-xl">
          <div className="grid grid-cols-8 gap-0.5 max-h-48 overflow-y-auto">
            {EMOJIS.map((e) => (
              <button
                key={e}
                type="button"
                onClick={() => { onChange(e); setOpen(false) }}
                className={`text-lg rounded hover:bg-white/[0.08] aspect-square flex items-center justify-center ${e === value ? 'bg-indigo-500/30' : ''}`}
              >
                {e}
              </button>
            ))}
          </div>
          <input
            value={value}
            onChange={(ev) => onChange(ev.target.value)}
            maxLength={4}
            placeholder="ou collez un émoji…"
            className="mt-2 w-full bg-well border border-neutral-700 rounded px-2 py-1 text-center text-sm outline-none focus:border-indigo-500"
          />
        </div>
      )}
    </div>
  )
}
