import { Fragment, useMemo, useState } from 'react'
import { ChevronDown, ChevronLeft, ChevronRight, Users, List } from 'lucide-react'
import type { AnalyticsEvent } from '../metrics'
import { recentEvents, pageLabel, countryName } from '../metrics'
import { useUsersMap } from '../useUsersMap'
import { t } from '@/lib/i18n'

const PAGE_SIZE = 15
const DEVICE_FR: Record<string, string> = { desktop: 'Ordinateur', mobile: 'Mobile', tablet: 'Tablette' }
const ANON = '__anon__'
type Opt = { value: string; label: string }
type Filters = { user: string; page: string; device: string; country: string; day: string }
const NONE: Filters = { user: 'all', page: 'all', device: 'all', country: 'all', day: 'all' }

const dayOf = (ts: number) => new Date(ts).toLocaleDateString('fr-FR')
const deviceDetail = (e: AnalyticsEvent): string => [e.os, e.browser].filter(Boolean).join(' · ')
/** Lieu lisible : « Ville, Pays » (nom en clair) ou ce qui est connu (« — » si rien). */
const placeOf = (e: AnalyticsEvent): string => [e.city, countryName(e.country)].filter(Boolean).join(', ') || '—'
const when = (ts: number) => new Date(ts).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })
const relDay = (ts: number) => new Date(ts).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })

const TH = 'font-medium text-left py-2 px-2 border-b border-white/10'
const TD = 'py-1.5 px-2 border-b border-white/5'

function ColFilter({ value, onChange, options, allLabel }: { value: string; onChange: (v: string) => void; options: Opt[]; allLabel: string }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} className="w-full max-w-[170px] bg-surface-2 text-white/70 rounded px-1.5 py-1 border border-white/10 text-[11px]">
      <option value="all">{allLabel}</option>
      {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  )
}

interface Group { key: string; label: string; isNamed: boolean; events: AnalyticsEvent[]; lastTs: number }

/** Regroupe les consultations par utilisateur (un bloc par uid nommé + « Anonyme »). */
function groupByUser(events: AnalyticsEvent[], userName: (uid: string | null) => string): Group[] {
  const map = new Map<string, AnalyticsEvent[]>()
  for (const e of events) {
    const key = e.uid ?? ANON
    const arr = map.get(key)
    if (arr) arr.push(e); else map.set(key, [e])
  }
  return [...map.entries()]
    .map(([key, evs]): Group => ({ key, label: key === ANON ? 'Anonyme' : userName(key), isNamed: key !== ANON, events: evs, lastTs: evs[0]?.ts ?? 0 }))
    .sort((a, b) => Number(b.isNamed) - Number(a.isNamed) || b.lastTs - a.lastTs)
}

function EventRow({ e, showUser, userName }: { e: AnalyticsEvent; showUser: boolean; userName: (uid: string | null) => string }) {
  const detail = deviceDetail(e)
  return (
    <tr className="hover:bg-white/[0.03]">
      <td className={`${TD} truncate max-w-[180px] ${e.uid ? 'text-white/80' : 'text-white/35 italic'}`} title={e.uid ?? 'Visiteur anonyme'}>{showUser ? userName(e.uid) : ''}</td>
      <td className={`${TD} text-white/70 truncate max-w-[240px]`} title={e.path}>{pageLabel(e.path)}</td>
      <td className={`${TD} text-white/55`} title={detail || undefined}>
        <span>{DEVICE_FR[e.device] ?? e.device}</span>
        {detail && <span className="block text-white/35 text-[10px] leading-tight">{detail}</span>}
      </td>
      <td className={`${TD} text-white/55`}>{placeOf(e)}</td>
      <td className={`${TD} text-white/55 text-right whitespace-nowrap tabular-nums`}>{when(e.ts)}</td>
    </tr>
  )
}

const GROUP_PAGE = 8
const ANON_COUNTRY_CAP = 6

interface CountrySub { code: string; label: string; events: AnalyticsEvent[]; lastTs: number }

