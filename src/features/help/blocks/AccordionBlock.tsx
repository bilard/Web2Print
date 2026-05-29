import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronDown, ArrowUpRight } from 'lucide-react'
import type { AccordionItem } from '../content/types'
import { TextBlock } from './TextBlock'
import { useHelpStore } from '../help.store'
import { openTarget } from '../MenuLink'

interface AccordionBlockProps {
  items: AccordionItem[]
}

/**
 * Liste de volets. Deux modes par volet :
 *  - sans `target` : repliable — clic = déplie/replie la description (lecture).
 *  - avec `target` : raccourci — clic sur le titre OUVRE l'écran ; la description
 *    reste affichée sous le titre.
 * Pendant une recherche, les volets repliables qui matchent s'ouvrent automatiquement.
 */
export function AccordionBlock({ items }: AccordionBlockProps) {
  const navigate = useNavigate()
  const query = useHelpStore((s) => s.searchQuery).trim().toLowerCase()
  const setHighlightTarget = useHelpStore((s) => s.setHighlightTarget)
  const closeDrawer = useHelpStore((s) => s.closeDrawer)
  const [open, setOpen] = useState<Set<number>>(() => new Set())

  const toggle = (i: number) =>
    setOpen((prev) => {
      const next = new Set(prev)
      if (next.has(i)) next.delete(i)
      else next.add(i)
      return next
    })

  const handleOpenTarget = (item: AccordionItem) => {
    if (!item.target) return
    const navigated = openTarget(navigate, item.target, setHighlightTarget)
    if (navigated) closeDrawer()
  }

  return (
    <div className="flex flex-col gap-1 my-1">
      {items.map((item, i) => {
        // ── Volet-raccourci : clic = ouvre l'écran, description visible ──
        if (item.target) {
          return (
            <div key={i} className="rounded-md border border-white/10 bg-white/[0.03] overflow-hidden">
              <button
                type="button"
                onClick={() => handleOpenTarget(item)}
                title="Ouvrir cet écran"
                className="w-full flex items-center justify-between gap-2 px-3 py-2 text-left text-[13px] font-medium text-white/85 hover:bg-indigo-500/10 hover:text-indigo-300 transition-colors"
              >
                <span>{item.title}</span>
                <ArrowUpRight className="w-3.5 h-3.5 shrink-0 text-white/40" />
              </button>
              <div className="px-3 pb-1.5 border-t border-white/5">
                <TextBlock md={item.md} />
              </div>
            </div>
          )
        }

        // ── Volet repliable classique ──
        const matched =
          query.length >= 2 &&
          (item.title.toLowerCase().includes(query) || item.md.toLowerCase().includes(query))
        const isOpen = open.has(i) || matched
        return (
          <div key={i} className="rounded-md border border-white/10 bg-white/[0.03] overflow-hidden">
            <button
              type="button"
              onClick={() => toggle(i)}
              aria-expanded={isOpen}
              className="w-full flex items-center justify-between gap-2 px-3 py-2 text-left text-[13px] font-medium text-white/85 hover:bg-white/[0.05] transition-colors"
            >
              <span>{item.title}</span>
              <ChevronDown
                className={`w-3.5 h-3.5 shrink-0 text-white/40 transition-transform ${
                  isOpen ? 'rotate-180' : ''
                }`}
              />
            </button>
            {isOpen && (
              <div className="px-3 pb-1.5 border-t border-white/5">
                <TextBlock md={item.md} />
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
