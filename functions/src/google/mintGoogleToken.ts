// functions/src/google/mintGoogleToken.ts
// Callable : fournit au CLIENT (éditeur) un access token Google (Drive + Gmail)
// minté depuis le refresh token serveur de l'utilisateur. Permet à l'éditeur de
// réutiliser le jeton rafraîchi automatiquement au lieu du popup navigateur (~1 h
// + écran « appli non validée »). Aucun secret exposé : c'est le propre token de
// l'utilisateur authentifié, déjà accordé via le connecteur « accès serveur ».
import { onCall, HttpsError } from 'firebase-functions/v2/https'
import { getGoogleAccessToken } from './serverAuth'

export const mintGoogleToken = onCall<unknown, Promise<{ accessToken: string }>>(
  { timeoutSeconds: 30, memory: '256MiB', region: 'europe-west1' },
  async (req) => {
    if (!req.auth) throw new HttpsError('unauthenticated', 'Authentification Firebase requise')
    try {
      const accessToken = await getGoogleAccessToken(req.auth.uid)
      return { accessToken }
    } catch (e) {
      // Connecteur serveur non connecté / refresh révoqué → le client retombera sur le jeton navigateur.
      throw new HttpsError('failed-precondition', e instanceof Error ? e.message : String(e))
    }
  },
)