/** Sous-groupe les événements par pays (pays triés par nombre de consultations). */
function groupByCountry(events: AnalyticsEvent[]): CountrySub[] {
  const map = new Map<string, AnalyticsEvent[]>()
  for (const e of events) {
    const code = e.country ?? '__none__'
    const arr = map.get(code)
    if (arr) arr.push(e); else map.set(code, [e])
  }
  return [...map.entries()]
    .map(([code, evs]): CountrySub => ({ code, label: (code === '__none__' ? null : countryName(code)) ?? '—', events: evs, lastTs: evs[0]?.ts ?? 0 }))
    .sort((a, b) => b.events.length - a.events.length || b.lastTs - a.lastTs)
}

/** Bloc « Anonyme » : consultations sous-groupées par pays (chaque pays repliable). */
function AnonGroupSection({ g, userName }: { g: Group; userName: (uid: string | null) => string }) {
  const [open, setOpen] = useState<Set<string>>(() => new Set())
  const [collapsed, setCollapsed] = useState(false)
  const byCountry = useMemo(() => groupByCountry(g.events), [g.events])
  const toggle = (code: string) => setOpen((s) => { const n = new Set(s); if (n.has(code)) n.delete(code); else n.add(code); return n })
  return (
    <Fragment>
      <tr className="bg-white/[0.03] cursor-pointer select-none hover:bg-white/[0.05]" onClick={() => setCollapsed((v) => !v)}>
        <td colSpan={5} className="px-2 py-1.5 border-b border-white/10">
          <div className="flex items-center gap-1.5">
            <ChevronDown className={`w-3.5 h-3.5 text-white/40 shrink-0 transition-transform ${collapsed ? '-rotate-90' : ''}`} />
            <span className="text-white/45 italic">{g.label}</span>
            <span className="text-white/35">{g.events.length} consultation{g.events.length > 1 ? 's' : ''} · {byCountry.length} pays · dernière {relDay(g.lastTs)}</span>
          </div>
        </td>
      </tr>
      {!collapsed && byCountry.map((c) => {
        const isOpen = open.has(c.code)
        const slice = isOpen ? c.events : c.events.slice(0, ANON_COUNTRY_CAP)
        const hasMore = c.events.length > ANON_COUNTRY_CAP
        return (
          <Fragment key={c.code}>
            <tr className="bg-white/[0.015]">
              <td colSpan={5} className="pl-6 pr-2 py-1 border-b border-white/5">
                <span className="text-white/60 text-[11px] font-medium">{c.label}</span>
                <span className="text-white/30 text-[11px] ml-2">{c.events.length} · dernière {relDay(c.lastTs)}</span>
              </td>
            </tr>
            {slice.map((e, i) => <EventRow key={`${g.key}-${c.code}-${e.vid}-${e.ts}-${i}`} e={e} showUser={false} userName={userName} />)}
            {hasMore && (
              <tr>
                <td colSpan={5} className="pl-6 pr-2 py-1 border-b border-white/5">
                  <button type="button" onClick={() => toggle(c.code)} className="text-white/40 hover:text-white/70 text-[11px] transition-colors">
                    {isOpen ? 'Réduire' : `+${c.events.length - ANON_COUNTRY_CAP} autre${c.events.length - ANON_COUNTRY_CAP > 1 ? 's' : ''} à ${c.label}`}
                  </button>
                </td>
              </tr>
            )}
          </Fragment>
        )
      })}
    </Fragment>
  )
}

