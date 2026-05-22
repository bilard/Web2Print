import { Image as ImageIcon, Home, ImagePlus, Star, FolderOpen, Clock, Briefcase, Sparkles, HardDrive, FileCode2 } from 'lucide-react'
import { useDamStore } from '../../../stores/dam.store'
import { useDamFavorites } from '../hooks/useDamFavorites'
import { useDamCollections } from '../hooks/useDamCollections'
import { useDamSaveImage } from '../hooks/useDamSaveImage'
import { useProjects } from '../../projects/useProjects'
import { useUserAnimations } from '../../video/useUserAnimations'
import type { DamTab } from '../types'

interface NavItem {
  id: DamTab
  label: string
  icon: typeof Home
}

const NAV_ITEMS: NavItem[] = [
  { id: 'stock', label: 'Banque d\'images', icon: Home },
  { id: 'my-images', label: 'Mes images', icon: ImagePlus },
  { id: 'favorites', label: 'Favoris', icon: Star },
  { id: 'collections', label: 'Collections', icon: FolderOpen },
  { id: 'recent', label: 'Récents', icon: Clock },
  { id: 'projects', label: 'Projets', icon: Briefcase },
  { id: 'generate', label: 'Création d\'image', icon: Sparkles },
  { id: 'videos', label: 'Animations HTML', icon: FileCode2 },
  { id: 'gdrive', label: 'Google Drive', icon: HardDrive },
]

export function DamNavSidebar() {
  const { activeTab, setActiveTab } = useDamStore()
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
      aria-label="Navigation DAM"
      className="w-[230px] bg-[#0f0f0f] border-r border-white/5 flex flex-col shrink-0"
    >
      <div className="flex items-center gap-2.5 px-5 h-14 border-b border-white/5">
        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center shadow-lg shadow-indigo-500/20">
          <ImageIcon className="w-[18px] h-[18px] text-white" strokeWidth={2.2} />
        </div>
        <span className="text-white font-semibold text-[15px] tracking-tight">DAM</span>
      </div>

      <ul className="flex flex-col gap-0.5 px-3 py-3">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon
          const isActive = activeTab === item.id
          const count = counts[item.id]
          return (
            <li key={item.id}>
              <button
                type="button"
                onClick={() => setActiveTab(item.id)}
                aria-current={isActive ? 'page' : undefined}
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
                <span className="flex-1 truncate text-left">{item.label}</span>
                {count !== undefined && count > 0 && (
                  <span
                    className={`text-[11px] tabular-nums px-1.5 py-px rounded ${
                      isActive ? 'bg-indigo-500/20 text-indigo-300' : 'text-white/35'
                    }`}
                    aria-label={`${count} éléments`}
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
