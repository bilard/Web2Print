// Journal des pannes du suivi — ce qui a cassé, quand, et pourquoi.
//
// ⚠ Séparé de l'historique des runs, élagué à vingt par flux : sur un flux horaire, un
// incident de mardi a disparu mercredi matin. C'est précisément celui qu'on cherche.
//
// ⚠ Consigner (`recordIncident`) et élaguer (`pruneIncidents`) n'ont PAS de jumeau ici :
// seul le SERVEUR écrit (`functions/src/priceWatch/opsIncidents.ts`, appelé depuis
// `appendRunLiveError`) — aucun run NAVIGATEUR ne consigne encore ses propres pannes. Ce
// module ne fait donc que LIRE (`watchIncidents`) et purger côté pur (`expiredIncidents`).
import { collection, limit, onSnapshot, orderBy, query } from 'firebase/firestore'
import { db } from '@/lib/firebase/config'
import { opsIncidentsCol } from '../paths'
import { OPS_INCIDENT_MAX_AGE_MS, type WatchIncident } from './opsTypes'

/** Identifiants des incidents périmés. PUR. */
export function expiredIncidents(list: { id: string; ts: number }[], now: number): string[] {
  return list.filter((i) => now - i.ts > OPS_INCIDENT_MAX_AGE_MS).map((i) => i.id)
}

/** Combien on en affiche, et donc combien on en lit. */
const INCIDENTS_PAGE = 50

/** Abonnement aux derniers incidents. */
export function watchIncidents(
  uid: string, watchId: string, onChange: (list: (WatchIncident & { id: string })[]) => void,
): () => void {
  return onSnapshot(
    query(collection(db, opsIncidentsCol(uid, watchId)), orderBy('ts', 'desc'), limit(INCIDENTS_PAGE)),
    (snap) => onChange(snap.docs.map((d) => ({ id: d.id, ...(d.data() as WatchIncident) }))),
    (e) => console.warn('[suivi] journal des incidents illisible :', e),
  )
}
