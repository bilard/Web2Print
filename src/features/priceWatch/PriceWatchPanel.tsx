// src/features/priceWatch/PriceWatchPanel.tsx
import { useState } from 'react'
import { CatalogTab } from './components/CatalogTab'
import { SitesTab } from './components/SitesTab'
import { ComparisonTab } from './components/ComparisonTab'

const TABS = [
  { id: 'catalog', label: 'Catalogue' },
  { id: 'sites', label: 'Sites' },
  { id: 'comparison', label: 'Comparatif' },
] as const
type TabId = (typeof TABS)[number]['id']

export function PriceWatchPanel() {
  const [tab, setTab] = useState<TabId>('catalog')

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-white">Veille tarifaire</h1>
        <p className="text-sm text-white/50">
          Surveillez les prix de vos produits chez vos concurrents.
        </p>
      </div>
      <div className="flex gap-1 border-b border-white/10">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`px-3 py-2 text-sm transition-colors ${
              tab === t.id
                ? 'border-b-2 border-[#6366f1] text-white'
                : 'text-white/50 hover:text-white/80'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      {tab === 'catalog' && <CatalogTab />}
      {tab === 'sites' && <SitesTab />}
      {tab === 'comparison' && <ComparisonTab />}
    </div>
  )
}
