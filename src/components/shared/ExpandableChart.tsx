// src/components/shared/ExpandableChart.tsx
// Enveloppe un graphe (rendu via render-prop) avec un bouton « agrandir » qui l'ouvre
// dans une modale plein écran — les cartes en grille sont trop petites pour lire les
// valeurs. Le même graphe est re-rendu avec une plus grande hauteur en modale.
import { useState, useEffect, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Maximize2, X } from 'lucide-react'

export function ExpandableChart({ render, largeHeight = 560 }: {
  render: (height?: number) => ReactNode
  largeHeight?: number
}) {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  return (
    <div className="relative group">
      {render()}
      <button type="button" onClick={() => setOpen(true)} title="Agrandir"
        className="absolute top-3 right-3 z-10 p-1.5 rounded bg-well/80 border border-white/10 text-white/40 opacity-0 group-hover:opacity-100 hover:text-white hover:border-white/25 transition">
        <Maximize2 className="w-3.5 h-3.5" />
      </button>

      {open && createPortal(
        <div className="fixed inset-0 z-[100] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 sm:p-8"
          onClick={() => setOpen(false)}>
          <div className="w-full max-w-5xl relative" onClick={(e) => e.stopPropagation()}>
            {render(largeHeight)}
            <button type="button" onClick={() => setOpen(false)} title="Fermer (Échap)"
              className="absolute top-3 right-3 z-10 p-1.5 rounded bg-well border border-white/10 text-white/60 hover:text-white">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>,
        document.body,
      )}
    </div>
  )
}
