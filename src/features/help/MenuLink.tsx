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
  const isContextual = target.path.includes(':')
  const needsContext = isContextual && !isCurrentRoute

  const handleClick = () => {
    if (target.highlightId) {
      setHighlightTarget(target.highlightId)
    }
    const navigatable = resolveNavigatablePath(target.path)
    if (navigatable !== null) {
      // Ouvre réellement l'écran : la section du dashboard est encodée dans le highlightId
      // (`dashboard.sidebar.import` → section `import`) et passée en state de navigation,
      // que le DashboardPage lit pour activer la section. On navigue MÊME si on est déjà
      // sur la route — sinon le lien ne ferait que surligner l'onglet sans ouvrir l'écran.
      const section = sectionFromHighlightId(target.highlightId)
      navigate(navigatable, section ? { state: { section } } : undefined)
      closeDrawer()
    } else if (isCurrentRoute && target.highlightId) {
      // Route contextuelle (/editor/:id) et déjà dessus : le ring s'affiche, on ferme le drawer.
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

/** La section du dashboard est encodée dans le highlightId : `dashboard.sidebar.<section>`.
 *  Renvoie `<section>` (ex: 'import', 'data', 'workflows') ou null si le highlightId ne
 *  cible pas un onglet de section (ex: 'dashboard.new-project' = un bouton, pas une section). */
export function sectionFromHighlightId(id?: string): string | null {
  if (!id) return null
  const m = /^dashboard\.sidebar\.(.+)$/.exec(id)
  return m ? m[1] : null
}
