// Écran « Suivi » : où en sont les traitements de fond de la veille tarifaire (moisson +
// passages de textes), en direct. Assemblage seulement — tout le calcul vit dans
// `buildWatchOps` (Task 2) et `buildOpsCockpit` (module voisin), tous deux PURS.
import { useEffect, useMemo, useState } from 'react'
import { WatchSelector } from '../dashboard/WatchSelector'
import { useWatchList, useCatalogReport, useCompetitorMeta } from '../useCatalogReport'
import { buildOpsCockpit } from '../dashboard/opsMetrics'
import { useWatchOps } from './useWatchOps'
import { OpsHeader } from './OpsHeader'
import { OpsActions } from './OpsActions'
import { ChantierCard } from './ChantierCard'
import { RunCardsStrip } from './RunCardsStrip'
import { IncidentLog } from './IncidentLog'
import { RunHistory } from './RunHistory'
import { OpsLlmCosts } from './OpsLlmCosts'
import { useRunHistory } from './useRunHistory'
import { useModuleIntent } from '@/features/navigation/useModuleIntent'
import { useModuleViewStore } from '@/stores/moduleView.store'
import { useTranslation } from '@/lib/i18n'

/** Sous-section de menu → ancre `data-pw-section` visée par le défilement. */
const SECTION_ANCHOR: Record<string, string> = { live: 'ops-header', incidents: 'ops-incidents', history: 'ops-history' }

export function WatchOpsScreen() {
  const { t } = useTranslation()
  const watches = useWatchList()
  const [watchId, setWatchId] = useState<string | null>(null)

  const publishView = useModuleViewStore((s) => s.set)
  useEffect(() => {
    publishView('watch-ops', 'section:live')
    return () => publishView('watch-ops', null)
  }, [publishView])

  useEffect(() => {
    if (watches.length === 0) { setWatchId(null); return }
    if (!watchId || !watches.some((w) => w.watchId === watchId)) setWatchId(watches[0].watchId)
  }, [watches, watchId])

  const workflowId = watches.find((w) => w.watchId === watchId)?.workflowId ?? null
  const report = useCatalogReport(watchId)
  const meta = useCompetitorMeta(watchId)
  const cockpit = useMemo(() => (report ? buildOpsCockpit(report, meta) : null), [report, meta])
  const { view, incidents } = useWatchOps(watchId, workflowId ?? undefined, cockpit)
  // ⚠ Lu ICI et pas dans les deux composants : l'en-tête montre la durée typique et la
  // tendance, l'historique montre les lignes — même liste, un seul abonnement Firestore.
  const { runs, trend, typical } = useRunHistory(workflowId)

  // ⚠ Défilement INSTANTANÉ, jamais `behavior: 'smooth'` : sur un écran qui se repeint en
  // continu (tick de l'horloge, abonnements Firestore), `smooth` reste bloqué à 0 — cf.
  // le même piège mesuré sur `PriceWatchPanel`. On réessaie : la cible peut ne pas encore
  // exister (contenu sous Suspense) ou se déplacer (blocs au-dessus qui grandissent).
  useModuleIntent('watch-ops', (action) => {
    if (!action.startsWith('section:')) return
    const anchor = SECTION_ANCHOR[action.slice('section:'.length)]
    if (!anchor) return
    const goTo = () => {
      const el = document.querySelector<HTMLElement>(`[data-pw-section="${anchor}"]`)
      el?.scrollIntoView({ block: 'start' })
      return !!el
    }
    if (!goTo()) { for (const delay of [120, 350, 700, 1200]) window.setTimeout(goTo, delay) }
    window.setTimeout(goTo, 1600)
  })

  if (watches.length === 0) {
    return <p className="text-sm text-white/45 py-8 text-center">{t('ops.screen.empty')}</p>
  }

  return (
    <div className="space-y-6">
      {/* ⚠ COLLANT au défilement : sur un écran qui se lit de haut en bas (cartes, bande du
          run, historique, journal), l'état du run et le sélecteur de suivi sont ce qu'on
          garde sous les yeux — sans eux, on ne sait plus DE QUOI on lit les chiffres.
          `-mx-8 px-8` : le conteneur de la page porte un `px-8`, le bandeau doit couvrir
          toute la largeur pour que le contenu qui défile ne se voie pas sur ses côtés.
          `top-0` sur le conteneur défilant de `DashboardPage`, et un fond OPAQUE (le
          contenu passe DESSOUS, il ne doit pas transparaître). */}
      <div className="sticky top-0 z-20 -mx-8 px-8 pt-4 pb-3 bg-background border-b border-white/[0.06] space-y-3">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold text-white">{t('ops.screen.title')}</h1>
            <p className="text-sm text-white/50">{t('ops.screen.intro')}</p>
          </div>
          <WatchSelector watches={watches} value={watchId ?? ''} onChange={setWatchId} />
        </header>

        <OpsHeader run={view.run} workflowId={workflowId} typical={typical} trend={trend} />
      </div>
      {/* ⚠ Les actions et les coûts partagent la rangée : la moitié droite restait vide sur
          toute la largeur de l'écran, pendant que le bloc des coûts occupait une rangée
          entière plus bas pour deux lignes de texte. Ils s'empilent sous `lg`. */}
      <div className="flex flex-wrap items-start gap-4">
        <div className="flex-1 min-w-[18rem]">
          <OpsActions workflowId={workflowId} run={view.run} />
        </div>
        <div className="w-full lg:w-auto lg:min-w-[26rem] lg:max-w-[38rem]">
          <OpsLlmCosts />
        </div>
      </div>

      {view.chantiers.length === 0 ? (
        <p className="text-sm text-white/45 py-8 text-center">{t('ops.screen.noChantier')}</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
          {view.chantiers.map((c) => <ChantierCard key={c.id} chantier={c} />)}
        </div>
      )}

      {/* ⚠⚠ Le bloc n'existe que s'il a une ventilation à donner. Le mode PIM omet
          délibérément `reasons` (cf. `textsSnapshot`) : on affichait donc un titre de
          section suivi de « non ventilé » — deux lignes pour dire qu'on n'avait rien à
          dire, sur le cas le plus courant. */}
      {view.textsReasons && (
        <div className="bg-surface rounded-lg p-4">
          <h3 className="text-sm font-semibold text-white mb-2">{t('ops.reasons.title')}</h3>
          <p className="text-sm text-white/60">
            {t('ops.reasons.detail', { fresh: view.textsReasons.fresh, stale: view.textsReasons.stale })}
          </p>
        </div>
      )}

      <RunCardsStrip workflowId={workflowId} />
      <RunHistory runs={runs} />
      <IncidentLog incidents={incidents} />
    </div>
  )
}
