import { useMemo } from 'react'
import { useAccessStore } from '@/stores/access.store'
import { helpSections } from './content/index'
import type { HelpSection } from './content/types'
import { isHelpSectionVisible } from './helpAccess'

/** Sections d'aide visibles pour le user courant (owner → toutes). */
export function useVisibleHelpSections(): HelpSection[] {
  const isOwner = useAccessStore((s) => s.isOwner)
  const permissions = useAccessStore((s) => s.permissions)
  return useMemo(
    () => helpSections.filter((s) => isHelpSectionVisible(s.id, { isOwner, permissions })),
    [isOwner, permissions],
  )
}

/** Prédicat `(sectionId) => visible` — pour filtrer les résultats de recherche par id. */
export function useIsHelpSectionVisible(): (id: string) => boolean {
  const isOwner = useAccessStore((s) => s.isOwner)
  const permissions = useAccessStore((s) => s.permissions)
  return useMemo(
    () => (id: string) => isHelpSectionVisible(id, { isOwner, permissions }),
    [isOwner, permissions],
  )
}
