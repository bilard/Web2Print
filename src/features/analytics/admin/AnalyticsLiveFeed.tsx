// Fil LIVE des visites, au format du flux Telegram : 🟢 une ligne par page
// d'un utilisateur connecté, 🔵 arrivée d'un visiteur anonyme — lieu, page,
// heure. Temps réel (onSnapshot) ; vos propres visites sont exclues, comme
// sur Telegram (le propriétaire ne se suit pas lui-même).
import { Radio } from 'lucide-react'
import { auth } from '@/lib/firebase/config'
import { useLiveTraffic } from '../useLiveTraffic'
import { useUsersMap } from '../useUsersMap'

/** Drapeau emoji depuis un code pays ISO alpha-2 (même rendu que Telegram). */
function flagEmoji(cc: string | null): string {
  if (!cc || !/^[A-Za-z]{2}$/.test(cc)) return ''
  const up = cc.toUpperCase()
  return String.fromCodePoint(0x1f1e6 + up.charCodeAt(0) - 65, 0x1f1e6 + up.charCodeAt(1) - 65)
}

const timeFmt = new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit' })
const dateFmt = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short' })

export function AnalyticsLiveFeed() {
  const events = useLiveTraffic(30)
  const usersMap = useUsersMap()
  const myUid = auth.currentUser?.uid ?? null
  const feed = events.filter((e) => !myUid || e.uid !== myUid).slice(0, 20)

  return (
    <div className="rounded-xl border border-white/[0.06] bg-surface p-4">
      <div className="flex items-center gap-2 mb-3">
        <Radio className="w-4 h-4 text-emerald-400" aria-hidden="true" />
        <h3 className="text-sm font-semibold text-white/85">Trafic en direct</h3>
        <span className="relative flex w-2 h-2 ml-1">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-60" />
          <span className="relative inline-flex rounded-full w-2 h-2 bg-emerald-400" />
        </span>
        <span className="ml-auto text-[10px] text-white/35">le même flux que les alertes Telegram</span>
      </div>
      {feed.length === 0 ? (
        <p className="text-xs text-white/40">Aucune activité récente — les visites apparaîtront ici en temps réel.</p>
      ) : (
        <ul className="space-y-1.5 max-h-72 overflow-y-auto pr-1">
          {feed.map((e, i) => {
            const name = e.uid ? (usersMap.get(e.uid) ?? 'Utilisateur connecté') : 'Visiteur anonyme'
            const place = [e.city, e.country].filter(Boolean).join(', ')
            return (
              <li key={`${e.sid}_${e.ts}_${i}`} className="flex items-baseline gap-2 text-xs">
                <span className="shrink-0" aria-hidden="true">{e.uid ? '🟢' : '🔵'}</span>
                <span className={`shrink-0 font-medium ${e.uid ? 'text-white/85' : 'text-white/55'}`}>{name}</span>
                <span className="text-white/45 truncate">{e.area} · {e.path}</span>
                {place && <span className="shrink-0 text-white/40">{flagEmoji(e.country)} {place}</span>}
                <span className="ml-auto shrink-0 tabular-nums text-white/30">
                  {dateFmt.format(new Date(e.ts))} · {timeFmt.format(new Date(e.ts))}
                </span>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
