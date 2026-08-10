// functions/src/priceWatch/opsIncidents.ts
// Jumeau SERVEUR du journal des incidents — src/features/priceWatch/ops/incidents.ts.
// Le serveur ÉCRIT seul (il ne lit jamais ce journal, relu uniquement par l'écran
// « Suivi » côté navigateur) : recordIncident consigne, rien d'autre.
import { getFirestore } from 'firebase-admin/firestore'
import { opsIncidentsCol } from './paths'

/** Une panne — mêmes champs que WatchIncident (src/features/priceWatch/ops/opsTypes.ts),
 *  redéfinis ici : le serveur ne peut pas importer depuis src/ (functions/tsconfig.json a
 *  rootDir: "src", mur de compilation entre les deux SDK Firestore). */
export interface WatchIncident {
  ts: number
  /** Domaine du concurrent en cause, quand l'incident en désigne un. */
  domain?: string
  /** Carte du flux qui a signalé la panne. */
  nodeLabel?: string
  message: string
  runId?: string
  origin: 'client' | 'server'
}

/** Consigne une panne. Fire-and-forget : jamais bloquant pour le run. */
export async function recordIncident(uid: string, watchId: string, incident: WatchIncident): Promise<void> {
  try {
    await getFirestore()
      .collection(opsIncidentsCol(uid, watchId))
      .add({ ...incident, message: incident.message.slice(0, 600) })
  } catch (e) {
    console.warn('[suivi] incident non consigné :', e)
  }
}
