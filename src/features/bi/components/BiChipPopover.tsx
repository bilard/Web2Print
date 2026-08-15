// Le petit menu porté par une puce : agrégation, opérateur de filtre.
//
// ⚠⚠ Un menu, jamais un `<select>` natif (spec lot 2, D5) — il n'affiche ni groupe lisible
// ni libellé long, et le module s'en passe partout ailleurs (`BiPicker`).
//
// ⚠ Le panneau est ALIGNÉ À DROITE : les volets défilent verticalement, donc rognent aussi
// l'horizontale. Ouvert vers la gauche, il reste dans la largeur du volet.
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { ChevronDown } from 'lucide-react'

export function BiChipPopover({ label, title, disabled, children }: {
  /** Ce que la pastille affiche — l'agrégation en cours, l'opérateur en cours. */
  label: string
  /** Infobulle et libellé d'accessibilité, DÉJÀ traduits. */
  title: string
  disabled?: boolean
  /** Le contenu du menu, qui reçoit de quoi le refermer après un choix. */
  children: (close: () => void) => ReactNode
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    window.addEventListener('mousedown', onDown)
    return () => window.removeEventListener('mousedown', onDown)
  }, [open])

  return (
    <div className="relative shrink-0" ref={ref}>
      <button
        type="button" disabled={disabled} title={title} aria-label={title}
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-0.5 rounded px-1 py-0.5 text-[10px] text-white/50 bg-white/[0.06] enabled:hover:text-white enabled:hover:bg-white/10 disabled:opacity-50 transition-colors"
      >
        <span className="truncate max-w-[70px]">{label}</span>
        {!disabled && <ChevronDown className="w-2.5 h-2.5 shrink-0" />}
      </button>

      {open && (
        <div className="absolute right-0 z-[60] mt-1 w-max min-w-[130px] max-w-[200px] rounded-lg border border-white/10 bg-surface shadow-xl py-1">
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  )
}

/** Une entrée de menu. Sortie ici pour que les deux menus se ressemblent exactement. */
export function BiChipOption({ label, active, onPick }: {
  label: string; active: boolean; onPick: () => void
}) {
  return (
    <button
      type="button" onClick={onPick}
      className={`w-full text-left px-2.5 py-1.5 text-[11px] text-white/80 hover:bg-white/5 transition-colors ${
        active ? 'bg-white/[0.06]' : ''
      }`}
    >
      {label}
    </button>
  )
}
