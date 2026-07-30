import { lazy, Suspense, useMemo, useState } from 'react'
import { Download, Trash2, Bell, BellOff, FilterX } from 'lucide-react'
import { toast } from 'sonner'
import { useAnalyticsEvents } from '../useAnalyticsEvents'
import { usePeriod, type PeriodKey } from '../usePeriod'
import { computeKpis, timeSeries, filterEvents, NO_FILTER, type EventFilter } from '../metrics'
import { downloadEventsCsv } from '../exportCsv'
import { useClearAnalytics, useDeleteFilteredAnalytics } from '../useClearAnalytics'
import { useSessionAlerts } from '../useSessionAlerts'
import { ConfirmDeleteDialog } from './ConfirmDeleteDialog'
import { AnalyticsKpiCards } from './AnalyticsKpiCards'
import { AnalyticsTimeChart } from './AnalyticsTimeChart'
import { AnalyticsTopLists } from './AnalyticsTopLists'
import { AnalyticsRecent } from './AnalyticsRecent'
import { AnalyticsLiveFeed } from './AnalyticsLiveFeed'

// Chargée à part : le fond de carte (Natural Earth 50m, ~500 Ko) ne doit pas peser sur le bundle principal.
const AnalyticsWorldMap = lazy(() =>
  import('./AnalyticsWorldMap').then((m) => ({ default: m.AnalyticsWorldMap })),
)
import { AnalyticsUsers } from './AnalyticsUsers'
import { AnalyticsFilters } from './AnalyticsFilters'
import { t } from '@/lib/i18n'

const PERIODS: { key: PeriodKey; label: string }[] = [
  { key: 'today', label: "Aujourd'hui" },
  { key: '7d', label: '7 j' },
  { key: '30d', label: '30 j' },
  { key: '90d', label: '90 j' },
  { key: '12m', label: '12 mois' },
  { key: 'custom', label: 'Perso' },
]

