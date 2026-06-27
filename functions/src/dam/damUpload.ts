// functions/src/dam/damUpload.ts
// Callable : centralise UNE image dans le DAM (Google Drive) côté SERVEUR.
// Le serveur récupère l'image puis l'écrit dans Drive directement — PAS de
// round-trip base64 vers le navigateur (qui corrompait/tronquait l'image : Drive
// affichait « aucun aperçu »). Valide que la source est bien une image (magic
// bytes) avant upload, et accepte de gros fichiers (pas de limite de réponse
// callable). Jeton OAuth serveur de l'utilisateur (scope drive complet) → le
// dossier et les fichiers lui appartiennent ; lisibles par le resolver client.
//
// Usage : httpsCallable(functions,'damUpload')({ url, fileName, folderName })
import { onCall, HttpsError } from 'firebase-functions/v2/https'
import { getGoogleAccessToken } from '../google/serverAuth'

const FETCH_TIMEOUT_MS = 20_000
const MAX_BYTES = 20 * 1024 * 1024 // 20 Mo : pas de base64 vers le client → on peut être large
const DRIVE_API = 'https://www.googleapis.com/drive/v3'
const FOLDER_MIME = 'application/vnd.google-apps.folder'

const BLOCKED_HOST_PATTERNS: RegExp[] = [
  /^localhost$/i, /^127\./, /^10\./, /^192\.168\./,
  /^172\.(1[6-9]|2\d|3[01])\./, /^169\.254\./, /^0\./, /metadata\.google\.internal$/i,
]

function assertSafeUrl(raw: string): URL {
  let u: URL
  try { u = new URL(raw) } catch { throw new HttpsError('invalid-argument', 'URL invalide') }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new HttpsError('invalid-argument', 'Protocole non supporté')
  if (BLOCKED_HOST_PATTERNS.some((re) => re.test(u.hostname))) throw new HttpsError('permission-denied', 'Hostname bloqué')
  return u
}

const EXT_BY_MIME: Record<string, string> = {
  'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif', 'image/svg+xml': 'svg',
}

/** Détecte le vrai type image par magic bytes (≠ se fier au content-type/URL,
 *  qui peuvent mentir et faire stocker du HTML « en .jpg » → aperçu KO). */
function detectImageMime(buf: Buffer, ctHint: string): string | null {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg'
  if (buf.length >= 8 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return 'image/png'
  if (buf.length >= 12 && buf.toString('latin1', 0, 4) === 'RIFF' && buf.toString('latin1', 8, 12) === 'WEBP') return 'image/webp'
  if (buf.length >= 6 && /^GIF8[79]a$/.test(buf.toString('latin1', 0, 6))) return 'image/gif'
  if (/image\/svg/i.test(ctHint) && /<svg[\s>]/i.test(buf.toString('utf8', 0, Math.min(buf.length, 512)))) return 'image/svg+xml'
  return null
}

async function ensureFolder(token: string, name: string): Promise<string> {
  const auth = { Authorization: `Bearer ${token}` }
  const esc = name.replace(/\\/g, '\\\\').replace(/'/g, "\\'")
  const params = new URLSearchParams({
    q: `name='${esc}' and mimeType='${FOLDER_MIME}' and trashed=false`,
    fields: 'files(id)', orderBy: 'modifiedTime desc', pageSize: '1', spaces: 'drive',
  })
  const find = await fetch(`${DRIVE_API}/files?${params}`, { headers: auth })
  if (find.ok) {
    const d = (await find.json()) as { files?: { id: string }[] }
    if (d.files?.[0]?.id) return d.files[0].id
  }
  const create = await fetch(`${DRIVE_API}/files?fields=id`, {
    method: 'POST', headers: { ...auth, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, mimeType: FOLDER_MIME }),
  })
  const j = (await create.json().catch(() => null)) as { id?: string; error?: { message?: string } } | null
  if (!create.ok || !j?.id) throw new HttpsError('internal', `dossier DAM Drive : ${create.status} ${j?.error?.message ?? ''}`)
  return j.id
}

export const damUpload = onCall(
  { region: 'europe-west1', memory: '512MiB', timeoutSeconds: 60, maxInstances: 10 },
  async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Authentification requise')
    const { url, fileName, folderName } = (request.data ?? {}) as { url?: string; fileName?: string; folderName?: string }
    if (typeof url !== 'string' || url.length === 0) throw new HttpsError('invalid-argument', 'url manquant')
    const safe = assertSafeUrl(url)

    const token = await getGoogleAccessToken(request.auth.uid)
    const folderId = await ensureFolder(token, (typeof folderName === 'string' && folderName) || 'Web2Print — Assets DAM')

    // 1. Récupère l'image côté serveur.
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS)
    let res: Response
    try {
      res = await fetch(safe.toString(), {
        signal: ctrl.signal, redirect: 'follow',
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Web2PrintDAM/1.0)', Accept: 'image/*,*/*;q=0.8' },
      })
    } catch (err) {
      const msg = (err as Error).name === 'AbortError' ? 'timeout 20s' : (err as Error).message
      throw new HttpsError('deadline-exceeded', `fetch échoué : ${msg}`)
    } finally {
      clearTimeout(timer)
    }
    if (!res.ok) throw new HttpsError('not-found', `source répond ${res.status}`)
    const ab = await res.arrayBuffer()
    if (ab.byteLength > MAX_BYTES) throw new HttpsError('resource-exhausted', `image trop lourde (${ab.byteLength} > ${MAX_BYTES})`)
    const buf = Buffer.from(ab)
    const mime = detectImageMime(buf, res.headers.get('content-type') ?? '')
    if (!mime) {
      throw new HttpsError('failed-precondition', `la source n'est pas une image valide (${res.headers.get('content-type') ?? '?'})`)
    }

    // 2. Upload multipart (Buffer.concat → binaire propre, comme gdrive-export).
    const base = ((typeof fileName === 'string' && fileName) || `asset_${Date.now()}`).replace(/[/\\:*?"<>|]/g, '_').slice(0, 80)
    const name = /\.\w{2,4}$/.test(base) ? base : `${base}.${EXT_BY_MIME[mime] ?? 'jpg'}`
    const boundary = '-------w2pdam-' + request.auth.uid.slice(0, 8) + '-' + buf.length
    const metadata = { name, mimeType: mime, parents: [folderId] }
    const head =
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n` +
      `--${boundary}\r\nContent-Type: ${mime}\r\n\r\n`
    const tail = `\r\n--${boundary}--`
    const body = Buffer.concat([Buffer.from(head, 'utf8'), buf, Buffer.from(tail, 'utf8')])

    const up = await fetch(
      'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink',
      { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': `multipart/related; boundary=${boundary}` }, body },
    )
    const meta = (await up.json().catch(() => null)) as { id?: string; webViewLink?: string; error?: { message?: string } } | null
    if (!up.ok || !meta?.id) throw new HttpsError('internal', `Drive ${up.status} — ${meta?.error?.message ?? 'upload échoué'}`)

    return { fileId: meta.id, webViewLink: meta.webViewLink ?? `https://drive.google.com/file/d/${meta.id}/view` }
  },
)