/** Bloc d'un utilisateur dans le journal groupé : en-tête + ses consultations paginées. */
function GroupSection({ g, userName }: { g: Group; userName: (uid: string | null) => string }) {
  const [gp, setGp] = useState(0)
  const [collapsed, setCollapsed] = useState(false)
  const pages = Math.max(1, Math.ceil(g.events.length / GROUP_PAGE))
  const cur = Math.min(gp, pages - 1)
  const slice = g.events.slice(cur * GROUP_PAGE, cur * GROUP_PAGE + GROUP_PAGE)
  return (
    <Fragment>
      <tr className="bg-white/[0.03] cursor-pointer select-none hover:bg-white/[0.05]" onClick={() => setCollapsed((v) => !v)}>
        <td colSpan={5} className="px-2 py-1.5 border-b border-white/10">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-1.5">
              <ChevronDown className={`w-3.5 h-3.5 text-white/40 shrink-0 transition-transform ${collapsed ? '-rotate-90' : ''}`} />
              <span className={g.isNamed ? 'text-white/85 font-medium' : 'text-white/45 italic'}>{g.label}</span>
              <span className="text-white/35">{g.events.length} consultation{g.events.length > 1 ? 's' : ''} · dernière {relDay(g.lastTs)}</span>
            </div>
            {!collapsed && pages > 1 && (
              <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                <button type="button" onClick={() => setGp(Math.max(0, cur - 1))} disabled={cur === 0} aria-label={t('an.prevPage')} className="p-0.5 rounded text-white/50 hover:text-white hover:bg-white/10 disabled:opacity-30 transition-colors"><ChevronLeft className="w-3.5 h-3.5" /></button>
                <span className="text-white/40 text-[11px] tabular-nums">{cur + 1}/{pages}</span>
                <button type="button" onClick={() => setGp(Math.min(pages - 1, cur + 1))} disabled={cur >= pages - 1} aria-label="Page suivante" className="p-0.5 rounded text-white/50 hover:text-white hover:bg-white/10 disabled:opacity-30 transition-colors"><ChevronRight className="w-3.5 h-3.5" /></button>
              </div>
            )}
          </div>
        </td>
      </tr>
      {!collapsed && slice.map((e, i) => <EventRow key={`${g.key}-${e.vid}-${e.ts}-${i}`} e={e} showUser={false} userName={userName} />)}
    </Fragment>
  )
}

