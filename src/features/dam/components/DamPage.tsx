import { useDamStore } from '../../../stores/dam.store'
import { useGDriveStore } from '../../../stores/gdrive.store'
import { DamNavSidebar } from './DamNavSidebar'
import { DamSidebar } from './DamSidebar'
import { DamImageGrid } from './DamImageGrid'
import { DamFavorites } from './DamFavorites'
import { DamCollections } from './DamCollections'
import { DamRecentImages } from './DamRecentImages'
import { DamGenerate } from './DamGenerate'
import { DamProjects } from './DamProjects'
import { DamProjectAssets } from './DamProjectAssets'
import { DamLightbox } from './DamLightbox'
import { GDriveConnect } from '../../gdrive/GDriveConnect'
import { GDrivePanel } from '../../gdrive/GDrivePanel'

const TAB_TITLES: Record<string, string> = {
  stock: 'Banque d\'images',
  'my-images': 'Mes images',
  favorites: 'Favoris',
  collections: 'Collections',
  recent: 'Récents',
  projects: 'Projets',
  gdrive: 'Google Drive',
}

export function DamPage() {
  const { activeTab, totalResults, selectedProjectId } = useDamStore()
  const gdriveConnected = useGDriveStore((s) => s.connected)

  return (
    <div className="flex h-full bg-[#0f0f0f]">
      <DamNavSidebar />

      {activeTab === 'stock' && <DamSidebar />}

      <div className="flex-1 flex flex-col min-w-0">
        {TAB_TITLES[activeTab] && (
          <div className="flex items-center justify-between px-6 h-14 border-b border-white/5">
            <h1 className="text-[15px] font-semibold text-white tracking-tight">
              {TAB_TITLES[activeTab]}
            </h1>
            {activeTab === 'stock' && totalResults > 0 && (
              <span className="text-[11px] text-white/40">
                {totalResults.toLocaleString()} résultats
              </span>
            )}
          </div>
        )}

        {activeTab === 'stock' && <DamImageGrid />}
        {activeTab === 'my-images' && <DamRecentImages />}
        {activeTab === 'favorites' && <DamFavorites />}
        {activeTab === 'collections' && <DamCollections />}
        {activeTab === 'recent' && <DamRecentImages />}
        {activeTab === 'projects' && (selectedProjectId ? <DamProjectAssets /> : <DamProjects />)}
        {activeTab === 'generate' && <DamGenerate />}
        {activeTab === 'gdrive' && (
          <div className="flex-1 overflow-auto p-6">
            {gdriveConnected ? (
              <GDrivePanel />
            ) : (
              <div className="max-w-xl">
                <GDriveConnect />
              </div>
            )}
          </div>
        )}
      </div>

      <DamLightbox />
    </div>
  )
}
