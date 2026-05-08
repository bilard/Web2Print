import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { X, HelpCircle } from 'lucide-react'
import { useHelpStore } from './help.store'
import { helpSectionsById, helpSections } from './content/index'
import { HelpTableOfContents } from './HelpTableOfContents'
import { HelpSectionView } from './HelpSectionView'
import { HelpSearch } from './HelpSearch'

export function HelpDrawer() {
  const open = useHelpStore((s) => s.open)
  const currentSectionId = useHelpStore((s) => s.currentSectionId)
  const closeDrawer = useHelpStore((s) => s.closeDrawer)
  const goToSection = useHelpStore((s) => s.goToSection)

  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeDrawer()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, closeDrawer])

  useEffect(() => {
    if (open && !currentSectionId && helpSections.length > 0) {
      goToSection(helpSections[0].id)
    }
  }, [open, currentSectionId, goToSection])

  const section = currentSectionId ? helpSectionsById.get(currentSectionId) : null

  return createPortal(
    <aside
      aria-label="Manuel d'utilisation"
      className={`fixed top-0 right-0 h-screen z-40 w-[480px] max-w-full
        bg-[#1a1a1a] border-l border-white/10 shadow-2xl
        flex flex-col
        transition-transform duration-200 ease-out
        ${open ? 'translate-x-0' : 'translate-x-full pointer-events-none'}`}
    >
      <header className="h-12 flex items-center gap-3 px-3 border-b border-white/10 shrink-0">
        <div className="flex items-center gap-2 shrink-0">
          <HelpCircle className="w-4 h-4 text-indigo-400" />
          <span className="text-sm font-medium text-white">Aide</span>
        </div>
        <HelpSearch />
        <button
          type="button"
          onClick={closeDrawer}
          className="shrink-0 p-1.5 rounded-md text-white/40 hover:text-white hover:bg-white/10 transition-colors"
          title="Fermer (Echap)"
        >
          <X className="w-4 h-4" />
        </button>
      </header>
      <div className="flex-1 min-h-0 grid grid-cols-[180px_1fr]">
        <div className="border-r border-white/10 overflow-y-auto p-3">
          <HelpTableOfContents />
        </div>
        <div className="overflow-y-auto p-4">
          {section ? (
            <HelpSectionView section={section} />
          ) : (
            <p className="text-sm text-white/50">
              Sélectionne une section dans le sommaire.
            </p>
          )}
        </div>
      </div>
    </aside>,
    document.body,
  )
}
