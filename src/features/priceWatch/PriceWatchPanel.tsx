// src/features/priceWatch/PriceWatchPanel.tsx
// Tableau de bord lecture-seule de la veille tarifaire. La configuration (produits
// en entrée + sites + champs) se fait dans le FLUX via le node « Veille tarifaire ».
import { ComparisonTab } from './components/ComparisonTab'

export function PriceWatchPanel() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-white">Veille tarifaire</h1>
        <p className="text-sm text-white/50">
          Résultats de tes suivis de prix. La configuration (liste de produits en entrée,
          sites concurrents et champs à scraper) se fait dans un workflow, via le node
          <span className="text-white/80"> « Veille tarifaire »</span>.
        </p>
      </div>
      <ComparisonTab />
    </div>
  )
}
