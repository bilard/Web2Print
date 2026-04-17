import { useMemo, useState } from 'react'
import { Search } from 'lucide-react'
import { helpSections } from './content/index'
import { HELP_CATEGORIES, type HelpCategory, type HelpSection } from './content/types'
import { useHelpStore } from './help.store'

export function HelpTableOfContents() {
  const currentSectionId = useHelpStore((s) => s.currentSectionId)
  const goToSection = useHelpStore((s) => s.goToSection)
  const [query, setQuery] = useState('')

  const grouped = useMemo(() => groupByCategory(filter(helpSections, query)), [query])

  return (
    <nav className="flex flex-col gap-3">
      <div className="relative">
        <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-white/30" />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Rechercher..."
          className="w-full bg-white/5 border border-white/10 rounded-md pl-7 pr-2 py-1.5 text-xs text-white placeholder:text-white/30 focus:outline-none focus:border-indigo-500"
        />
      </div>
      {HELP_CATEGORIES.map((cat) => {
        const sections = grouped.get(cat)
        if (!sections || sections.length === 0) return null
        return (
          <div key={cat} className="flex flex-col gap-0.5">
            <div className="text-[10px] uppercase tracking-wider text-white/40 font-medium px-2 mb-1">
              {cat}
            </div>
            {sections.map((s) => {
              const active = s.id === currentSectionId
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => goToSection(s.id)}
                  className={`text-left text-xs px-2 py-1.5 rounded transition-colors ${
                    active
                      ? 'bg-indigo-500/15 text-indigo-300'
                      : 'text-white/60 hover:text-white hover:bg-white/5'
                  }`}
                >
                  {s.title}
                </button>
              )
            })}
          </div>
        )
      })}
    </nav>
  )
}

function filter(sections: HelpSection[], query: string): HelpSection[] {
  const q = query.trim().toLowerCase()
  if (!q) return sections
  return sections.filter(
    (s) => s.title.toLowerCase().includes(q) || s.intro.toLowerCase().includes(q),
  )
}

function groupByCategory(sections: HelpSection[]): Map<HelpCategory, HelpSection[]> {
  const map = new Map<HelpCategory, HelpSection[]>()
  for (const s of sections) {
    const arr = map.get(s.category) ?? []
    arr.push(s)
    map.set(s.category, arr)
  }
  return map
}
