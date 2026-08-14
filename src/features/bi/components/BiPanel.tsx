// Coquille COMMUNE aux trois volets de droite : un en-tête discret, un corps qui défile.
//
// ⚠ `min-h-0` sur le corps : sans lui, un enfant flex refuse de rétrécir et c'est l'ÉCRAN
// entier qui s'allonge — le défilement doit rester DANS le volet, comme dans les tuiles.
import type { ReactNode } from 'react'

export function BiPanel({ label, width, visibility, children }: {
  /** Libellé DÉJÀ traduit. */
  label: string
  /** Largeur en pixels, reprise de la maquette : les trois volets ne sont pas égaux. */
  width: number
  /** Classes de visibilité LITTÉRALES, écrites par l'appelant — Tailwind ne compile que ce
   *  qu'il lit dans les sources, une classe composée ici n'existerait pas à l'exécution. */
  visibility: string
  children: ReactNode
}) {
  return (
    <aside
      aria-label={label} style={{ width }}
      className={`${visibility} flex-col min-h-0 shrink-0 bg-surface border-l border-white/[0.06]`}
    >
      <div className="shrink-0 px-3 pt-2.5 pb-2 border-b border-white/[0.06]">
        <BiEyebrow>{label}</BiEyebrow>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto px-3 py-2.5 flex flex-col gap-3">
        {children}
      </div>
    </aside>
  )
}

/** Le sur-titre de la maquette : capitales espacées, très discret. Partagé par les volets. */
export function BiEyebrow({ children }: { children: ReactNode }) {
  return (
    <span className="block text-[10px] font-semibold uppercase tracking-[0.09em] text-white/35">
      {children}
    </span>
  )
}
