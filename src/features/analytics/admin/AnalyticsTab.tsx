// src/features/analytics/admin/AnalyticsTab.tsx
import { lazy, Suspense, useMemo, useState } from 'react'
import { Download, Trash2, Loader2, UserX } from 'lucide-react'
import { toast } from 'sonner'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { useAnalyticsEvents } from '../useAnalyticsEvents'
import { usePeriod, type PeriodKey } from '../usePeriod'
import { computeKpis, timeSeries, filterEvents, NO_FILTER, type EventFilter } from '../metrics'
import { downloadEventsCsv } from '../exportCsv'
import { useClearAnalytics, usePurgeMyAnalytics } from '../useClearAnalytics'
import { AnalyticsKpiCards } from './AnalyticsKpiCards'
import { AnalyticsTimeChart } from './AnalyticsTimeChart'
import { AnalyticsTopLists } from './AnalyticsTopLists'
import { AnalyticsRecent } from './AnalyticsRecent'

// Chargée à part : le fond de carte (Natural Earth 50m, ~500 Ko) ne doit pas peser sur le bundle principal.
const AnalyticsWorldMap = lazy(() =>
  import('./AnalyticsWorldMap').then((m) => ({ default: m.AnalyticsWorldMap })),
)
import { AnalyticsUsers } from './AnalyticsUsers'
import { AnalyticsFilters } from './AnalyticsFilters'

const PERIODS: { key: PeriodKey; label: string }[] = [
  { key: '7d', label: '7 j' },
  { key: '30d', label: '30 j' },
  { key: '90d', label: '90 j' },
  { key: '12m', label: '12 mois' },
  { key: 'custom', label: 'Perso' },
]

