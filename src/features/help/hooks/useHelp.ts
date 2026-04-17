import { useHelpStore } from '../help.store'

/**
 * Façade publique pour ouvrir/fermer le drawer ou naviguer vers une section.
 * Évite aux consommateurs d'importer directement le store.
 */
export function useHelp() {
  const open = useHelpStore((s) => s.open)
  const currentSectionId = useHelpStore((s) => s.currentSectionId)
  const openDrawer = useHelpStore((s) => s.openDrawer)
  const closeDrawer = useHelpStore((s) => s.closeDrawer)
  const toggleDrawer = useHelpStore((s) => s.toggleDrawer)
  const goToSection = useHelpStore((s) => s.goToSection)

  return {
    open,
    currentSectionId,
    openDrawer,
    closeDrawer,
    toggleDrawer,
    goToSection,
  }
}
