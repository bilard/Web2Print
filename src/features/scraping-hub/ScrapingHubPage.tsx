import { useState } from 'react'
import { BookOpen, FolderTree, Bug } from 'lucide-react'
import { RulesTab } from './RulesTab'
import { VendorsTab } from './VendorsTab'
import { DebugTab } from './DebugTab'
import { useModuleIntent } from '@/features/navigation/useModuleIntent'
import { type TranslationKey, t } from '@/lib/i18n'

type Tab = 'rules' | 'vendors' | 'debug'

// ⚠️ CLÉS, pas `t()` : ce tableau est évalué au CHARGEMENT du module.
const TABS: { id: Tab; labelKey: TranslationKey; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: 'rules',   labelKey: 'sh2.rules',   icon: BookOpen },
  { id: 'vendors', labelKey: 'sh2.vendors', icon: FolderTree },
  { id: 'debug',   labelKey: 'sh2.debug',   icon: Bug },
]

export function ScrapingHubPage() {
  const [tab, setTab] = useState<Tab>('rules')
  useModuleIntent('scraping-hub', (action) => {
    if (action.startsWith('tab:')) setTab(action.slice('tab:'.length) as Tab)
  })
  return (
    <div className="h-full flex flex-col bg-background">
      <header className="sticky top-0 z-20 flex items-center gap-1 px-4 py-2 border-b border-white/10 bg-surface">
        <h1 className="text-sm font-semibold text-white/90 mr-4">Scraping Hub</h1>
        {TABS.map((item) => {
          const Icon = item.icon
          return (
            <button
              key={item.id}
              onClick={() => setTab(item.id)}
              className={`px-3 py-1.5 rounded text-[11px] font-semibold inline-flex items-center gap-1.5 transition-colors ${
                tab === item.id
                  ? 'bg-indigo-500/20 text-indigo-200 border border-indigo-400/30'
                  : 'text-white/60 hover:text-white/90 border border-transparent'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {t(item.labelKey)}
            </button>
          )
        })}
      </header>
      {tab === 'rules' && <RulesTab />}
      {tab === 'vendors' && <VendorsTab />}
      {tab === 'debug' && <DebugTab />}
    </div>
  )
}
