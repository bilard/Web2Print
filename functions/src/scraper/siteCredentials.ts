import { getFirestore } from 'firebase-admin/firestore'

export interface SiteCredentials {
  login: string
  password: string
  loginUrl: string
  host: string
}

/** Domaine « baré » : sans protocole, chemin, www ni casse (kramp.com, progarden.fr…). */
const bareHost = (h: string): string =>
  h.replace(/^https?:\/\//i, '').replace(/\/.*$/, '').replace(/^www\./i, '').toLowerCase()

/** Identifiants d'un site authentifié (ex. kramp) depuis users/{uid}.siteCredentials[…].
 *  null si absent ou incomplet. Serveur-only ; ne JAMAIS journaliser le retour.
 *
 *  ⚠ Tolérance aux clés hétérogènes : la clé de STOCKAGE (formulaire Sites sources) et la
 *  clé de LOOKUP (`bare(s.domain)` côté moisson) se sont désynchronisées — un même site a pu
 *  être enregistré sous `kramp`, `kramp.com` ET `www.kramp.com`. On matche donc sur le domaine
 *  BARÉ, contre la clé ET le champ `host` de chaque entrée, en préférant une clé-domaine
 *  fraîche (www./nue) au repli par champ `host`. Sans ça, kramp retombait dans la passe
 *  générique Jina (login jamais déclenché → prix 0%). */
type CredMap = Record<string, { login?: string; password?: string; loginUrl?: string; host?: string }>

/** Sélection PURE (testable sans Firestore) des identifiants d'un site dans la map brute. */
export function pickSiteCredentials(all: CredMap, host: string): SiteCredentials | null {
  const want = bareHost(host)
  const build = (c: CredMap[string] | undefined) =>
    c?.login && c?.password ? { login: c.login, password: c.password, loginUrl: c.loginUrl ?? 'https://login.kramp.com/', host } : null
  // 1) Clé exacte, puis variantes domaine (nue / www.) — priorité à l'entrée domaine récente.
  const direct = build(all[host]) || build(all[want]) || build(all[`www.${want}`])
  if (direct) return direct
  // 2) Repli : toute entrée dont la clé OU le champ `host` correspond une fois barée.
  for (const [k, c] of Object.entries(all)) {
    if (bareHost(k) === want || bareHost(c?.host ?? '') === want) {
      const r = build(c)
      if (r) return r
    }
  }
  return null
}

export async function getSiteCredentials(uid: string, host: string): Promise<SiteCredentials | null> {
  const snap = await getFirestore().doc(`users/${uid}`).get()
  return pickSiteCredentials((snap.data()?.siteCredentials ?? {}) as CredMap, host)
}
