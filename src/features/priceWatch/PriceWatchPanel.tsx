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
import { PairingRulesPage } from './rules/PairingRulesPage'
import { WatchSelector } from './dashboard/WatchSelector'
import { useWatchList } from './useCatalogReport'
import { useModuleIntent } from '@/features/navigation/useModuleIntent'
import { useModuleViewStore } from '@/stores/moduleView.store'
import { useCan } from '@/features/access/useAccess'
import { quote, useTranslation } from '@/lib/i18n'

export function PriceWatchPanel() {
  const { t } = useTranslation()

  // Source du tableau de bord : le suivi actif. Défaut = le plus récemment mis à jour
  // (useWatchList trie déjà). Bascule seulement si l'utilisateur n'a pas encore choisi,
  // ou si son choix a disparu.
  const watches = useWatchList()
  const [watchId, setWatchId] = useState<string | null>(null)
  // Vue courante du module. Une PAGE et non une modale : un formulaire de quatre étages
  // avec son aperçu chiffré ne se pilote pas dans une boîte posée sur l'écran qu'elle
  // recouvre. Et une vue interne plutôt qu'une route : le suivi actif, le concurrent
  // mesuré et le brouillon survivent ainsi au va-et-vient.
  const [view, setView] = useState<'dashboard' | 'rules'>('dashboard')
  // ⚠ La permission est vérifiée ICI aussi, pas seulement sur l'entrée de menu. Masquer un
  // bouton n'interdit rien : l'intent est déclenchable par URL (`?intent=…`) et par la
  // palette de commandes. Un écran qui décide des chiffres de tout un suivi ne se protège
  // pas d'un `display: none`.
  const canRules = useCan('priceWatch.rules')

  // Publie la vue au menu en arbre, qui allume l'entrée correspondante. Les identifiants
  // sont ceux des enfants de `modules.ts` — toute autre valeur n'allumerait rien.
  const publishView = useModuleViewStore((s) => s.set)
  useEffect(() => {
    publishView('price-watch', view === 'rules' && canRules ? 'section:rules' : 'section:comparison')
    // Le module quitté ne doit plus rien afficher comme actif : sinon « Comparatif »
    // resterait allumé sous une veille fermée.
    return () => publishView('price-watch', null)
  }, [view, canRules, publishView])
  useEffect(() => {
    if (watches.length === 0) { setWatchId(null); return }
    if (!watchId || !watches.some((w) => w.watchId === watchId)) setWatchId(watches[0].watchId)
  }, [watches, watchId])

  useModuleIntent('price-watch', (action) => {
    if (!action.startsWith('section:')) return
    const key = action.slice('section:'.length)
    // Les règles ne sont plus une section de la page : l'entrée de menu ouvre leur PAGE.
    // Aucun défilement à tenter, donc aucune cible à attendre.
    if (key === 'rules') { if (canRules) setView('rules'); return }
    // ⚠ Toute autre fonction vit dans le TABLEAU DE BORD : y revenir d'abord, sinon la
    // cible du défilement n'existe pas et « Comparatif » laissait l'utilisateur bloqué
    // sur la page des règles, sans rien faire.
    setView('dashboard')
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

  // Une permission retirée pendant la session referme la page : l'état de vue survivrait
  // sinon à la perte du droit.
  if (view === 'rules' && canRules) {
    return <PairingRulesPage watchId={watchId} onBack={() => setView('dashboard')} />
  }

  return (
    <div className="space-y-6">
      <header className="sticky top-0 z-30 -mx-8 px-8 pt-8 pb-4 bg-background border-b border-white/[0.06] flex flex-wrap items-start justify-between gap-4">
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
          {canRules && <button
            type="button" onClick={() => setView('rules')}
            className="text-xs rounded px-3 py-1.5 border border-white/10 text-white/60
              hover:text-white hover:border-white/25 transition-colors flex items-center gap-1.5"
          >
            <SlidersHorizontal className="w-3.5 h-3.5" />
            {t('pw.rules.title')}
          </button>}
          <WatchSelector watches={watches} value={watchId ?? ''} onChange={setWatchId} />
        </div>
      </header>

      <PriceWatchDashboard watchId={watchId} />

    </div>
  )
}
