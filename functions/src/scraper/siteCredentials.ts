import { getFirestore } from 'firebase-admin/firestore'

export interface SiteCredentials {
  login: string
  password: string
  loginUrl: string
  host: string
}

/** Identifiants d'un site authentifié (ex. kramp) depuis users/{uid}.siteCredentials[host].
 *  null si absent ou incomplet. Serveur-only ; ne JAMAIS journaliser le retour. */
export async function getSiteCredentials(uid: string, host: string): Promise<SiteCredentials | null> {
  const snap = await getFirestore().doc(`users/${uid}`).get()
  const all = (snap.data()?.siteCredentials ?? {}) as Record<string, { login?: string; password?: string; loginUrl?: string }>
  const c = all[host]
  if (!c?.login || !c?.password) return null
  return { login: c.login, password: c.password, loginUrl: c.loginUrl ?? 'https://login.kramp.com/', host }
}
