// Tableau de bord de la veille tarifaire. Vue principale : le comparatif CATALOGUE
// (moisson + « Comparer catalogue »), pré-agrégé en rapport. Vue secondaire (repliée) :
// l'ancien suivi par recherche (node « Veille prix »), affiché seulement s'il a des
// données. La configuration se fait toujours dans le FLUX (workflow), pas ici.
import { useEffect, useState } from 'react'
import { ComparisonTab } from './components/ComparisonTab'
import { PriceWatchDashboard } from './dashboard/PriceWatchDashboard'
import { WatchSelector } from './dashboard/WatchSelector'
import { useWatchList } from './useCatalogReport'
import { usePriceMatches } from './usePriceWatch'
import { useModuleIntent } from '@/features/navigation/useModuleIntent'
import { ChevronDown } from 'lucide-react'
import { quote, useTranslation } from '@/lib/i18n'

export function PriceWatchPanel() {
  const { t } = useTranslation()
  const legacyMatches = usePriceMatches()
  const [legacyOpen, setLegacyOpen] = useState(false)

  // Source du tableau de bord : le suivi actif. Défaut = le plus récemment mis à jour
  // (useWatchList trie déjà). Bascule seulement si l'utilisateur n'a pas encore choisi,
  // ou si son choix a disparu.
  const watches = useWatchList()
  const [watchId, setWatchId] = useState<string | null>(null)
  useEffect(() => {
    if (watches.length === 0) { setWatchId(null); return }
    if (!watchId || !watches.some((w) => w.watchId === watchId)) setWatchId(watches[0].watchId)
  }, [watches, watchId])

  useModuleIntent('price-watch', (action) => {
    if (!action.startsWith('section:')) return
    const key = action.slice('section:'.length)
    document
      .querySelector<HTMLElement>(`[data-pw-section="${key}"]`)
      ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  })

  return (
    <div className="space-y-6 pt-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-white">{t('pw.title')}</h1>
          <p className="text-sm text-white/50">
            {t('pw.intro.before')}
            <span className="text-white/80"> {quote(t('node.harvest-competitor.label'))}</span>{t('pw.intro.and')}
            <span className="text-white/80"> {quote(t('node.compare-catalog.label'))}</span>.
          </p>
        </div>
        <WatchSelector watches={watches} value={watchId ?? ''} onChange={setWatchId} />
      </div>

      <PriceWatchDashboard watchId={watchId} />

      {/* Section « À confirmer » : toujours présente (le menu y renvoie via l'intent
          section:pending). Regroupe les appariements INCERTAINS à valider — pour l'instant
          l'ancien suivi par recherche ; y arriveront les correspondances par nom. */}
      <section data-pw-section="pending" className="border-t border-white/10 pt-4">
        <button type="button" onClick={() => setLegacyOpen((o) => !o)}
          className="flex items-center gap-2 text-sm font-semibold text-white/70 hover:text-white">
          <ChevronDown className={`w-4 h-4 transition-transform ${legacyOpen ? 'rotate-180' : ''}`} />
          {t('pw.toConfirmTab', { count: legacyMatches.length > 0 ? ` (${legacyMatches.length})` : '' })}
        </button>
        {legacyOpen && (legacyMatches.length > 0
          ? <div className="mt-3"><ComparisonTab /></div>
          : <p className="mt-3 text-sm text-white/40">{t('pw.noPending')}</p>)}
      </section>
    </div>
  )
}
