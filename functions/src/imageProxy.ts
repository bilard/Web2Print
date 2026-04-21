import { onCall, HttpsError } from 'firebase-functions/v2/https'

const MAX_BYTES = 4 * 1024 * 1024 // 4 MB, aligné sur la limite inlineData Gemini
const FETCH_TIMEOUT_MS = 15_000

/**
 * Hostnames / prefixes qu'on refuse de fetch pour prévenir le SSRF (accès aux
 * services internes GCP, au réseau local, au metadata server).
 */
const BLOCKED_HOST_PATTERNS: RegExp[] = [
  /^localhost$/i,
  /^127\./,
  /^10\./,
  /^192\.168\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^169\.254\./, // link-local + GCP metadata
  /^0\./,
  /metadata\.google\.internal$/i,
]

function assertSafeUrl(raw: string): URL {
  let u: URL
  try {
    u = new URL(raw)
  } catch {
    throw new HttpsError('invalid-argument', 'URL invalide')
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') {
    throw new HttpsError('invalid-argument', 'Protocole non supporté')
  }
  const host = u.hostname
  if (BLOCKED_HOST_PATTERNS.some((re) => re.test(host))) {
    throw new HttpsError('permission-denied', 'Hostname bloqué')
  }
  return u
}

function guessMimeFromUrl(url: URL): string | null {
  const m = url.pathname.toLowerCase().match(/\.(png|jpe?g|webp)$/)
  if (!m) return null
  const ext = m[1] === 'jpg' ? 'jpeg' : m[1]
  return `image/${ext}`
}

function bufferToBase64(buf: ArrayBuffer): string {
  return Buffer.from(buf).toString('base64')
}

/**
 * Proxy HTTP callable pour récupérer une image externe côté serveur et
 * contourner CORS. Retourne l'image en base64 + mimeType, consommable
 * directement comme inlineData pour Gemini Nano Banana 2.
 *
 * Usage client : httpsCallable(functions, 'imageProxy')({ url })
 */
export const imageProxy = onCall(
  { region: 'europe-west1', maxInstances: 10, timeoutSeconds: 30, memory: '512MiB' },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Authentification requise')
    }
    const { url } = (request.data ?? {}) as { url?: string }
    if (typeof url !== 'string' || url.length === 0) {
      throw new HttpsError('invalid-argument', 'url manquant')
    }

    const safe = assertSafeUrl(url)

    const ctrl = new AbortController()
    const timeoutId = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS)
    let res: Response
    try {
      res = await fetch(safe.toString(), {
        signal: ctrl.signal,
        redirect: 'follow',
        headers: {
          // Certains CDN servent une page anti-bot sans user-agent.
          'User-Agent': 'Mozilla/5.0 (compatible; Web2PrintImageProxy/1.0)',
          Accept: 'image/*,*/*;q=0.8',
        },
      })
    } catch (err) {
      const msg = (err as Error).name === 'AbortError' ? 'timeout 15s' : (err as Error).message
      throw new HttpsError('deadline-exceeded', `fetch échoué : ${msg}`)
    } finally {
      clearTimeout(timeoutId)
    }

    if (!res.ok) {
      throw new HttpsError('not-found', `source répond ${res.status}`)
    }

    const contentLength = Number(res.headers.get('content-length') ?? '0')
    if (contentLength > MAX_BYTES) {
      throw new HttpsError('resource-exhausted', `image trop lourde (${contentLength} > ${MAX_BYTES})`)
    }

    const buf = await res.arrayBuffer()
    if (buf.byteLength > MAX_BYTES) {
      throw new HttpsError('resource-exhausted', `image trop lourde (${buf.byteLength} > ${MAX_BYTES})`)
    }

    let mimeType = res.headers.get('content-type')?.split(';')[0]?.trim() ?? ''
    if (!/^image\/(png|jpe?g|webp)$/i.test(mimeType)) {
      mimeType = guessMimeFromUrl(safe) ?? mimeType ?? 'image/png'
    }

    return { data: bufferToBase64(buf), mimeType }
  },
)
