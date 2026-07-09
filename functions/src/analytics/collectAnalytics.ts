// functions/src/analytics/collectAnalytics.ts
import { onRequest } from 'firebase-functions/v2/https'
import { getFirestore, FieldValue } from 'firebase-admin/firestore'
import { getApps, initializeApp } from 'firebase-admin/app'
import { buildEventDoc } from './derive'
import { clientIpFromHeaders, lookupGeo } from './geoip'
import { OWNER_EMAILS } from './owner'
import { maybeNotifyNewSession } from './notifySession'

if (!getApps().length) initializeApp()
const db = getFirestore()

// Compte OWNER exclu des stats (cf. owner.ts pour la liste et le raisonnement).
const EXCLUDED_EMAILS = OWNER_EMAILS

// Uids exclus mis en cache par instance : résolus une fois (requête `users`), puis
// mémoïsés tant qu'introuvables (retry), pour ne pas peser sur cet endpoint à haute
// fréquence.
let excludedUidsCache: Set<string> | null = null
async function resolveExcludedUids(): Promise<Set<string>> {
  if (excludedUidsCache && excludedUidsCache.size > 0) return excludedUidsCache
  try {
    const snap = await db.collection('users').where('email', 'in', EXCLUDED_EMAILS).get()
    excludedUidsCache = new Set(snap.docs.map((d) => d.id))
  } catch {
    excludedUidsCache = new Set()
  }
  return excludedUidsCache
}

export const collectAnalytics = onRequest(
  // 512 Mo : la base DB-IP (~124 Mo) est tenue en mémoire par instance (cf. geoip.ts).
  { region: 'europe-west1', maxInstances: 10, timeoutSeconds: 15, memory: '512MiB', cors: true },
  async (req, res) => {
    if (req.method !== 'POST') {
      res.status(405).end()
      return
    }
    // En-têtes géo edge (souvent vides derrière le rewrite Cloud Run).
    const hdrCountry =
      (req.headers['x-appengine-country'] as string | undefined) ??
      (req.headers['x-country-code'] as string | undefined) ??
      null
    const hdrCity =
      (req.headers['x-appengine-city'] as string | undefined) ??
      (req.headers['x-vercel-ip-city'] as string | undefined) ??
      null
    // Géolocalisation par IP (lue puis JETÉE, jamais stockée) en repli des en-têtes vides.
    const geo = await lookupGeo(clientIpFromHeaders(req.headers))
    const country = (hdrCountry && hdrCountry !== 'ZZ' ? hdrCountry : null) ?? geo?.country ?? null
    const city = hdrCity ?? geo?.city ?? null

    const doc = buildEventDoc(req.body, {
      ua: (req.headers['user-agent'] as string) ?? '',
      referer: req.headers['referer'] as string | undefined,
      country,
      city,
    })
    if (!doc) {
      res.status(204).end()
      return
    }
    // La PWA d'analytics « Pulse » (/pulse) est une console interne réservée au
    // propriétaire : on ne journalise JAMAIS ses consultations (ni Analytics, ni
    // Telegram). Sinon le propriétaire s'auto-notifie à chaque ouverture de son
    // propre tableau de bord — et au démarrage à froid de la PWA, la 1re page vue
    // part AVANT que Firebase restaure la session (donc « anonyme », échappant à
    // l'exclusion par uid/luid). Ce filtre par chemin est indépendant de l'auth.
    if (doc.path === '/pulse' || doc.path.startsWith('/pulse/')) {
      res.status(204).end()
      return
    }
    // `eid` (id stable côté client) : le beacon ré-envoie l'event d'entrée sous le même
    // eid pour y backfiller l'uid une fois l'auth résolue. On écrit en `set(merge)` sur ce
    // doc → un seul document (sinon double comptage des pages d'entrée d'app). Absent sur
    // les pages publiques / anciens beacons → `add()` classique.
    const rawEid = (req.body as { eid?: unknown } | null | undefined)?.eid
    const eid = typeof rawEid === 'string' && /^[A-Za-z0-9_-]{1,120}$/.test(rawEid) ? rawEid : null
    // Comptes exclus : on ne logue rien. Le beacon re-tague la page d'entrée (déjà
    // écrite en anonyme sous le même `eid` avant la résolution de l'auth) avec son
    // uid → on supprime alors ce doc pour ne laisser aucune trace de ses tests.
    // (Le re-tag est immédiat côté beacon depuis f7966e81 — plus de résidus anonymes.)
    // `luid` = dernier uid connu du navigateur (localStorage, posé par l'app) : les
    // pages publiques (landing `/`) n'ont pas d'auth — sans lui, les visites du
    // propriétaire y resteraient anonymes. Servi à l'exclusion seulement, JAMAIS stocké.
    const rawLuid = (req.body as { luid?: unknown } | null | undefined)?.luid
    const luid = typeof rawLuid === 'string' && /^[A-Za-z0-9]{10,60}$/.test(rawLuid) ? rawLuid : null
    const uid = (doc as { uid?: string | null }).uid ?? luid
    if (uid && (await resolveExcludedUids()).has(uid)) {
      if (eid) {
        try { await db.collection('analyticsEvents').doc(eid).delete() } catch { /* best-effort */ }
      }
      res.status(204).end()
      return
    }
    try {
      if (eid) {
        await db.collection('analyticsEvents').doc(eid).set({ ...doc, ts: FieldValue.serverTimestamp() }, { merge: true })
      } else {
        await db.collection('analyticsEvents').add({ ...doc, ts: FieldValue.serverTimestamp() })
      }
    } catch {
      // best-effort : on n'expose jamais d'erreur au visiteur
    }
    // Notifications Telegram au propriétaire (log live des connectés + arrivée des
    // anonymes). Best-effort et interne (jamais ne lève) : ne bloque pas le beacon.
    await maybeNotifyNewSession(db, doc, uid, eid)
    res.status(204).end()
  },
)
