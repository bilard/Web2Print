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

  // La ventilation « jamais traité / source modifiée depuis » est globale au passage de
  // textes : elle n'a rien à dire sur un suivi qui ne fait QUE de la moisson.
  const hasTextChantiers = view.chantiers.some((c) => c.id !== 'harvest')

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-white">{t('ops.screen.title')}</h1>
          <p className="text-sm text-white/50">{t('ops.screen.intro')}</p>
        </div>
        <WatchSelector watches={watches} value={watchId ?? ''} onChange={setWatchId} />
      </header>

      <OpsHeader run={view.run} workflowId={workflowId} />
      <OpsActions workflowId={workflowId} run={view.run} />

      {view.chantiers.length === 0 ? (
        <p className="text-sm text-white/45 py-8 text-center">{t('ops.screen.noChantier')}</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
          {view.chantiers.map((c) => <ChantierCard key={c.id} chantier={c} />)}
        </div>
      )}

      {hasTextChantiers && (
        <div className="bg-surface rounded-lg p-4">
          <h3 className="text-sm font-semibold text-white mb-2">{t('ops.reasons.title')}</h3>
          {view.textsReasons ? (
            <p className="text-sm text-white/60">
              {t('ops.reasons.detail', { fresh: view.textsReasons.fresh, stale: view.textsReasons.stale })}
            </p>
          ) : (
            <p className="text-sm text-white/45">{t('ops.reasons.unknown')}</p>
          )}
        </div>
      )}

      <RunCardsStrip workflowId={workflowId} />
      <RunHistory workflowId={workflowId} />
      <IncidentLog incidents={incidents} />
    </div>
  )
}
