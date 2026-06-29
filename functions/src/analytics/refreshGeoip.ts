// functions/src/analytics/refreshGeoip.ts
// Rafraîchit mensuellement la base DB-IP City Lite dans Cloud Storage.
// Source gratuite, sans compte : https://download.db-ip.com/free/ (CC BY 4.0).
import { onSchedule } from 'firebase-functions/v2/scheduler'
import { getApps, initializeApp } from 'firebase-admin/app'
import { getStorage } from 'firebase-admin/storage'
import { gunzipSync } from 'node:zlib'
import { MMDB_BUCKET, MMDB_PATH } from './geoip'

if (!getApps().length) initializeApp()

/** URL DB-IP pour un mois donné (`YYYY-MM`). */
const urlFor = (year: number, month: number): string =>
  `https://download.db-ip.com/free/dbip-city-lite-${year}-${String(month).padStart(2, '0')}.mmdb.gz`

/**
 * Télécharge le `.mmdb.gz` du mois courant (repli sur le mois précédent si pas
 * encore publié), le décompresse et l'écrit dans Cloud Storage. `null` si échec.
 */
async function fetchLatestMmdb(now: Date): Promise<Buffer | null> {
  const y = now.getUTCFullYear()
  const m = now.getUTCMonth() + 1
  const candidates = [
    urlFor(y, m),
    m === 1 ? urlFor(y - 1, 12) : urlFor(y, m - 1), // mois précédent
  ]
  for (const url of candidates) {
    const resp = await fetch(url)
    if (!resp.ok) {
      console.warn(`[refreshGeoip] ${url} → HTTP ${resp.status}`)
      continue
    }
    const gz = Buffer.from(await resp.arrayBuffer())
    return gunzipSync(gz)
  }
  return null
}

export const refreshGeoip = onSchedule(
  // 1 Gio : décompression ~124 Mo en RAM. Le 3 du mois, le fichier du mois est publié.
  { schedule: '0 4 3 * *', timeZone: 'Europe/Paris', region: 'europe-west1', memory: '1GiB', timeoutSeconds: 300 },
  async () => {
    const mmdb = await fetchLatestMmdb(new Date())
    if (!mmdb) {
      console.error('[refreshGeoip] aucune base téléchargeable (mois courant et précédent en échec)')
      return
    }
    await getStorage()
      .bucket(MMDB_BUCKET)
      .file(MMDB_PATH)
      .save(mmdb, { contentType: 'application/octet-stream', resumable: false })
    console.log(`[refreshGeoip] base mise à jour (${mmdb.length} octets). Les instances chaudes de collectAnalytics reprendront la nouvelle base à leur recyclage.`)
  },
)
