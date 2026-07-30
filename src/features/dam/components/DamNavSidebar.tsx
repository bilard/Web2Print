import { Image as ImageIcon, Home, ImagePlus, Star, FolderOpen, Clock, Briefcase, Sparkles, HardDrive, FileCode2 } from 'lucide-react'
import { useDamStore } from '../../../stores/dam.store'
import { useDamFavorites } from '../hooks/useDamFavorites'
import { useDamCollections } from '../hooks/useDamCollections'
import { useDamSaveImage } from '../hooks/useDamSaveImage'
import { useProjects } from '../../projects/useProjects'
import { useUserAnimations } from '../../video/useUserAnimations'
import { useAccessStore } from '../../../stores/access.store'
import type { DamTab } from '../types'
import { OptionHelp } from '../../../components/shared/OptionHelp'
import { useTranslation, type TranslationKey } from '@/lib/i18n'

interface NavItem {
  id: DamTab
  labelKey: TranslationKey
  icon: typeof Home
  /** Permission requise pour afficher l'entrée (absent = toujours visible). */
  perm?: string
  /** Clé de l'aide contextuelle affichée au survol du « ? ». */
  help?: TranslationKey
}

// Les libellés réutilisent les clés du menu de navigation (`nav.images.*`) :
// une seule traduction pour un même intitulé dans la sidebar et dans le DAM.
const NAV_ITEMS: NavItem[] = [
  { id: 'stock', labelKey: 'nav.images.stock', icon: Home, help: 'dam.desc.stock' },
  { id: 'my-images', labelKey: 'nav.images.mine', icon: ImagePlus, help: 'dam.desc.myImages' },
  { id: 'favorites', labelKey: 'nav.images.favorites', icon: Star, help: 'dam.desc.favorites' },
  { id: 'collections', labelKey: 'nav.images.collections', icon: FolderOpen, help: 'dam.desc.collections' },
  { id: 'recent', labelKey: 'nav.images.recent', icon: Clock, help: 'dam.desc.recent' },
  { id: 'projects', labelKey: 'nav.images.projects', icon: Briefcase, help: 'dam.desc.projects' },
  { id: 'generate', labelKey: 'dam.gen.title', icon: Sparkles, perm: 'dam.generate', help: 'dam.desc.generate' },
  { id: 'videos', labelKey: 'nav.images.videos', icon: FileCode2, perm: 'dam.animations', help: 'dam.desc.videos' },
  { id: 'gdrive', labelKey: 'nav.images.gdrive', icon: HardDrive, perm: 'dam.gdrive', help: 'dam.desc.gdrive' },
]

export function DamNavSidebar() {
  const { t } = useTranslation()
  const { activeTab, setActiveTab } = useDamStore()
  const perms = useAccessStore((s) => s.permissions)
  const isOwner = useAccessStore((s) => s.isOwner)
  const navItems = NAV_ITEMS.filter((item) => !item.perm || isOwner || perms.has(item.perm))
  const { favoriteIds } = useDamFavorites()
  const { collections } = useDamCollections()
  const { savedIds } = useDamSaveImage()
  const { data: projects = [] } = useProjects()
  const { animations } = useUserAnimations()

  const counts: Partial<Record<DamTab, number>> = {
    'my-images': savedIds.size,
    favorites: favoriteIds.size,
    collections: collections.length,
    recent: savedIds.size,
    projects: projects.length,
    videos: animations.length,
  }

  return (
    <nav
      aria-label={t('dam.nav')}
      className="w-[230px] bg-background border-r border-white/5 flex flex-col shrink-0"
    >
      <div className="flex items-center gap-2.5 px-5 h-14 border-b border-white/5">
        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center shadow-lg shadow-indigo-500/20">
          <ImageIcon className="w-[18px] h-[18px] text-white" strokeWidth={2.2} />
        </div>
        <span className="text-white font-semibold text-[15px] tracking-tight">DAM</span>
      </div>

      <ul className="flex flex-col gap-0.5 px-3 py-3">
        {navItems.map((item) => {
          const Icon = item.icon
          const isActive = activeTab === item.id
          const count = counts[item.id]
          return (
            <li key={item.id}>
              <button
                type="button"
                onClick={() => setActiveTab(item.id)}
                aria-current={isActive ? 'page' : undefined}
                data-tour={`opt-dam-${item.id}`}
                className={`w-full flex items-center gap-3 h-10 pl-4 pr-3 rounded-full text-[13px] font-medium transition-colors ${
                  isActive
                    ? 'bg-indigo-500/15 text-indigo-300'
                    : 'text-white/65 hover:bg-white/5 hover:text-white/90'
                }`}
              >
                <Icon
                  className={`w-[18px] h-[18px] shrink-0 ${
                    isActive ? 'text-indigo-300' : 'text-white/50'
                  }`}
                  strokeWidth={isActive ? 2.2 : 1.8}
                />
                <span className="flex-1 truncate text-left">{t(item.labelKey)}</span>
                {item.help && <OptionHelp text={t(item.help)} />}
                {count !== undefined && count > 0 && (
                  <span
                    className={`text-[11px] tabular-nums px-1.5 py-px rounded ${
                      isActive ? 'bg-indigo-500/20 text-indigo-300' : 'text-white/35'
                    }`}
                    aria-label={t('dm.itemCount', { count })}
                  >
                    {count}
                  </span>
                )}
              </button>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
