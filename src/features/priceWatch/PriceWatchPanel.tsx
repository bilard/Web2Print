// src/features/priceWatch/PriceWatchPanel.tsx
// Tableau de bord de la veille tarifaire. Vue principale : le comparatif CATALOGUE
// (moisson + « Comparer catalogue »), pré-agrégé en rapport. Vue secondaire (repliée) :
// l'ancien suivi par recherche (node « Veille prix »), affiché seulement s'il a des
// données. La configuration se fait toujours dans le FLUX (workflow), pas ici.
import { useState } from 'react'
import { ComparisonTab } from './components/ComparisonTab'
import { PriceWatchDashboard } from './dashboard/PriceWatchDashboard'
import { usePriceMatches } from './usePriceWatch'
import { useModuleIntent } from '@/features/navigation/useModuleIntent'
import { ChevronDown } from 'lucide-react'

export function PriceWatchPanel() {
  const legacyMatches = usePriceMatches()
  const [legacyOpen, setLegacyOpen] = useState(false)

  useModuleIntent('price-watch', (action) => {
    if (!action.startsWith('section:')) return
    const key = action.slice('section:'.length)
    document
      .querySelector<HTMLElement>(`[data-pw-section="${key}"]`)
      ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  })

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-white">Veille tarifaire</h1>
        <p className="text-sm text-white/50">
          Positionnement de tes prix face aux concurrents. La configuration (produits en
          entrée, sites, familles) se fait dans un workflow, via les nodes
          <span className="text-white/80"> « Moisson concurrents »</span> et
          <span className="text-white/80"> « Comparer catalogue »</span>.
        </p>
      </div>

      <PriceWatchDashboard />

      {legacyMatches.length > 0 && (
        <section className="border-t border-white/10 pt-4">
          <button type="button" onClick={() => setLegacyOpen((o) => !o)}
            className="flex items-center gap-2 text-sm font-semibold text-white/70 hover:text-white">
            <ChevronDown className={`w-4 h-4 transition-transform ${legacyOpen ? 'rotate-180' : ''}`} />
            Suivi par recherche ({legacyMatches.length})
          </button>
          {legacyOpen && <div className="mt-3"><ComparisonTab /></div>}
        </section>
      )}
    </div>
  )
}
