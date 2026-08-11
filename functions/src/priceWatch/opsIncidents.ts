// functions/src/priceWatch/opsIncidents.ts
// Jumeau SERVEUR du journal des incidents — src/features/priceWatch/ops/incidents.ts.
// Le serveur ÉCRIT seul (il ne lit jamais ce journal, relu uniquement par l'écran
// « Suivi » côté navigateur) : recordIncident consigne, et purge à l'écriture — rien d'autre.
//
// ⚠ `execute.ts` consigne désormais un incident par CARTE en erreur (pas seulement par run
// qui plante entièrement) : un cron horaire avec des sites qui échouent régulièrement peut
// écrire des dizaines d'incidents par jour. Sans purge, la rétention 90 jours rétablie côté
// navigateur (cf. commentaire de `pruneExpiredIncidents`) resterait lettre morte précisément
// dans le mode d'exécution principal en production. `pruneExpiredIncidents` est donc appelée
// une seule fois PAR RUN (pas par incident) depuis `execute.ts`, après la boucle de niveaux.
import { getFirestore } from 'firebase-admin/firestore'
import { opsIncidentsCol } from './paths'

/** Une panne — mêmes champs que WatchIncident (src/features/priceWatch/ops/opsTypes.ts),
 *  redéfinis ici : le serveur ne peut pas importer depuis src/ (functions/tsconfig.json a
 *  rootDir: "src", mur de compilation entre les deux SDK Firestore).
 *  ⚠ PAS de champ « domaine » : cf. le commentaire de WatchIncident côté navigateur. */
export interface WatchIncident {
  ts: number
  /** Carte du flux qui a signalé la panne. */
  nodeLabel?: string
  message: string
  runId?: string
  origin: 'client' | 'server'
}

/** Au-delà, un incident ne renseigne plus personne et encombre la collection — même seuil
 *  que côté navigateur (`OPS_INCIDENT_MAX_AGE_MS`), redéfini ici pour la même raison que
 *  `WatchIncident` : pas d'import depuis `src/`. */
const MAX_AGE_MS = 90 * 24 * 60 * 60 * 1000
/** Fenêtre scannée pour la purge — large mais bornée, jamais tout l'historique. */
const PRUNE_SCAN_LIMIT = 500

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

/** Élague les incidents périmés d'un suivi. Appelée une fois PAR RUN (pas par incident) —
 *  cf. commentaire d'en-tête. Isolée dans son propre échec : une purge ratée ne remet
 *  jamais en cause les incidents déjà consignés pendant ce run. */
export async function pruneExpiredIncidents(uid: string, watchId: string): Promise<void> {
  try {
    const now = Date.now()
    // ⚠ ASCENDANT, pas `desc` : les périmés sont les PLUS VIEUX — même piège que côté
    // navigateur (cf. `src/features/priceWatch/ops/incidents.ts`).
    const snap = await getFirestore()
      .collection(opsIncidentsCol(uid, watchId))
      .orderBy('ts', 'asc')
      .limit(PRUNE_SCAN_LIMIT)
      .get()
    const expired = snap.docs.filter((d) => now - (d.data() as WatchIncident).ts > MAX_AGE_MS)
    if (expired.length === 0) return
    await Promise.all(expired.map((d) => d.ref.delete().catch(() => {})))
  } catch (e) {
    console.warn('[suivi] purge du journal échouée :', e)
  }
}
