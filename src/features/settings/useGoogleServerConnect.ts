// src/features/settings/useGoogleServerConnect.ts
// Logique du connecteur Google « accès serveur » (OAuth offline) : hydratation
// Firestore (users/{uid}.googleServer + config/googleOAuth admin-only),
// sauvegarde du client OAuth, ouverture du consentement et test RÉEL de la
// connexion — même échange refresh_token→access_token que getGoogleAccessToken
// côté Functions, donc le statut reflète exactement ce que verront les
// workflows cron/webhook/Telegram.
import { useCallback, useEffect, useRef, useState } from 'react'
import { deleteField, doc, getDoc, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore'
import { toast } from 'sonner'
import { db } from '@/lib/firebase/config'
import { useAuthStore } from '@/stores/auth.store'
import { useIsAdmin } from '@/features/access/useAccess'

// Doit rester aligné avec OAUTH_REDIRECT_URI de functions/src/google/serverAuth.ts.
export const OAUTH_REDIRECT_URI = 'https://googleoauthcallback-4cs64afhba-ew.a.run.app'
const SCOPES = 'https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/gmail.send'

type GoogleServerTestStatus = 'testing' | 'ok' | 'error' | 'empty' | null

export function useGoogleServerConnect() {
  const uid = useAuthStore((s) => s.user?.uid)
  const isAdmin = useIsAdmin()
  const [connectedAt, setConnectedAt] = useState<number | null | undefined>(undefined)
  const [clientId, setClientId] = useState('')
  const [clientSecret, setClientSecret] = useState('')
  const [busy, setBusy] = useState(false)
  const [testStatus, setTestStatus] = useState<GoogleServerTestStatus>(null)
  const [testMessage, setTestMessage] = useState('')
  const refreshTokenRef = useRef<string>('')

  // Même échange que le serveur : si Google rend un access token, les nodes
  // serveur fonctionneront. Champs lus depuis les refs/états hydratés.
  const test = useCallback(async (creds?: { clientId?: string; clientSecret?: string }) => {
    const id = (creds?.clientId ?? clientId).trim()
    const secret = (creds?.clientSecret ?? clientSecret).trim()
    if (!refreshTokenRef.current) { setTestStatus('empty'); setTestMessage(''); return }
    if (!id || !secret) {
      setTestStatus('error')
      setTestMessage('Client ID / Secret manquant — impossible de tester.')
      return
    }
    setTestStatus('testing')
    setTestMessage('')
    try {
      const res = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          refresh_token: refreshTokenRef.current,
          client_id: id,
          client_secret: secret,
          grant_type: 'refresh_token',
        }),
      })
      const json = (await res.json()) as { access_token?: string; error?: string }
      if (res.ok && json.access_token) {
        setTestStatus('ok')
        setTestMessage('Drive + Gmail opérationnels côté serveur.')
      } else if (json.error === 'invalid_grant') {
        setTestStatus('error')
        setTestMessage('Autorisation expirée ou révoquée — reconnecte Google (bouton Connecter).')
      } else if (json.error === 'invalid_client' || json.error === 'unauthorized_client') {
        setTestStatus('error')
        setTestMessage('Client ID / Secret invalide — vérifie les valeurs (Google Cloud Console).')
      } else {
        setTestStatus('error')
        setTestMessage(`Google a refusé le test : ${json.error ?? `HTTP ${res.status}`}.`)
      }
    } catch {
      setTestStatus('error')
      setTestMessage('Test impossible (réseau).')
    }
  }, [clientId, clientSecret])

  // Hydratation : état de connexion (one-shot) + client OAuth (admin), puis auto-test.
  useEffect(() => {
    if (!uid) return
    let cancelled = false
    const load = async () => {
      let token = ''
      let id = ''
      let secret = ''
      try {
        const snap = await getDoc(doc(db, 'users', uid))
        const gs = snap.data()?.googleServer as
          | { connectedAt?: { toMillis?: () => number }; refreshToken?: string }
          | undefined
        if (cancelled) return
        token = gs?.refreshToken ?? ''
        setConnectedAt(gs ? gs.connectedAt?.toMillis?.() ?? 0 : null)
      } catch {
        if (!cancelled) setConnectedAt(null)
      }
      if (isAdmin) {
        try {
          const snap = await getDoc(doc(db, 'config', 'googleOAuth'))
          if (cancelled) return
          id = (snap.data()?.clientId as string) ?? ''
          secret = (snap.data()?.clientSecret as string) ?? ''
          setClientId(id)
          setClientSecret(secret)
        } catch { /* lecture admin-only : ignorer */ }
      }
      refreshTokenRef.current = token
      if (cancelled) return
      if (!token) setTestStatus('empty')
      else if (isAdmin) void test({ clientId: id, clientSecret: secret })
      else { setTestStatus('ok'); setTestMessage('Drive + Gmail utilisables côté serveur.') } // non-admin : pas d'accès au client OAuth pour un test réel
    }
    void load()
    return () => { cancelled = true }
    // `test` volontairement hors deps : l'auto-test du mount reçoit ses creds en argument.
  }, [uid, isAdmin])

  const saveOAuthClient = async () => {
    if (!clientId.trim()) { toast.warning('Client ID requis.'); return }
    await setDoc(doc(db, 'config', 'googleOAuth'), {
      clientId: clientId.trim(),
      ...(clientSecret.trim() ? { clientSecret: clientSecret.trim() } : {}),
    }, { merge: true })
    toast.success('Client OAuth enregistré.')
    void test()
  }

  const connect = async () => {
    if (!uid) return
    if (!clientId.trim()) {
      toast.warning('Renseigne d’abord le client OAuth (Client ID / Secret) ci-dessous.')
      return
    }
    setBusy(true)
    try {
      const nonce = crypto.randomUUID()
      await setDoc(doc(db, 'googleOAuthStates', nonce), { uid, createdAt: serverTimestamp() })
      const url = new URL('https://accounts.google.com/o/oauth2/v2/auth')
      url.searchParams.set('client_id', clientId.trim())
      url.searchParams.set('redirect_uri', OAUTH_REDIRECT_URI)
      url.searchParams.set('response_type', 'code')
      url.searchParams.set('access_type', 'offline')
      url.searchParams.set('prompt', 'consent')
      url.searchParams.set('scope', SCOPES)
      url.searchParams.set('state', nonce)
      window.open(url.toString(), '_blank', 'noopener')
      toast.info('Valide le consentement Google dans le nouvel onglet, puis reviens ici.')
    } finally {
      setBusy(false)
    }
  }

  const disconnect = async () => {
    if (!uid) return
    await updateDoc(doc(db, 'users', uid), { googleServer: deleteField() })
    refreshTokenRef.current = ''
    setConnectedAt(null)
    setTestStatus('empty')
    setTestMessage('')
    toast.success('Accès serveur Google déconnecté.')
  }

  return {
    isAdmin, connectedAt, busy, testStatus, testMessage,
    clientId, setClientId, clientSecret, setClientSecret,
    saveOAuthClient, connect, disconnect, test,
  }
}
