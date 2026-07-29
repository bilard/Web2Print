import type { LucideIcon } from 'lucide-react'
import { useVisibleModules } from '@/features/navigation/modules'
import { MenuLink } from '../MenuLink'
import { useTranslation } from '@/lib/i18n'

/**
 * Liste les modules de l'app sous forme de liens cliquables, générée à la volée depuis
 * `MODULE_ITEMS` et filtrée par les droits du user (`useVisibleModules`) — exactement la
 * même source et le même filtrage que la sidebar du Dashboard. Ajouter un module le fait
 * apparaître ici automatiquement ; un module masqué pour ce rôle n'apparaît pas.
 */
export function ModuleLinksBlock() {
  const modules = useVisibleModules()
  const { t } = useTranslation()
  return (
    <div className="flex flex-wrap items-start">
      {modules.map((m) => (
        <MenuLink
          key={m.id}
          target={{ path: '/dashboard', highlightId: `dashboard.sidebar.${m.id}` }}
          label={t(m.labelKey)}
          // `MODULE_ITEMS.icon` est typé `ComponentType<{ className?: string }>` ; ce sont
          // des icônes Lucide → compatibles avec le rendu de MenuLink.
          icon={m.icon as LucideIcon}
        />
      ))}
    </div>
  )
}
