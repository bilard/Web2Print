import { useDamStore } from '../../../stores/dam.store'
import { useGDriveStore } from '../../../stores/gdrive.store'
import { useModuleIntent } from '@/features/navigation/useModuleIntent'
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
import { UserAnimationsList } from '../../video/UserAnimationsList'
import { useCan, useQuota } from '../../access/useAccess'
import { DemoQuotaBanner } from '../../access/DemoQuotaBanner'
import { useTranslation, type TranslationKey } from '@/lib/i18n'

// Onglets où le quota d'assets DAM possédés a du sens (on exclut « Stock » = banque
// Adobe non possédée, et « videos » = animations HTML hors compteur images).
const OWNED_ASSET_TABS = new Set(['my-images', 'favorites', 'collections', 'recent', 'projects', 'generate', 'gdrive'])

const TAB_TITLES: Record<string, TranslationKey> = {
  stock: 'nav.images.stock',
  'my-images': 'nav.images.mine',
  favorites: 'nav.images.favorites',
  collections: 'nav.images.collections',
  recent: 'nav.images.recent',
  projects: 'nav.images.projects',
  videos: 'nav.images.videos',
  gdrive: 'nav.images.gdrive',
}

export function DamPage() {
  const { t } = useTranslation()
  const { activeTab, totalResults, selectedProjectId } = useDamStore()
  const setActiveTab = useDamStore((s) => s.setActiveTab)
  const gdriveConnected = useGDriveStore((s) => s.connected)

  useModuleIntent('images', (action) => {
    if (action.startsWith('tab:')) setActiveTab(action.slice('tab:'.length) as Parameters<typeof setActiveTab>[0])
  })
  // Gardes défensives : sans la permission, l'onglet (même resté actif) ne rend rien.
  const canGenerate = useCan('dam.generate')
  const canAnimations = useCan('dam.animations')
  const canGdrive = useCan('dam.gdrive')
  // DAM : le compteur `usage.damAssets` EST mû côté serveur (CF damUpload) → source fiable.
  const quota = useQuota()
  const damReached = quota.isDemo && quota.damAssets.remaining <= 0

  return (
    <div className="flex h-full bg-background overflow-hidden">
      <DamNavSidebar />

      {activeTab === 'stock' && <DamSidebar />}

      <div className="flex-1 flex flex-col min-w-0 min-h-0">
        {TAB_TITLES[activeTab] && (
          <div className="flex items-center justify-between px-6 h-14 shrink-0 border-b border-white/5">
            <h1 className="text-[15px] font-semibold text-white tracking-tight">
              {t(TAB_TITLES[activeTab])}
            </h1>
            {activeTab === 'stock' && totalResults > 0 && (
              <span className="text-[11px] text-white/40">
                {totalResults.toLocaleString()} résultats
              </span>
            )}
          </div>
        )}

        {OWNED_ASSET_TABS.has(activeTab) && (
          <DemoQuotaBanner reached={damReached} limit={quota.damAssets.limit} field="damAssets" className="mx-6 mt-4" />
        )}

        {activeTab === 'stock' && <DamImageGrid />}
        {activeTab === 'my-images' && <DamRecentImages />}
        {activeTab === 'favorites' && <DamFavorites />}
        {activeTab === 'collections' && <DamCollections />}
        {activeTab === 'recent' && <DamRecentImages />}
        {activeTab === 'projects' && (selectedProjectId ? <DamProjectAssets /> : <DamProjects />)}
        {activeTab === 'generate' && canGenerate && <DamGenerate />}
        {activeTab === 'videos' && canAnimations && <UserAnimationsList />}
        {activeTab === 'gdrive' && canGdrive && (
          <div className="flex-1 overflow-auto p-6 min-h-0">
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