export function AnalyticsTab() {
  const { period, setPeriod, customFrom, setCustomFrom, customTo, setCustomTo, fromMs, toMs, prevFromMs, prevToMs, isLive } = usePeriod('90d')
  // Jour local « YYYY-MM-DD » (sv-SE ⇒ format ISO en heure locale, pas UTC) pour la borne max des sélecteurs.
  const today = new Date().toLocaleDateString('sv-SE')
  const [filter, setFilter] = useState<EventFilter>(NO_FILTER)
  // Pays sélectionné dans la carte « Pays » → mis en évidence sur la carte du monde.
  const [country, setCountry] = useState<string | null>(null)
  const [confirmClear, setConfirmClear] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const clear = useClearAnalytics()
  const sessionAlerts = useSessionAlerts()
  const deleteFiltered = useDeleteFilteredAnalytics()
  const handleClear = () => {
    clear.mutate(undefined, {
      onSuccess: (deleted) => {
        setConfirmClear(false)
        toast.success(`Historique vidé — ${deleted.toLocaleString('fr-FR')} consultation(s) supprimée(s).`)
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
  const handleDeleteFiltered = () => {
    const ids = events.map((e) => e.id).filter((id): id is string => !!id)
    deleteFiltered.mutate(ids, {
      onSuccess: (deleted) => {
        setConfirmDelete(false)
        toast.success(`Résultat supprimé — ${deleted.toLocaleString('fr-FR')} consultation(s).`)
      },
      onError: (e) => toast.error(`Échec : ${e instanceof Error ? e.message : 'erreur inconnue'}`),
    })
  }
  const kpis = useMemo(() => computeKpis(events), [events])
  const prevKpis = useMemo(() => computeKpis(filterEvents(prev.data ?? [], filter)), [prev.data, filter])
  // « Aujourd'hui » : courbe par heure (une seule journée ⇒ un point unique en granularité jour).
  const hourly = period === 'today'
  const series = useMemo(() => timeSeries(events, fromMs, toMs, hourly), [events, fromMs, toMs, hourly])

  const loading = cur.isLoading || prev.isLoading
  const noData = !loading && allEvents.length === 0
  const noFiltered = !loading && !noData && events.length === 0

  return (
    <div className="space-y-4">
      {/* Bandeau de contrôle épinglé en haut de la zone défilante : période + filtres + KPI
          restent visibles pendant qu'on fait défiler graphe, journal, carte… */}
      <div className="sticky top-0 z-20 -mx-1 px-1 pt-0.5 pb-3 bg-background space-y-3 border-b border-white/[0.06]">
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
            onClick={async () => {
              const next = await sessionAlerts.toggle()
              if (next === null) return
              toast.success(next ? 'Alertes Telegram de visite activées' : 'Alertes Telegram de visite coupées')
            }}
            disabled={sessionAlerts.enabled === null}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-sm bg-surface-2 transition-colors ${
              sessionAlerts.enabled ? 'text-emerald-400 hover:text-emerald-300' : 'text-white/50 hover:text-white/80'
            }`}
            title="Log live sur Telegram : 🟢 une ligne par page d'un utilisateur connecté, 🔵 un ping par session anonyme (vos propres visites ne sont jamais notifiées)"
          >
            {sessionAlerts.enabled ? <Bell className="w-4 h-4" /> : <BellOff className="w-4 h-4" />}
            Alertes Telegram
          </button>
          <button
            onClick={() => downloadEventsCsv(events, `analytics-${period}.csv`)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded text-sm text-white/70 hover:text-white bg-surface-2"
          >
            <Download className="w-4 h-4" /> CSV
          </button>
          <button
            onClick={() => setConfirmDelete(true)}
            disabled={events.length === 0}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded text-sm text-red-400/80 hover:text-red-300 bg-surface-2 hover:bg-red-500/10 disabled:opacity-40 disabled:pointer-events-none"
            title={t('an.purgeFiltered')}
          >
            <FilterX className="w-4 h-4" /> Supprimer le résultat
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
      {!loading && !noData && (
        <AnalyticsFilters events={allEvents} filter={filter} onChange={setFilter} />
      )}
      {!loading && !noData && !noFiltered && (
        <AnalyticsKpiCards cur={kpis} prev={prevKpis} />
      )}
      </div>

      <ConfirmDeleteDialog
        open={confirmClear}
        onOpenChange={setConfirmClear}
        title="Vider tout l'historique ?"
        description={<>
          Cette action supprime <strong>définitivement toutes les consultations</strong> enregistrées
          (toutes périodes confondues), pas seulement celles affichées. Elle est irréversible.
        </>}
        actionLabel="Vider définitivement"
        pending={clear.isPending}
        onConfirm={handleClear}
      />

      <ConfirmDeleteDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={t('an.purgeConfirm')}
        description={<>
          Supprime <strong>définitivement les {events.length.toLocaleString('fr-FR')} consultation(s)</strong> correspondant
          à la période et aux filtres affichés (zone, appareil, pays, page, source, utilisateur).
          Le reste de l'historique n'est pas touché. Action irréversible.
        </>}
        actionLabel="Supprimer le résultat"
        pending={deleteFiltered.isPending}
        onConfirm={handleDeleteFiltered}
      />
      {loading ? (
        <div className="text-white/40 text-sm py-12 text-center">Chargement…</div>
      ) : noData ? (
        <div className="text-white/40 text-sm py-12 text-center">
          Aucune donnée de trafic sur cette période.
        </div>
      ) : noFiltered ? (
        <div className="text-white/40 text-sm py-12 text-center">
          Aucune donnée pour ces filtres.
        </div>
      ) : (
        <>
          <AnalyticsTimeChart series={series} />
          {/* Trafic en direct (onSnapshot) — le même flux que les alertes Telegram. */}
          <AnalyticsLiveFeed />
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
    </div>
  )
}
