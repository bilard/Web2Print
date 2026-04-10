import { useDamStore } from '../../../stores/dam.store'
import { DamSidebar } from './DamSidebar'
import { DamImageGrid } from './DamImageGrid'
import { DamFavorites } from './DamFavorites'
import { DamCollections } from './DamCollections'
import { DamRecentImages } from './DamRecentImages'
import { DamLightbox } from './DamLightbox'
import type { DamTab } from '../types'

const TABS: { id: DamTab; label: string }[] = [
  { id: 'stock', label: 'Stock' },
  { id: 'my-images', label: 'Mes images' },
  { id: 'favorites', label: 'Favoris' },
  { id: 'collections', label: 'Collections' },
  { id: 'recent', label: 'Récents' },
]

export function DamPage() {
  const { activeTab, setActiveTab, totalResults } = useDamStore()

  return (
    <div className="flex h-full">
      {activeTab === 'stock' && <DamSidebar />}

      <div className="flex-1 flex flex-col min-w-0">
        <div className="flex items-center justify-between px-4 py-2 border-b border-white/5">
          <div className="flex">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-3.5 py-1.5 text-[11px] transition border-b-2 ${
                  activeTab === tab.id
                    ? 'text-indigo-400 border-indigo-500'
                    : 'text-white/40 border-transparent hover:text-white/60'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
          {activeTab === 'stock' && totalResults > 0 && (
            <span className="text-[10px] text-white/30">
              {totalResults.toLocaleString()} résultats
            </span>
          )}
        </div>

        {activeTab === 'stock' && <DamImageGrid />}
        {activeTab === 'my-images' && <DamRecentImages />}
        {activeTab === 'favorites' && <DamFavorites />}
        {activeTab === 'collections' && <DamCollections />}
        {activeTab === 'recent' && <DamRecentImages />}
      </div>

      <DamLightbox />
    </div>
  )
}
