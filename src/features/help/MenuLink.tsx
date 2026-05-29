import { useLocation, useNavigate, type NavigateFunction } from 'react-router-dom'
import type { LucideIcon } from 'lucide-react'
import { ArrowUpRight } from 'lucide-react'
import type { MenuTarget } from './content/types'
import { useHelpStore } from './help.store'
import { useDamStore } from '@/stores/dam.store'
import type { DamTab } from '@/features/dam/types'

interface MenuLinkProps {
  target: MenuTarget
  label: string
  icon?: LucideIcon
}

export function MenuLink({ target, label, icon: Icon }: MenuLinkProps) {
  const navigate = useNavigate()
  const location = useLocation()
  const setHighlightTarget = useHelpStore((s) => s.setHighlightTarget)
  const closeDrawer = useHelpStore((s) => s.closeDrawer)

  const isCurrentRoute = matchesRoute(location.pathname, target.path)
  const isContextual = target.path.includes(':')
  const needsContext = isContextual && !isCurrentRoute

  const handleClick = () => {
    const navigated = openTarget(navigate, target, setHighlightTarget)
    if (navigated || (isCurrentRoute && target.highlightId)) {
      closeDrawer()
    }
  }

  const TrailingIcon = Icon ?? ArrowUpRight
  const title = needsContext
    ? 'Ouvre un projet d\'abord pour voir cet élément en contexte'
    : isCurrentRoute && target.highlightId
    ? 'Met en évidence cet élément à l\'écran'
    : undefined

  return (
    <button
      type="button"
      onClick={handleClick}
      title={title}
      className={`inline-flex items-center gap-1.5 my-1 mr-1 px-2 py-1 rounded-md
        bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-400 hover:text-indigo-300
        border border-indigo-500/20 text-xs font-medium transition-colors
        ${needsContext ? 'opacity-60' : ''}`}
    >
      <TrailingIcon className="w-3 h-3" />
      {label}
    </button>
  )
}

/** Les paths peuvent contenir :id — on compare le premier segment statique. */
function matchesRoute(current: string, target: string): boolean {
  const currentSegments = current.split('/').filter(Boolean)
  const targetSegments = target.split('/').filter(Boolean)
  if (currentSegments.length === 0 || targetSegments.length === 0) return false
  return currentSegments[0] === targetSegments[0]
}

/** Paths avec :id sont contextuels (ex /editor/:id) — on ne peut pas naviguer génériquement. */
function resolveNavigatablePath(path: string): string | null {
  if (path.includes(':')) return null
  return path
}

/**
 * Ouvre réellement l'écran ciblé : surligne l'élément, navigue vers la route (en
 * encodant la section du dashboard dans le state — `dashboard.sidebar.import` →
 * section `import`), et active le sous-onglet DAM si `damTab` est fourni. On navigue
 * même si on est déjà sur la route, pour changer de section/onglet.
 * Renvoie true si une navigation a eu lieu (route non contextuelle).
 */
export function openTarget(
  navigate: NavigateFunction,
  target: MenuTarget,
  setHighlightTarget: (id: string | null) => void,
): boolean {
  if (target.highlightId) setHighlightTarget(target.highlightId)
  const navigatable = resolveNavigatablePath(target.path)
  if (navigatable === null) return false
  const section = sectionFromHighlightId(target.highlightId)
  navigate(navigatable, section ? { state: { section } } : undefined)
  if (target.damTab) useDamStore.getState().setActiveTab(target.damTab as DamTab)
  return true
}

/** La section du dashboard est encodée dans le highlightId : `dashboard.sidebar.<section>`.
 *  Renvoie `<section>` (ex: 'import', 'data', 'workflows') ou null si le highlightId ne
 *  cible pas un onglet de section (ex: 'dashboard.new-project' = un bouton, pas une section). */
export function sectionFromHighlightId(id?: string): string | null {
  if (!id) return null
  const m = /^dashboard\.sidebar\.(.+)$/.exec(id)
  return m ? m[1] : null
}
