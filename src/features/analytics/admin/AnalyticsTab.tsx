// src/features/analytics/admin/AnalyticsTab.tsx
import { useMemo, useState } from 'react'
import { Download, Trash2, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { useAnalyticsEvents } from '../useAnalyticsEvents'
import { usePeriod, type PeriodKey } from '../usePeriod'
import { computeKpis, timeSeries, filterEvents, NO_FILTER, type EventFilter } from '../metrics'
import { downloadEventsCsv } from '../exportCsv'
import { useClearAnalytics } from '../useClearAnalytics'
import { AnalyticsKpiCards } from './AnalyticsKpiCards'
import { AnalyticsTimeChart } from './AnalyticsTimeChart'
import { AnalyticsTopLists } from './AnalyticsTopLists'
import { AnalyticsRecent } from './AnalyticsRecent'
import { AnalyticsUsers } from './AnalyticsUsers'
import { AnalyticsFilters } from './AnalyticsFilters'

const PERIODS: { key: PeriodKey; label: string }[] = [
  { key: '7d', label: '7 j' },
  { key: '30d', label: '30 j' },
  { key: '90d', label: '90 j' },
  { key: '12m', label: '12 mois' },
]

export function AnalyticsTab() {
  const { period, setPeriod, fromMs, toMs, prevFromMs, prevToMs } = usePeriod('30d')
  const [filter, setFilter] = useState<EventFilter>(NO_FILTER)
  const [confirmClear, setConfirmClear] = useState(false)
  const clear = useClearAnalytics()
  const handleClear = () => {
    clear.mutate(undefined, {
      onSuccess: (deleted) => {
        setConfirmClear(false)
        toast.success(`Historique vidé — ${deleted.toLocaleString('fr-FR')} consultation(s) supprimée(s).`)
      },
      onError: (e) => toast.error(`Échec : ${e instanceof Error ? e.message : 'erreur inconnue'}`),
    })
  }
  // Période courante : borne haute ouverte (jusqu'à maintenant) pour inclure les visites en direct.
  const cur = useAnalyticsEvents(fromMs, null, true)
  const prev = useAnalyticsEvents(prevFromMs, prevToMs, true)
  const allEvents = cur.data ?? []
  const events = useMemo(() => filterEvents(allEvents, filter), [allEvents, filter])
  const kpis = useMemo(() => computeKpis(events), [events])
  const prevKpis = useMemo(() => computeKpis(filterEvents(prev.data ?? [], filter)), [prev.data, filter])
  const series = useMemo(() => timeSeries(events, fromMs, toMs), [events, fromMs, toMs])

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
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
        <div className="flex items-center gap-2">
          <button
            onClick={() => downloadEventsCsv(events, `analytics-${period}.csv`)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded text-sm text-white/70 hover:text-white bg-surface-2"
          >
            <Download className="w-4 h-4" /> CSV
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
              {/* Synthèses : 1 panneau par colonne, réparties sur toute la largeur. */}
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3 items-start">
                <AnalyticsTopLists events={events} />
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
