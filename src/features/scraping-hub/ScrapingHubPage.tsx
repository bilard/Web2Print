import { useState } from 'react'
import { BookOpen, FolderTree, Bug } from 'lucide-react'
import { RulesTab } from './RulesTab'
import { VendorsTab } from './VendorsTab'
import { DebugTab } from './DebugTab'

type Tab = 'rules' | 'vendors' | 'debug'

const TABS: { id: Tab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: 'rules',   label: 'Règles',                   icon: BookOpen },
  { id: 'vendors', label: 'Fournisseurs & Templates', icon: FolderTree },
  { id: 'debug',   label: 'Debug Jina/LLM',           icon: Bug },
]

export function ScrapingHubPage() {
  const [tab, setTab] = useState<Tab>('rules')
  return (
    <div className="h-full flex flex-col bg-[#0f0f0f]">
      <header className="flex items-center gap-1 px-4 py-2 border-b border-white/10 bg-[#1a1a1a]">
        <h1 className="text-sm font-semibold text-white/90 mr-4">Scraping Hub</h1>
        {TABS.map((t) => {
          const Icon = t.icon
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`px-3 py-1.5 rounded text-[11px] font-semibold inline-flex items-center gap-1.5 transition-colors ${
                tab === t.id
                  ? 'bg-indigo-500/20 text-indigo-200 border border-indigo-400/30'
                  : 'text-white/60 hover:text-white/90 border border-transparent'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {t.label}
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
