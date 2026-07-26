import { useState, type ReactNode } from 'react'
import { ChevronRight } from 'lucide-react'
import { moduleMeta } from '@/features/access/moduleMeta'

/** Carte repliable d'un module dans les écrans RBAC : pastille d'icône colorée, titre,
 *  compteur « sélectionnées / total » et liseré d'accent. En-tête cliquable (chevron) ;
 *  ouverte par défaut si le module a des sélections, repliée sinon. Le contenu (puces de
 *  permissions) est passé en children. */
export function ModuleCard({
  module,
  selected,
  total,
  children,
  open: openProp,
  onToggleOpen,
}: {
  module: string
  selected: number
  total: number
  children: ReactNode
  /** Si fourni → carte contrôlée (pour Tout déplier/replier). Sinon auto-gérée. */
  open?: boolean
  onToggleOpen?: () => void
}) {
  const m = moduleMeta(module)
  const Icon = m.icon
  const active = selected > 0
  const [openInternal, setOpenInternal] = useState(active)
  const open = openProp !== undefined ? openProp : openInternal
  const toggleOpen = onToggleOpen ?? (() => setOpenInternal((o) => !o))
  return (
    <div className={`relative overflow-hidden rounded-xl border transition-colors ${active ? 'bg-white/[0.03] border-white/10' : 'bg-white/[0.015] border-white/[0.05]'}`}>
      <span className={`absolute left-0 top-0 bottom-0 w-[3px] ${m.bar} ${active ? 'opacity-80' : 'opacity-25'}`} />
      <button
        type="button"
        onClick={toggleOpen}
        aria-expanded={open}
        className="w-full flex items-center gap-2 pl-2.5 pr-3 pt-2.5 pb-2 text-left hover:bg-white/[0.02] transition-colors"
      >
        <ChevronRight className={`w-3.5 h-3.5 shrink-0 text-white/35 transition-transform ${open ? 'rotate-90' : ''}`} />
        <span className={`w-6 h-6 rounded-lg flex items-center justify-center shrink-0 ${m.dot}`}>
          <Icon className="w-3.5 h-3.5" />
        </span>
        <span className={`text-[11px] font-semibold uppercase tracking-wider ${active ? m.text : 'text-white/40'}`}>
          {module}
        </span>
        <span className={`ml-auto text-[10px] tabular-nums px-1.5 py-0.5 rounded-md ${active ? 'bg-white/[0.06] text-white/55' : 'text-white/25'}`}>
          {selected}/{total}
        </span>
      </button>
      {open && <div className="pl-3.5 pr-3 pb-3">{children}</div>}
    </div>
  )
}
