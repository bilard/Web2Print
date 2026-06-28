// src/features/analytics/admin/AnalyticsRecent.tsx
import { useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import type { AnalyticsEvent } from '../metrics'
import { recentEvents, pageLabel, isInternalActivity } from '../metrics'
import { useUsersMap } from '../useUsersMap'

const PAGE_SIZE = 15
const DEVICE_FR: Record<string, string> = { desktop: 'Ordinateur', mobile: 'Mobile', tablet: 'Tablette' }
type Opt = { value: string; label: string }
type Filters = { user: string; page: string; device: string; country: string; day: string }
const NONE: Filters = { user: 'all', page: 'all', device: 'all', country: 'all', day: 'all' }

const dayOf = (ts: number) => new Date(ts).toLocaleDateString('fr-FR')
/** Clé d'identité stable : uid si connecté, sinon l'identifiant de visiteur anonyme. */
const idKey = (e: AnalyticsEvent) => e.uid ?? `v:${e.vid}`

/** Menu déroulant de filtre pour un en-tête de colonne. */
function ColFilter({ value, onChange, options, allLabel }: { value: string; onChange: (v: string) => void; options: Opt[]; allLabel: string }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full max-w-[170px] bg-surface-2 text-white/70 rounded px-1.5 py-1 border border-white/10 text-[11px]"
    >
      <option value="all">{allLabel}</option>
      {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  )
}

/** Journal de consultation : qui a vu quelle page et quand, avec un filtre par colonne. */
export function AnalyticsRecent({ events }: { events: AnalyticsEvent[] }) {
  const usersMap = useUsersMap()
  const [f, setF] = useState<Filters>(NONE)
  const [page, setPage] = useState(0)
  const set = (k: keyof Filters, v: string) => { setF((p) => ({ ...p, [k]: v })); setPage(0) }

  // Tri par récence, hors navigation interne (tableau de bord / workflows / accueil).
  const sorted = useMemo(
    () => recentEvents(events, events.length).filter((e) => !isInternalActivity(e.path)),
    [events],
  )

  // Numéro lisible par visiteur anonyme (vid → 1, 2, 3…), du plus récent au plus ancien.
  const visitorNum = useMemo(() => {
    const m = new Map<string, number>()
    for (const e of sorted) if (!e.uid && !m.has(e.vid)) m.set(e.vid, m.size + 1)
    return m
  }, [sorted])
  const personLabel = (e: AnalyticsEvent) => e.uid ? (usersMap.get(e.uid) ?? e.uid) : `Visiteur ${visitorNum.get(e.vid) ?? '?'}`

  // Options de chaque colonne (valeurs réellement présentes).
  const opts = useMemo(() => {
    const people = new Map<string, { label: string; named: boolean; num: number }>(); const pages = new Set<string>()
    const countries = new Set<string>(); const days = new Map<string, true>()
    let noCountry = false
    for (const e of sorted) {
      const k = idKey(e)
      if (!people.has(k)) people.set(k, { label: personLabel(e), named: !!e.uid, num: e.uid ? 0 : (visitorNum.get(e.vid) ?? 0) })
      pages.add(pageLabel(e.path))
      if (e.country) countries.add(e.country); else noCountry = true
      days.set(dayOf(e.ts), true) // sorted = récent→ancien ⇒ ordre déjà chronologique inversé
    }
    return {
      // Utilisateurs connectés d'abord (par nom), puis les visiteurs anonymes par numéro.
      users: [...people].sort((a, b) => (Number(b[1].named) - Number(a[1].named)) || (a[1].named ? a[1].label.localeCompare(b[1].label) : a[1].num - b[1].num)).map(([value, info]) => ({ value, label: info.label })),
      pages: [...pages].sort((a, b) => a.localeCompare(b)).map((p) => ({ value: p, label: p })),
      devices: [...new Set(sorted.map((e) => e.device))].map((d) => ({ value: d, label: DEVICE_FR[d] ?? d })),
      countries: [...[...countries].sort().map((c) => ({ value: c, label: c })), ...(noCountry ? [{ value: '__none__', label: '—' }] : [])],
      days: [...days.keys()].map((d) => ({ value: d, label: d })),
    }
  }, [sorted, usersMap, visitorNum])

  const filtered = useMemo(() => sorted.filter((e) =>
    (f.user === 'all' || idKey(e) === f.user) &&
    (f.page === 'all' || pageLabel(e.path) === f.page) &&
    (f.device === 'all' || e.device === f.device) &&
    (f.country === 'all' || (f.country === '__none__' ? !e.country : e.country === f.country)) &&
    (f.day === 'all' || dayOf(e.ts) === f.day),
  ), [sorted, f])

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const current = Math.min(page, pageCount - 1)
  const slice = filtered.slice(current * PAGE_SIZE, current * PAGE_SIZE + PAGE_SIZE)

  const when = (ts: number) => new Date(ts).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })
  const TH = 'font-medium text-left py-2 px-2 border-b border-white/10'
  const TD = 'py-1.5 px-2 border-b border-white/5'

  return (
    <div className="bg-surface rounded-lg p-4">
      <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
        <div className="text-white/70 text-sm font-medium">
          Journal de consultation
          <span className="text-white/35 font-normal ml-2">qui · quand · quelle page — {filtered.length.toLocaleString('fr-FR')} consultations</span>
        </div>
        {pageCount > 1 && (
          <div className="flex items-center gap-1.5">
            <button type="button" onClick={() => setPage(Math.max(0, current - 1))} disabled={current === 0} aria-label="Page précédente" className="p-1 rounded text-white/60 hover:text-white hover:bg-white/10 disabled:opacity-30 disabled:hover:bg-transparent transition-colors"><ChevronLeft className="w-4 h-4" /></button>
            <span className="text-white/40 text-xs tabular-nums">{current + 1} / {pageCount}</span>
            <button type="button" onClick={() => setPage(Math.min(pageCount - 1, current + 1))} disabled={current >= pageCount - 1} aria-label="Page suivante" className="p-1 rounded text-white/60 hover:text-white hover:bg-white/10 disabled:opacity-30 disabled:hover:bg-transparent transition-colors"><ChevronRight className="w-4 h-4" /></button>
          </div>
        )}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="text-white/40">
              <th className={TH}>Utilisateur</th>
              <th className={TH}>Page</th>
              <th className={TH}>Appareil</th>
              <th className={TH}>Pays</th>
              <th className={`${TH} text-right whitespace-nowrap`}>Date &amp; heure</th>
            </tr>
            <tr>
              <th className="p-1 align-top"><ColFilter value={f.user} onChange={(v) => set('user', v)} options={opts.users} allLabel="Tous" /></th>
              <th className="p-1 align-top"><ColFilter value={f.page} onChange={(v) => set('page', v)} options={opts.pages} allLabel="Toutes" /></th>
              <th className="p-1 align-top"><ColFilter value={f.device} onChange={(v) => set('device', v)} options={opts.devices} allLabel="Tous" /></th>
              <th className="p-1 align-top"><ColFilter value={f.country} onChange={(v) => set('country', v)} options={opts.countries} allLabel="Tous" /></th>
              <th className="p-1 align-top"><ColFilter value={f.day} onChange={(v) => set('day', v)} options={opts.days} allLabel="Tous les jours" /></th>
            </tr>
          </thead>
          <tbody>
            {slice.map((e, i) => (
              <tr key={`${e.vid}-${e.ts}-${i}`} className="hover:bg-white/[0.03]">
                <td className={`${TD} truncate max-w-[200px] ${e.uid ? 'text-white/85' : 'text-white/40 italic'}`} title={e.uid ?? e.vid}>{personLabel(e)}</td>
                <td className={`${TD} text-white/70 truncate max-w-[220px]`} title={e.path}>{pageLabel(e.path)}</td>
                <td className={`${TD} text-white/55`}>{DEVICE_FR[e.device] ?? e.device}</td>
                <td className={`${TD} text-white/55`}>{e.country ?? '—'}</td>
                <td className={`${TD} text-white/55 text-right whitespace-nowrap tabular-nums`}>{when(e.ts)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && (
          <div className="text-white/30 text-xs py-3">Aucune consultation pour ces filtres.</div>
        )}
      </div>
    </div>
  )
}
