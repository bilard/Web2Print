import { useState } from 'react'
import { ChevronDown } from 'lucide-react'
import type { AccordionItem } from '../content/types'
import { TextBlock } from './TextBlock'
import { useHelpStore } from '../help.store'

interface AccordionBlockProps {
  items: AccordionItem[]
}

/**
 * Liste de volets repliables. Un volet s'ouvre au clic. Pendant une recherche,
 * tout volet dont le titre ou le contenu matche la requête s'ouvre automatiquement
 * (sinon le résultat resterait caché et la surbrillance invisible).
 */
export function AccordionBlock({ items }: AccordionBlockProps) {
  const query = useHelpStore((s) => s.searchQuery).trim().toLowerCase()
  const [open, setOpen] = useState<Set<number>>(() => new Set())

  const toggle = (i: number) =>
    setOpen((prev) => {
      const next = new Set(prev)
      if (next.has(i)) next.delete(i)
      else next.add(i)
      return next
    })

  return (
    <div className="flex flex-col gap-1 my-1">
      {items.map((item, i) => {
        const matched =
          query.length >= 2 &&
          (item.title.toLowerCase().includes(query) || item.md.toLowerCase().includes(query))
        const isOpen = open.has(i) || matched
        return (
          <div
            key={i}
            className="rounded-md border border-white/10 bg-white/[0.03] overflow-hidden"
          >
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
