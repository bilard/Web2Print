import { useMemo } from 'react'
import { Rocket, Pencil, FileUp, Database, Download, Workflow, type LucideIcon } from 'lucide-react'
import { helpSections } from './content/index'
import { HELP_CATEGORIES, type HelpCategory, type HelpSection } from './content/types'
import { useHelpStore } from './help.store'

interface CategoryStyle {
  Icon: LucideIcon
  label: string
  accent: string
  bg: string
  border: string
  activeBg: string
  activeText: string
  bullet: string
}

const CATEGORY_STYLES: Record<HelpCategory, CategoryStyle> = {
  Démarrage: {
    Icon: Rocket,
    label: 'text-violet-300',
    accent: 'text-violet-400',
    bg: 'bg-violet-500/[0.06]',
    border: 'border-violet-500/20',
    activeBg: 'bg-violet-500/15',
    activeText: 'text-violet-200',
    bullet: 'bg-violet-400',
  },
  Édition: {
    Icon: Pencil,
    label: 'text-indigo-300',
    accent: 'text-indigo-400',
    bg: 'bg-indigo-500/[0.06]',
    border: 'border-indigo-500/20',
    activeBg: 'bg-indigo-500/15',
    activeText: 'text-indigo-200',
    bullet: 'bg-indigo-400',
  },
  Import: {
    Icon: FileUp,
    label: 'text-amber-300',
    accent: 'text-amber-400',
    bg: 'bg-amber-500/[0.06]',
    border: 'border-amber-500/20',
    activeBg: 'bg-amber-500/15',
    activeText: 'text-amber-200',
    bullet: 'bg-amber-400',
  },
  Données: {
    Icon: Database,
    label: 'text-emerald-300',
    accent: 'text-emerald-400',
    bg: 'bg-emerald-500/[0.06]',
    border: 'border-emerald-500/20',
    activeBg: 'bg-emerald-500/15',
    activeText: 'text-emerald-200',
    bullet: 'bg-emerald-400',
  },
  Export: {
    Icon: Download,
    label: 'text-sky-300',
    accent: 'text-sky-400',
    bg: 'bg-sky-500/[0.06]',
    border: 'border-sky-500/20',
    activeBg: 'bg-sky-500/15',
    activeText: 'text-sky-200',
    bullet: 'bg-sky-400',
  },
  Automatisation: {
    Icon: Workflow,
    label: 'text-cyan-300',
    accent: 'text-cyan-400',
    bg: 'bg-cyan-500/[0.06]',
    border: 'border-cyan-500/20',
    activeBg: 'bg-cyan-500/15',
    activeText: 'text-cyan-200',
    bullet: 'bg-cyan-400',
  },
}

export function HelpTableOfContents() {
  const currentSectionId = useHelpStore((s) => s.currentSectionId)
  const goToSection = useHelpStore((s) => s.goToSection)

  const grouped = useMemo(() => groupByCategory(helpSections), [])

  return (
    <nav className="flex flex-col gap-2">
      {HELP_CATEGORIES.map((cat) => {
        const sections = grouped.get(cat)
        if (!sections || sections.length === 0) return null
        const style = CATEGORY_STYLES[cat]
        return (
          <div
            key={cat}
            className={`flex flex-col rounded-md border ${style.border} ${style.bg} overflow-hidden`}
          >
            <div
              className={`flex items-center gap-1.5 px-2 py-1 text-[10px] uppercase tracking-wider font-semibold ${style.label}`}
            >
              <style.Icon className={`w-3 h-3 ${style.accent}`} />
              {cat}
            </div>
            <div className="flex flex-col gap-0.5 px-1 pb-1">
              {sections.map((s) => {
                const active = s.id === currentSectionId
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => goToSection(s.id)}
                    className={`flex items-center gap-1.5 text-left text-xs px-2 py-1.5 rounded transition-colors ${
                      active
                        ? `${style.activeBg} ${style.activeText} font-medium`
                        : 'text-white/60 hover:text-white hover:bg-white/5'
                    }`}
                  >
                    <span
                      className={`w-1 h-1 rounded-full shrink-0 ${
                        active ? style.bullet : 'bg-white/20'
                      }`}
                    />
                    {s.title}
                  </button>
                )
              })}
            </div>
          </div>
        )
      })}
    </nav>
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
