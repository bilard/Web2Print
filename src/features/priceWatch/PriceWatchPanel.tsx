// Tableau de bord de la veille tarifaire : le comparatif CATALOGUE (moisson + « Comparer
// catalogue »), pré-agrégé en rapport. La configuration se fait dans le FLUX (workflow),
// pas ici.
//
// ⚠ La section « À confirmer » a été RETIRÉE : elle attendait les appariements de l'ancien
// suivi par recherche, qui n'en produit plus, et restait donc vide en permanence. Le
// contrôle des appariements douteux vit dans l'écran « Concurrents » (module Données), qui
// juge chaque paire et sait balayer tous les sites d'un coup.
import { useEffect, useState } from 'react'
import { SlidersHorizontal } from 'lucide-react'
import { PriceWatchDashboard } from './dashboard/PriceWatchDashboard'
import { PairingRulesPanel } from './rules/PairingRulesPanel'
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
  const [rulesOpen, setRulesOpen] = useState(false)
  useEffect(() => {
    if (watches.length === 0) { setWatchId(null); return }
    if (!watchId || !watches.some((w) => w.watchId === watchId)) setWatchId(watches[0].watchId)
  }, [watches, watchId])

  useModuleIntent('price-watch', (action) => {
    if (!action.startsWith('section:')) return
    const key = action.slice('section:'.length)
    // Les règles ne sont plus une section de la page : l'entrée de menu OUVRE leur
    // fenêtre. Aucun défilement à tenter, donc aucune cible à attendre.
    if (key === 'rules') { setRulesOpen(true); return }
    // ⚠ Défilement INSTANTANÉ, jamais `behavior: 'smooth'`. Mesuré sur cette page : le
    // défilement fluide ne part même pas — `scrollTop` reste à 0 sur toute la durée,
    // alors que le même appel en `auto` atteint 5 619 px. Ce tableau de bord se repeint
    // en continu (métas concurrents en onSnapshot, rapport live) et chaque re-layout
    // annule l'animation en cours.
    //
    // ⚠ La cible n'existe pas forcément ENCORE : venant d'un autre module, l'intent est
    // consommé au montage, alors que le tableau de bord est sous Suspense. Abandonner au
    // premier essai ne faisait rien du tout. On réessaie, puis on recale — les blocs
    // au-dessus grandissent à l'arrivée de leurs données et déplacent la cible.
    //
    // Les minuteurs ne sont pas annulés au démontage : `useModuleIntent` ne relaie aucune
    // fonction de nettoyage, et en rendre une ici n'en donnerait que l'illusion. Sans
    // conséquence : la requête ne trouve alors plus rien et l'appel s'évanouit.
    const goTo = () => {
      const el = document.querySelector<HTMLElement>(`[data-pw-section="${key}"]`)
      el?.scrollIntoView({ block: 'start' })
      return !!el
    }
    if (!goTo()) {
      for (const delay of [120, 350, 700, 1200]) window.setTimeout(goTo, delay)
    }
    window.setTimeout(goTo, 1600)
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
        <div className="flex items-center gap-2">
          {/* Accès direct : le menu en arbre ouvre la même fenêtre, mais il faut aussi
              pouvoir y aller depuis l'écran qu'on est en train de lire. */}
          <button
            type="button" onClick={() => setRulesOpen(true)}
            className="text-xs rounded px-3 py-1.5 border border-white/10 text-white/60
              hover:text-white hover:border-white/25 transition-colors flex items-center gap-1.5"
          >
            <SlidersHorizontal className="w-3.5 h-3.5" />
            {t('pw.rules.title')}
          </button>
          <WatchSelector watches={watches} value={watchId ?? ''} onChange={setWatchId} />
        </div>
      </div>

      <PriceWatchDashboard watchId={watchId} />

      {rulesOpen && <PairingRulesPanel watchId={watchId} onClose={() => setRulesOpen(false)} />}
    </div>
  )
}
