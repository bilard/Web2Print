import { useBriefUIStore, type TaxonomyTab } from '@/stores/brief.store'

interface TabDef {
  id: TaxonomyTab
  label: string
}

const TABS: TabDef[] = [
  { id: 'tree', label: 'Arbre' },
  { id: 'briefs', label: 'Briefs clients' },
]

export function TaxonomyMainTabs() {
  const { currentTab, setCurrentTab } = useBriefUIStore()

  return (
    <div className="h-10 bg-[#141414] border-b border-white/[0.06] flex items-center px-2 gap-1 shrink-0">
      {TABS.map((tab) => {
        const active = currentTab === tab.id
        return (
          <button
            key={tab.id}
            onClick={() => setCurrentTab(tab.id)}
            className={`text-[12px] px-3 py-1.5 rounded-md transition-colors ${
              active
                ? 'bg-white/[0.08] text-white'
                : 'text-white/50 hover:text-white/80 hover:bg-white/[0.04]'
            }`}
            aria-pressed={active}
          >
            {tab.label}
          </button>
        )
      })}
    </div>
  )
}
