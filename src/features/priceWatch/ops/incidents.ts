// Journal des pannes du suivi — ce qui a cassé, quand, et pourquoi.
//
// ⚠ Séparé de l'historique des runs, élagué à vingt par flux : sur un flux horaire, un
// incident de mardi a disparu mercredi matin. C'est précisément celui qu'on cherche.
//
// ⚠ Deux écrivains : le SERVEUR (`functions/src/priceWatch/opsIncidents.ts`, appelé depuis
// `appendRunLiveError` sur un run qui plante entièrement) ET le NAVIGATEUR — `recordIncident`
// ici, appelé depuis l'exécuteur client (`runtime/executor.ts`) à chaque carte qui échoue
// dans un flux qui adresse un suivi. Sans lui, un run lancé depuis l'onglet ne laissait
// aucune trace de ses pannes alors que ce module existe précisément pour les rendre visibles.
import { addDoc, collection, deleteDoc, doc, getDocs, limit, onSnapshot, orderBy, query } from 'firebase/firestore'
import { db } from '@/lib/firebase/config'
import { opsIncidentsCol } from '../paths'
import { OPS_INCIDENT_MAX_AGE_MS, type WatchIncident } from './opsTypes'

/** Identifiants des incidents périmés. PUR. */
export function expiredIncidents(list: { id: string; ts: number }[], now: number): string[] {
  return list.filter((i) => now - i.ts > OPS_INCIDENT_MAX_AGE_MS).map((i) => i.id)
}

/**
 * Incidents qui viennent d'apparaître : absents de la liste précédente ET survenus
 * après `sinceTs`. PUR — sortie du hook exprès pour être testée isolément.
 *
 * ⚠ Le filtre sur `sinceTs` (le montage de l'écran) est ce qui évite la volée de
 * notifications à l'ouverture : la toute première comparaison part d'une liste
 * précédente VIDE, donc un journal de pannes vieilles de trois semaines passerait
 * entièrement pour « nouveau » sans lui.
 */
export function newIncidentsSince<T extends { id: string; ts: number }>(
  previous: T[], current: T[], sinceTs: number,
): T[] {
  const known = new Set(previous.map((i) => i.id))
  return current.filter((i) => !known.has(i.id) && i.ts > sinceTs)
}

/** Combien on en affiche, et donc combien on en lit. */
const INCIDENTS_PAGE = 50
/** Fenêtre scannée pour la purge à l'écriture — large mais bornée : jamais tout un
 *  historique dégénéré, seulement de quoi vider le backlog des plus vieux à chaque
 *  écriture jusqu'à retomber sous quatre-vingt-dix jours. */
const PRUNE_SCAN_LIMIT = 500

/** Supprime les incidents désignés. Best-effort par identifiant : l'échec d'un seul ne
 *  bloque pas les autres. */
async function deleteIncidents(uid: string, watchId: string, ids: string[]): Promise<void> {
  await Promise.all(ids.map((id) => deleteDoc(doc(db, opsIncidentsCol(uid, watchId), id)).catch(() => {})))
}

/** Élague les incidents périmés. Déclenchée à l'ÉCRITURE (`recordIncident`), JAMAIS à la
 *  lecture : un écran qui s'ouvre ne doit pas payer le nettoyage de celui qui regarde.
 *  Isolée dans son propre échec : une purge ratée ne remet jamais en cause l'incident qui
 *  vient d'être consigné. */
async function pruneExpiredIncidents(uid: string, watchId: string): Promise<void> {
  // ⚠ ASCENDANT, pas `desc` : les périmés sont les PLUS VIEUX. Scanner les plus récents
  // laisserait le vrai backlog hors fenêtre dès que le journal dépasse `PRUNE_SCAN_LIMIT`
  // entrées — la rétention s'arrêterait en silence, pile quand elle devient utile.
  const snap = await getDocs(
    query(collection(db, opsIncidentsCol(uid, watchId)), orderBy('ts', 'asc'), limit(PRUNE_SCAN_LIMIT)),
  )
  const ids = expiredIncidents(snap.docs.map((d) => ({ id: d.id, ts: (d.data() as WatchIncident).ts })), Date.now())
  if (ids.length > 0) await deleteIncidents(uid, watchId, ids)
}

/** Consigne une panne. Fire-and-forget ABSOLU : jamais bloquant, jamais lancé vers
 *  l'appelant — c'est le chemin d'exécution de TOUS les runs navigateur de l'app. */
export async function recordIncident(uid: string, watchId: string, incident: WatchIncident): Promise<void> {
  try {
    await addDoc(collection(db, opsIncidentsCol(uid, watchId)), {
      ...incident, message: incident.message.slice(0, 600),
    })
  } catch (e) {
    console.warn('[suivi] incident non consigné :', e)
    return
  }
  await pruneExpiredIncidents(uid, watchId).catch((e) => console.warn('[suivi] purge du journal échouée :', e))
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