/** Journal de consultation : qui a vu quelle page et quand — filtres par colonne + regroupement par utilisateur. */
export function AnalyticsRecent({ events }: { events: AnalyticsEvent[] }) {
  const usersMap = useUsersMap()
  const userName = (uid: string | null): string => (uid ? usersMap.get(uid) ?? uid : 'Anonyme')
  const [f, setF] = useState<Filters>(NONE)
  const [page, setPage] = useState(0)
  const [grouped, setGrouped] = useState(true)
  const set = (k: keyof Filters, v: string) => { setF((p) => ({ ...p, [k]: v })); setPage(0) }

  const sorted = useMemo(() => recentEvents(events, events.length), [events])
  const opts = useMemo(() => {
    const users = new Map<string, true>(); const pages = new Set<string>(); const countries = new Set<string>(); const days = new Map<string, true>()
    let anon = false; let noCountry = false
    for (const e of sorted) {
      if (e.uid) users.set(e.uid, true); else anon = true
      pages.add(pageLabel(e.path))
      if (e.country) countries.add(e.country); else noCountry = true
      days.set(dayOf(e.ts), true)
    }
    return {
      users: [...[...users.keys()].map((uid) => ({ value: uid, label: userName(uid) })).sort((a, b) => a.label.localeCompare(b.label)), ...(anon ? [{ value: ANON, label: 'Anonyme' }] : [])],
      pages: [...pages].sort((a, b) => a.localeCompare(b)).map((p) => ({ value: p, label: p })),
      devices: [...new Set(sorted.map((e) => e.device))].map((d) => ({ value: d, label: DEVICE_FR[d] ?? d })),
      countries: [...[...countries].sort().map((c) => ({ value: c, label: countryName(c) ?? c })), ...(noCountry ? [{ value: '__none__', label: '—' }] : [])],
      days: [...days.keys()].map((d) => ({ value: d, label: d })),
    }
  }, [sorted, usersMap])

  const filtered = useMemo(() => sorted.filter((e) =>
    (f.user === 'all' || (f.user === ANON ? !e.uid : e.uid === f.user)) &&
    (f.page === 'all' || pageLabel(e.path) === f.page) &&
    (f.device === 'all' || e.device === f.device) &&
    (f.country === 'all' || (f.country === '__none__' ? !e.country : e.country === f.country)) &&
    (f.day === 'all' || dayOf(e.ts) === f.day),
  ), [sorted, f])

  const groups = useMemo(() => (grouped ? groupByUser(filtered, userName) : []), [grouped, filtered, usersMap])
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const current = Math.min(page, pageCount - 1)
  const slice = filtered.slice(current * PAGE_SIZE, current * PAGE_SIZE + PAGE_SIZE)

  return (
    <div className="bg-surface rounded-lg p-4">
      <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
        <div className="text-white/70 text-sm font-medium">
          Journal de consultation
          <span className="text-white/35 font-normal ml-2">qui · quand · quelle page — {filtered.length.toLocaleString('fr-FR')} consultations</span>
        </div>
        <div className="flex items-center gap-1.5">
          <button type="button" onClick={() => setGrouped((v) => !v)} className="flex items-center gap-1.5 px-2 py-1 rounded text-xs text-white/60 hover:text-white bg-surface-2" title={grouped ? 'Afficher en liste chronologique' : 'Grouper par utilisateur'}>
            {grouped ? <><List className="w-3.5 h-3.5" /> Liste</> : <><Users className="w-3.5 h-3.5" /> Grouper</>}
          </button>
          {!grouped && pageCount > 1 && (
            <>
              <button type="button" onClick={() => setPage(Math.max(0, current - 1))} disabled={current === 0} aria-label={t('an.prevPage')} className="p-1 rounded text-white/60 hover:text-white hover:bg-white/10 disabled:opacity-30 transition-colors"><ChevronLeft className="w-4 h-4" /></button>
              <span className="text-white/40 text-xs tabular-nums">{current + 1} / {pageCount}</span>
              <button type="button" onClick={() => setPage(Math.min(pageCount - 1, current + 1))} disabled={current >= pageCount - 1} aria-label="Page suivante" className="p-1 rounded text-white/60 hover:text-white hover:bg-white/10 disabled:opacity-30 transition-colors"><ChevronRight className="w-4 h-4" /></button>
            </>
          )}
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="text-white/40">
              <th className={TH}>Utilisateur</th><th className={TH}>Page</th><th className={TH}>Appareil</th><th className={TH}>Lieu</th><th className={`${TH} text-right whitespace-nowrap`}>Date &amp; heure</th>
            </tr>
            <tr>
              <th className="px-2 pb-2 pt-1 align-top text-left"><ColFilter value={f.user} onChange={(v) => set('user', v)} options={opts.users} allLabel="Tous" /></th>
              <th className="px-2 pb-2 pt-1 align-top text-left"><ColFilter value={f.page} onChange={(v) => set('page', v)} options={opts.pages} allLabel="Toutes" /></th>
              <th className="px-2 pb-2 pt-1 align-top text-left"><ColFilter value={f.device} onChange={(v) => set('device', v)} options={opts.devices} allLabel="Tous" /></th>
              <th className="px-2 pb-2 pt-1 align-top text-left"><ColFilter value={f.country} onChange={(v) => set('country', v)} options={opts.countries} allLabel="Tous" /></th>
              <th className="px-2 pb-2 pt-1 align-top text-right"><ColFilter value={f.day} onChange={(v) => set('day', v)} options={opts.days} allLabel="Tous les jours" /></th>
            </tr>
          </thead>
          <tbody>
            {grouped
              ? groups.map((g) => (g.isNamed
                  ? <GroupSection key={g.key} g={g} userName={userName} />
                  : <AnonGroupSection key={g.key} g={g} userName={userName} />))
              : slice.map((e, i) => <EventRow key={`${e.vid}-${e.ts}-${i}`} e={e} showUser userName={userName} />)}
          </tbody>
        </table>
        {filtered.length === 0 && <div className="text-white/30 text-xs py-3">Aucune consultation pour ces filtres.</div>}
      </div>
    </div>
  )
}
