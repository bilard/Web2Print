// Section de propriétés repliable — SOURCE DE VÉRITÉ unique de l'app (remplace les
// accordéons dupliqués de l'Éditeur, de Création Studio et du Catalogue).
// Union des deux : help/tourId (Éditeur) + badge/defaultOpen (Création).
import { useState, type ReactNode } from 'react'
import { ChevronRight } from 'lucide-react'
import { OptionHelp } from '@/components/shared/OptionHelp'

interface Props {
  title: string
  children: ReactNode
  defaultOpen?: boolean
  help?: string
  tourId?: string
  badge?: ReactNode
}

export function PropertySection({ title, children, defaultOpen = true, help, tourId, badge }: Props) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <section className="flex flex-col gap-2.5 border-b border-white/5 pb-3 last:border-b-0" data-tour={tourId ? `opt-${tourId}` : undefined}>
      <div className="flex items-center gap-1">
        <button onClick={() => setOpen((o) => !o)}
          className="flex items-center gap-1.5 text-[10px] font-semibold text-white/40 uppercase tracking-wider hover:text-white/60 transition-colors">
          <ChevronRight className={`w-3 h-3 transition-transform ${open ? 'rotate-90' : ''}`} /> {title}
        </button>
        {help && <OptionHelp text={help} />}
        {badge != null && <span className="ml-auto text-[#818cf8]">{badge}</span>}
      </div>
      {open && <div className="flex flex-col gap-2.5">{children}</div>}
    </section>
  )
}
