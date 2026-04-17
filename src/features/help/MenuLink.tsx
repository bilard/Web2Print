import { useLocation, useNavigate } from 'react-router-dom'
import type { LucideIcon } from 'lucide-react'
import { ArrowUpRight } from 'lucide-react'
import type { MenuTarget } from './content/types'
import { useHelpStore } from './help.store'

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

  const handleClick = () => {
    if (target.highlightId) {
      setHighlightTarget(target.highlightId)
    }
    if (!isCurrentRoute) {
      navigate(resolveNavigatablePath(target.path))
      closeDrawer()
    }
  }

  const TrailingIcon = Icon ?? ArrowUpRight

  return (
    <button
      type="button"
      onClick={handleClick}
      className="inline-flex items-center gap-1.5 my-1 mr-1 px-2 py-1 rounded-md
        bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-400 hover:text-indigo-300
        border border-indigo-500/20 text-xs font-medium transition-colors"
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

/** Pour /editor/:id on ne peut pas naviguer tel quel — on retourne / si placeholder. */
function resolveNavigatablePath(path: string): string {
  if (path.includes(':')) {
    return path.split(':')[0].replace(/\/$/, '') || '/'
  }
  return path
}
