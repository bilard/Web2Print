// functions/src/scraper/prestashopLogin.ts
// Session authentifiée PrestaShop (login par formulaire cookie) — cas des sites où les
// prix ne sont visibles QUE connecté (ex. progarden). Contrairement à kramp (Firecrawl
// stealth obligatoire), un simple cookie jar suffit : GET la page de login (cookie de
// session initial), POST email/password, on garde le jar. GRATUIT et rapide.
// ⚠ Serveur-only. Ne JAMAIS journaliser le mot de passe ni le jar.
import type { SiteCredentials } from './siteCredentials'

const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36'

/** Fusionne des en-têtes Set-Cookie dans un jar {name → value} (attributs ignorés). */
function mergeCookies(jar: Map<string, string>, setCookies: string[]): void {
  for (const sc of setCookies) {
    const first = sc.split(';', 1)[0]
    const eq = first.indexOf('=')
    if (eq <= 0) continue
    const name = first.slice(0, eq).trim()
    const value = first.slice(eq + 1).trim()
    if (name) jar.set(name, value)
  }
}

function jarHeader(jar: Map<string, string>): string {
  return [...jar.entries()].map(([k, v]) => `${k}=${v}`).join('; ')
}

/** Ouvre une session authentifiée et renvoie le cookie jar (chaîne d'en-tête `Cookie`).
 *  Login PrestaShop standard : champs `email` / `password` / `submitLogin`. */
export async function prestashopLogin(creds: SiteCredentials, timeoutMs = 20_000): Promise<string> {
  const jar = new Map<string, string>()
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    // 1) GET la page de login → cookie de session initial (certains thèmes l'exigent).
    //    On suit les redirections (progarden.fr → www.progarden.fr) et on POSTe sur
    //    l'URL FINALE résolue, pour ne pas perdre le login sur un 301 de domaine.
    const g = await fetch(creds.loginUrl, {
      headers: { 'User-Agent': UA, Accept: 'text/html' },
      redirect: 'follow',
      signal: ctrl.signal,
    })
    mergeCookies(jar, g.headers.getSetCookie?.() ?? [])
    const postUrl = g.url || creds.loginUrl

    // 2) POST des identifiants (redirect manuel : on veut le Set-Cookie de la 302).
    const body = new URLSearchParams({
      email: creds.login,
      password: creds.password,
      submitLogin: '1',
      back: 'my-account',
    })
    const p = await fetch(postUrl, {
      method: 'POST',
      headers: {
        'User-Agent': UA,
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'text/html',
        ...(jar.size ? { Cookie: jarHeader(jar) } : {}),
      },
      body: body.toString(),
      redirect: 'manual',
      signal: ctrl.signal,
    })
    mergeCookies(jar, p.headers.getSetCookie?.() ?? [])
    return jarHeader(jar)
  } finally {
    clearTimeout(timer)
  }
}

/** Fetch une URL avec un cookie jar (session authentifiée). */
export async function fetchWithJar(url: string, jar: string, timeoutMs = 20_000): Promise<string | null> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': UA, Accept: 'text/html', ...(jar ? { Cookie: jar } : {}) },
      redirect: 'follow',
      signal: ctrl.signal,
    })
    if (!res.ok) return null
    return await res.text()
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}
