// functions/src/google/serverAuth.ts
// Accès Google CÔTÉ SERVEUR (Drive/Gmail sans navigateur) : flux OAuth
// « authorization code + offline ». L'utilisateur connecte son compte UNE FOIS
// depuis Réglages (bouton) ; le callback échange le code contre un REFRESH
// TOKEN stocké dans users/{uid}.googleServer (doc privé). Ensuite
// getGoogleAccessToken() fabrique des access tokens à la demande pour les
// nodes serveur. AUCUN secret ne transite par Telegram.
//
// Config : config/googleOAuth = { clientId, clientSecret } (doc admin-only,
// collé depuis Google Cloud Console → Credentials → client OAuth web).
// L'URI de redirection CI-DESSOUS doit être ajoutée à ce client OAuth.
import { onRequest } from 'firebase-functions/v2/https'
import { initializeApp, getApps } from 'firebase-admin/app'
import { getFirestore, FieldValue } from 'firebase-admin/firestore'

if (!getApps().length) initializeApp()

/** URL stable de la function (Cloud Run) — à enregistrer comme URI de redirection. */
const OAUTH_REDIRECT_URI = 'https://googleoauthcallback-4cs64afhba-ew.a.run.app'

const GOOGLE_SERVER_SCOPES = [
  // Drive COMPLET : permet d'écrire dans un dossier créé à la main (drive.file ne le permet pas).
  'https://www.googleapis.com/auth/drive',
  'https://www.googleapis.com/auth/gmail.send',
]

interface OAuthClientConfig {
  clientId?: string
  clientSecret?: string
}

async function readOAuthClient(): Promise<{ clientId: string; clientSecret: string }> {
  const snap = await getFirestore().doc('config/googleOAuth').get()
  const cfg = (snap.data() ?? {}) as OAuthClientConfig
  if (!cfg.clientId || !cfg.clientSecret) {
    throw new Error('config/googleOAuth incomplet (clientId/clientSecret) — à renseigner dans Réglages (admin).')
  }
  return { clientId: cfg.clientId, clientSecret: cfg.clientSecret }
}

const STATE_TTL_MS = 10 * 60_000

function html(message: string, ok: boolean): string {
  return `<!doctype html><meta charset="utf-8"><title>Web2Print</title>
<body style="font-family:system-ui;display:flex;align-items:center;justify-content:center;height:90vh;background:#111;color:#eee">
<div style="text-align:center;max-width:420px"><div style="font-size:42px">${ok ? '✅' : '⚠️'}</div>
<p style="font-size:15px;line-height:1.5">${message}</p>
${ok ? '<p style="color:#888;font-size:13px">Tu peux fermer cet onglet et retourner dans l’application.</p>' : ''}</div></body>`
}

/**
 * Callback OAuth : ?code&state. Le state référence googleOAuthStates/{state}
 * ({ uid, createdAt }, créé par le client juste avant l'ouverture du consentement,
 * supprimé ici — usage unique, TTL 10 min).
 */
export const googleOAuthCallback = onRequest(
  { region: 'europe-west1', timeoutSeconds: 60, maxInstances: 3 },
  async (req, res) => {
    const code = String(req.query.code ?? '')
    const state = String(req.query.state ?? '')
    const error = String(req.query.error ?? '')
    if (error) {
      res.status(400).send(html(`Connexion refusée : ${error}.`, false))
      return
    }
    if (!code || !state) {
      res.status(400).send(html('Requête invalide (code/state manquant).', false))
      return
    }

    const db = getFirestore()
    const stateRef = db.doc(`googleOAuthStates/${state}`)
    const stateSnap = await stateRef.get()
    const data = stateSnap.data() as { uid?: string; createdAt?: { toMillis: () => number } } | undefined
    await stateRef.delete().catch(() => {})
    const uid = data?.uid
    const fresh = data?.createdAt && Date.now() - data.createdAt.toMillis() < STATE_TTL_MS
    if (!uid || !fresh) {
      res.status(400).send(html('Lien de connexion expiré — relance la connexion depuis les Réglages.', false))
      return
    }

    try {
      const { clientId, clientSecret } = await readOAuthClient()
      const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          code,
          client_id: clientId,
          client_secret: clientSecret,
          redirect_uri: OAUTH_REDIRECT_URI,
          grant_type: 'authorization_code',
        }),
      })
      const token = (await tokenRes.json()) as { refresh_token?: string; scope?: string; error_description?: string; error?: string }
      if (!tokenRes.ok) {
        throw new Error(token.error_description ?? token.error ?? `HTTP ${tokenRes.status}`)
      }
      if (!token.refresh_token) {
        // Arrive si le consentement a déjà été donné sans accès offline ; prompt=consent l'évite normalement.
        throw new Error('Google n’a pas renvoyé de refresh token — retire l’accès dans myaccount.google.com/permissions puis reconnecte.')
      }
      await db.doc(`users/${uid}`).set(
        {
          googleServer: {
            refreshToken: token.refresh_token,
            scopes: token.scope ?? GOOGLE_SERVER_SCOPES.join(' '),
            connectedAt: FieldValue.serverTimestamp(),
          },
        },
        { merge: true },
      )
      res.status(200).send(html('Google connecté pour l’accès serveur (Drive + Gmail). Les workflows Telegram/cron peuvent maintenant utiliser tes outils Google.', true))
    } catch (err) {
      console.error('googleOAuthCallback:', err)
      res.status(500).send(html(`Échec de la connexion : ${err instanceof Error ? err.message : err}`, false))
    }
  },
)

// Cache par instance : access token Google (~1 h), re-minté à la demande.
// Indexé par refresh token : une reconnexion (ex. changement de scope) génère un
// nouveau refresh token → le cache est automatiquement invalidé.
const tokenCache = new Map<string, { token: string; exp: number; refreshToken: string }>()

/** Access token Google pour cet utilisateur (via son refresh token serveur). */
export async function getGoogleAccessToken(uid: string): Promise<string> {
  // On relit toujours le refresh token : c'est lui qui détermine la validité du cache
  // (sinon un ancien access token de scope obsolète serait servi après reconnexion).
  const userSnap = await getFirestore().doc(`users/${uid}`).get()
  const refreshToken = (userSnap.data()?.googleServer as { refreshToken?: string } | undefined)?.refreshToken
  if (!refreshToken) {
    throw new Error('Google non connecté pour l’accès serveur — Réglages → Connecteurs → « Connecter Google (accès serveur) ».')
  }
  const cached = tokenCache.get(uid)
  if (cached && cached.refreshToken === refreshToken && cached.exp > Date.now() + 60_000) {
    return cached.token
  }
  const { clientId, clientSecret } = await readOAuthClient()
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'refresh_token',
    }),
  })
  const json = (await res.json()) as { access_token?: string; expires_in?: number; error?: string }
  if (!res.ok || !json.access_token) {
    if (json.error === 'invalid_grant') {
      throw new Error('Autorisation Google expirée ou révoquée — reconnecte Google (accès serveur) dans les Réglages.')
    }
    throw new Error(`Google token: ${json.error ?? res.status}`)
  }
  tokenCache.set(uid, { token: json.access_token, exp: Date.now() + (json.expires_in ?? 3600) * 1000, refreshToken })
  return json.access_token
}