export function AnalyticsTab() {
  const { period, setPeriod, customFrom, setCustomFrom, customTo, setCustomTo, fromMs, toMs, prevFromMs, prevToMs, isLive } = usePeriod('90d')
  const today = new Date().toISOString().slice(0, 10)
  const [filter, setFilter] = useState<EventFilter>(NO_FILTER)
  // Pays sélectionné dans la carte « Pays » → mis en évidence sur la carte du monde.
  const [country, setCountry] = useState<string | null>(null)
  const [confirmClear, setConfirmClear] = useState(false)
  const [confirmPurge, setConfirmPurge] = useState(false)
  const clear = useClearAnalytics()
  const purgeMine = usePurgeMyAnalytics()
  const handleClear = () => {
    clear.mutate(undefined, {
      onSuccess: (deleted) => {
        setConfirmClear(false)
        toast.success(`Historique vidé — ${deleted.toLocaleString('fr-FR')} consultation(s) supprimée(s).`)
      },
      onError: (e) => toast.error(`Échec : ${e instanceof Error ? e.message : 'erreur inconnue'}`),
    })
  }
  const handlePurgeMine = () => {
    purgeMine.mutate(undefined, {
      onSuccess: (deleted) => {
        setConfirmPurge(false)
        toast.success(`Vos visites supprimées — ${deleted.toLocaleString('fr-FR')} consultation(s).`)
      },
      onError: (e) => toast.error(`Échec : ${e instanceof Error ? e.message : 'erreur inconnue'}`),
    })
  }
  // Preset : borne haute ouverte (jusqu'à maintenant) pour inclure le direct.
  // Plage perso : borne haute fixée à la date de fin choisie.
  const cur = useAnalyticsEvents(fromMs, isLive ? null : toMs, true)
  const prev = useAnalyticsEvents(prevFromMs, prevToMs, true)
  const allEvents = cur.data ?? []
  const events = useMemo(() => filterEvents(allEvents, filter), [allEvents, filter])
  const kpis = useMemo(() => computeKpis(events), [events])
  const prevKpis = useMemo(() => computeKpis(filterEvents(prev.data ?? [], filter)), [prev.data, filter])
  const series = useMemo(() => timeSeries(events, fromMs, toMs), [events, fromMs, toMs])

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex gap-1">
            {PERIODS.map((p) => (
              <button
                key={p.key}
                onClick={() => setPeriod(p.key)}
                className={`px-3 py-1.5 rounded text-sm ${
                  period === p.key ? 'bg-white/[0.08] text-white' : 'text-white/45 hover:text-white/70'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
          {period === 'custom' && (
            <div className="flex items-center gap-2 text-xs text-white/60">
              <label className="flex items-center gap-1.5">Du
                <input type="date" value={customFrom} max={customTo || today} onChange={(e) => setCustomFrom(e.target.value)} className="bg-surface-2 border border-white/10 rounded px-2 py-1 text-white/80" />
              </label>
              <label className="flex items-center gap-1.5">Au
                <input type="date" value={customTo} max={today} onChange={(e) => setCustomTo(e.target.value)} className="bg-surface-2 border border-white/10 rounded px-2 py-1 text-white/80" />
              </label>
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => downloadEventsCsv(events, `analytics-${period}.csv`)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded text-sm text-white/70 hover:text-white bg-surface-2"
          >
            <Download className="w-4 h-4" /> CSV
          </button>
          <button
            onClick={() => setConfirmPurge(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded text-sm text-white/70 hover:text-white bg-surface-2"
            title="Supprimer mes propres visites (tests) — elles faussent les stats"
          >
            <UserX className="w-4 h-4" /> Purger mes visites
          </button>
          <button
            onClick={() => setConfirmClear(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded text-sm text-red-400/80 hover:text-red-300 bg-surface-2 hover:bg-red-500/10"
            title="Vider tout l'historique de consultation"
          >
            <Trash2 className="w-4 h-4" /> Vider
          </button>
        </div>
      </div>

      <AlertDialog open={confirmClear} onOpenChange={(o) => !clear.isPending && setConfirmClear(o)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Vider tout l'historique ?</AlertDialogTitle>
            <AlertDialogDescription>
              Cette action supprime <strong>définitivement toutes les consultations</strong> enregistrées
              (toutes périodes confondues), pas seulement celles affichées. Elle est irréversible.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={clear.isPending}>Annuler</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); handleClear() }}
              disabled={clear.isPending}
              className="bg-red-600 hover:bg-red-700 text-[#fff]"
            >
              {clear.isPending ? <><Loader2 className="w-4 h-4 animate-spin" /> Suppression…</> : 'Vider définitivement'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmPurge} onOpenChange={(o) => !purgeMine.isPending && setConfirmPurge(o)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Purger vos propres visites ?</AlertDialogTitle>
            <AlertDialogDescription>
              Supprime <strong>uniquement vos consultations</strong> (vous, propriétaire) — vos tests
              qui faussent les statistiques. Le trafic des autres visiteurs n'est pas touché. Action irréversible.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={purgeMine.isPending}>Annuler</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); handlePurgeMine() }}
              disabled={purgeMine.isPending}
              className="bg-red-600 hover:bg-red-700 text-[#fff]"
            >
              {purgeMine.isPending ? <><Loader2 className="w-4 h-4 animate-spin" /> Suppression…</> : 'Purger mes visites'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {cur.isLoading || prev.isLoading ? (
        <div className="text-white/40 text-sm py-12 text-center">Chargement…</div>
      ) : allEvents.length === 0 ? (
        <div className="text-white/40 text-sm py-12 text-center">
          Aucune donnée de trafic sur cette période.
        </div>
      ) : (
        <>
          <AnalyticsFilters events={allEvents} filter={filter} onChange={setFilter} />
          {events.length === 0 ? (
            <div className="text-white/40 text-sm py-12 text-center">
              Aucune donnée pour ces filtres.
            </div>
          ) : (
            <>
              <AnalyticsKpiCards cur={kpis} prev={prevKpis} />
              <AnalyticsTimeChart series={series} />
              {/* Journal détaillé : qui a vu quelle page et quand (élément principal). */}
              <AnalyticsRecent events={events} />
              {/* Carte du monde des connexions, par ville. */}
              <Suspense fallback={<div className="bg-surface rounded-lg h-48 animate-pulse" />}>
                <AnalyticsWorldMap events={events} selectedCountry={country} onSelectCountry={setCountry} />
              </Suspense>
              {/* Synthèses : grille sur 5 colonnes (xl) — le panneau « Pays » en occupe 2. */}
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-3 items-start">
                <AnalyticsTopLists events={events} selectedCountry={country} onSelectCountry={setCountry} />
                <AnalyticsUsers events={events} />
              </div>
              {/* Attribution requise par la licence CC BY 4.0 de la base de géolocalisation. */}
              <div className="text-white/25 text-[10px] pt-1">
                Géolocalisation IP par{' '}
                <a href="https://db-ip.com" target="_blank" rel="noopener noreferrer" className="underline hover:text-white/40">
                  DB-IP
                </a>
                {' '}(CC BY 4.0)
              </div>
            </>
          )}
        </>
      )}
    </div>
  )
}
