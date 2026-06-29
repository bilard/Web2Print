export type Area = 'promo' | 'docs' | 'app' | 'other'
export type Device = 'mobile' | 'tablet' | 'desktop'

const APP_PREFIXES = ['/dashboard', '/editor', '/data', '/taxonomies', '/scraping-templates', '/workflows', '/login', '/onboarding']
const BOT_RE = /bot|crawl|spider|slurp|bingpreview|facebookexternalhit|headless|lighthouse|pingdom|monitor/i

export function deriveArea(path: string): Area {
  if (path === '/promo' || path.startsWith('/promo/')) return 'promo'
  if (path === '/docs' || path.startsWith('/docs/')) return 'docs'
  if (APP_PREFIXES.some((p) => path === p || path.startsWith(p + '/'))) return 'app'
  return 'other'
}

export function deriveDevice(ua: string): Device {
  if (/ipad|tablet|(android(?!.*mobile))/i.test(ua)) return 'tablet'
  if (/mobi|iphone|ipod|android.*mobile|windows phone/i.test(ua)) return 'mobile'
  return 'desktop'
}

/** Système d'exploitation lisible dérivé du user-agent (`null` si inconnu). */
export function deriveOs(ua: string): string | null {
  if (!ua) return null
  if (/windows phone/i.test(ua)) return 'Windows Phone'
  if (/windows nt|win32|win64/i.test(ua)) return 'Windows'
  if (/iphone|ipad|ipod/i.test(ua)) return 'iOS'
  if (/android/i.test(ua)) return 'Android'
  if (/cros/i.test(ua)) return 'ChromeOS'
  if (/mac os x|macintosh/i.test(ua)) return 'macOS'
  if (/linux/i.test(ua)) return 'Linux'
  return null
}

/** Navigateur lisible dérivé du user-agent (`null` si inconnu). Ordre = du plus spécifique au plus générique. */
export function deriveBrowser(ua: string): string | null {
  if (!ua) return null
  if (/edg(e|a|ios)?\//i.test(ua)) return 'Edge'
  if (/opr\/|opera/i.test(ua)) return 'Opera'
  if (/samsungbrowser/i.test(ua)) return 'Samsung Internet'
  if (/firefox|fxios/i.test(ua)) return 'Firefox'
  if (/chrome|crios|chromium/i.test(ua)) return 'Chrome'
  if (/safari/i.test(ua)) return 'Safari'
  return null
}

/** Normalise une ville issue des en-têtes edge (souvent minuscule et %-encodée). `null` si vide. */
export function normalizeCity(raw: string | undefined | null): string | null {
  if (!raw) return null
  let s = raw
  try {
    s = decodeURIComponent(raw)
  } catch {
    /* en-tête déjà décodé ou mal formé : on garde la valeur brute */
  }
  s = s.replace(/[+_]/g, ' ').trim()
  if (!s) return null
  // Titre : « san francisco » → « San Francisco ».
  return s.replace(/\b\p{L}/gu, (c) => c.toUpperCase()).slice(0, 80)
}

export function normalizeRef(referrer: string | undefined): string | null {
  if (!referrer) return null
  try {
    const host = new URL(referrer).hostname.replace(/^www\./, '')
    return host || null
  } catch {
    return null
  }
}

export function isBot(ua: string): boolean {
  return !ua || BOT_RE.test(ua)
}

export interface EventInput {
  path: string
  ref: string | null
  src: string | null
  vid: string
  sid: string
  uid: string | null
}

export function buildEventDoc(
  body: unknown,
  headers: { ua: string; referer: string | undefined; country: string | null; city?: string | null },
):
  | (EventInput & {
      area: Area
      device: Device
      os: string | null
      browser: string | null
      country: string | null
      city: string | null
    })
  | null {
  if (isBot(headers.ua)) return null
  const b = (body ?? {}) as Record<string, unknown>
  const path = typeof b.path === 'string' ? b.path : null
  const vid = typeof b.vid === 'string' ? b.vid : null
  const sid = typeof b.sid === 'string' ? b.sid : null
  if (!path || !path.startsWith('/') || !vid || !sid) return null
  return {
    path: path.slice(0, 300),
    area: deriveArea(path),
    ref: normalizeRef(headers.referer),
    src: typeof b.src === 'string' ? b.src.slice(0, 120) : null,
    device: deriveDevice(headers.ua),
    os: deriveOs(headers.ua),
    browser: deriveBrowser(headers.ua),
    country: headers.country ? headers.country.slice(0, 8) : null,
    city: normalizeCity(headers.city),
    vid: vid.slice(0, 60),
    sid: sid.slice(0, 60),
    uid: typeof b.uid === 'string' ? b.uid.slice(0, 60) : null,
  }
}
