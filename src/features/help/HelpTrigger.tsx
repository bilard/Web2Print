import { useEffect } from 'react'
import { HelpCircle } from 'lucide-react'
import { useHelpStore } from './help.store'
import { HelpDrawer } from './HelpDrawer'
import { globalFabricCanvas } from '@/features/editor/CanvasContainer'

export function HelpTrigger() {
  const toggleDrawer = useHelpStore((s) => s.toggleDrawer)

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === '?' && !isEditable(e.target) && !isFabricTextEditing()) {
        e.preventDefault()
        toggleDrawer()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [toggleDrawer])

  return (
    <>
      <button
        type="button"
        onClick={toggleDrawer}
        title="Aide (⇧?)"
        aria-label="Ouvrir l'aide"
        className="fixed bottom-4 right-4 z-30
          w-10 h-10 rounded-full
          bg-[#1a1a1a] border border-white/10 hover:border-indigo-500/50
          text-white/60 hover:text-indigo-400
          flex items-center justify-center
          shadow-lg
          transition-colors"
      >
        <HelpCircle className="w-5 h-5" />
      </button>
      <HelpDrawer />
    </>
  )
}

function isEditable(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  const tag = target.tagName
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true
  return target.isContentEditable
}

function isFabricTextEditing(): boolean {
  const active = globalFabricCanvas?.getActiveObject() as { isEditing?: boolean } | undefined
  return active?.isEditing === true
}
