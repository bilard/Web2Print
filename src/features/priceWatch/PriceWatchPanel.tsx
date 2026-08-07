// Tableau de bord de la veille tarifaire : le comparatif CATALOGUE (moisson + « Comparer
// catalogue »), pré-agrégé en rapport. La configuration se fait dans le FLUX (workflow),
// pas ici.
//
// ⚠ La section « À confirmer » a été RETIRÉE : elle attendait les appariements de l'ancien
// suivi par recherche, qui n'en produit plus, et restait donc vide en permanence. Le
// contrôle des appariements douteux vit dans l'écran « Concurrents » (module Données), qui
// juge chaque paire et sait balayer tous les sites d'un coup.
import { useEffect, useState } from 'react'
import { PriceWatchDashboard } from './dashboard/PriceWatchDashboard'
import { WatchSelector } from './dashboard/WatchSelector'
import { useWatchList } from './useCatalogReport'
import { useModuleIntent } from '@/features/navigation/useModuleIntent'
import { quote, useTranslation } from '@/lib/i18n'

export function PriceWatchPanel() {
  const { t } = useTranslation()

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

    </div>
  )
}
