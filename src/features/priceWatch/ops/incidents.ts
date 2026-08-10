// Journal des pannes du suivi — ce qui a cassé, quand, et pourquoi.
//
// ⚠ Séparé de l'historique des runs, élagué à vingt par flux : sur un flux horaire, un
// incident de mardi a disparu mercredi matin. C'est précisément celui qu'on cherche.
import { addDoc, collection, deleteDoc, doc, limit, onSnapshot, orderBy, query } from 'firebase/firestore'
import { db } from '@/lib/firebase/config'
import { opsIncidentsCol } from '../paths'
import { OPS_INCIDENT_MAX_AGE_MS, type WatchIncident } from './opsTypes'

/** Identifiants des incidents périmés. PUR. */
export function expiredIncidents(list: { id: string; ts: number }[], now: number): string[] {
  return list.filter((i) => now - i.ts > OPS_INCIDENT_MAX_AGE_MS).map((i) => i.id)
}

/** Combien on en affiche, et donc combien on en lit. */
export const INCIDENTS_PAGE = 50

/** Consigne une panne. Fire-and-forget : jamais bloquant pour le run. */
export async function recordIncident(uid: string, watchId: string, incident: WatchIncident): Promise<void> {
  try {
    await addDoc(collection(db, opsIncidentsCol(uid, watchId)), {
      ...incident, message: incident.message.slice(0, 600),
    })
  } catch (e) {
    console.warn('[suivi] incident non consigné :', e)
  }
}

/** Supprime les incidents périmés. Appelé à l'écriture, jamais à la lecture. */
export async function pruneIncidents(uid: string, watchId: string, ids: string[]): Promise<void> {
  await Promise.all(ids.map((id) => deleteDoc(doc(db, opsIncidentsCol(uid, watchId), id)).catch(() => {})))
}

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
