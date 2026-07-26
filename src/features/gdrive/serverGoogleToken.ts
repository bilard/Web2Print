// Récupère un access token Google côté ÉDITEUR en réutilisant le jeton SERVEUR
// (refresh token, rafraîchi automatiquement) au lieu du popup navigateur (~1 h +
// écran « appli non validée »). Cache client ~50 min ; le serveur re-mint au-delà.
import { httpsCallable } from 'firebase/functions'
import { functions } from '@/lib/firebase/config'

const mintGoogleToken = httpsCallable<unknown, { accessToken: string }>(functions, 'mintGoogleToken')

let cache: { token: string; exp: number } | null = null

/** Access token Google (Drive + Gmail) via le connecteur serveur. Lève si non connecté. */
export async function getServerGoogleToken(): Promise<string> {
  if (cache && cache.exp > Date.now() + 60_000) return cache.token
  const res = await mintGoogleToken({})
  const token = res.data?.accessToken
  if (!token) throw new Error('mintGoogleToken: réponse sans accessToken')
  cache = { token, exp: Date.now() + 50 * 60_000 }
  return token
}

/** À appeler après une (dé)connexion Google serveur pour forcer un nouveau mint. */
export function clearServerGoogleTokenCache(): void {
  cache = null
}
