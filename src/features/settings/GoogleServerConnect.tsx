// src/features/settings/GoogleServerConnect.tsx
// Connexion Google « accès serveur » (OAuth offline) : autorise UNE FOIS Drive +
// Gmail ; le refresh token est stocké côté serveur (users/{uid}.googleServer) et
// permet aux workflows cron/webhook/Telegram d'utiliser les outils Google sans
// navigateur. La config du client OAuth (clientId/clientSecret, Google Cloud
// Console) vit dans config/googleOAuth (admin-only — pattern Bright Data).
import { useEffect, useState } from 'react'
import { deleteField, doc, getDoc, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore'
import { CloudCog, Link2, Unlink, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { db } from '@/lib/firebase/config'
import { useAuthStore } from '@/stores/auth.store'
import { useIsAdmin } from '@/features/access/useAccess'

// Doit rester aligné avec OAUTH_REDIRECT_URI de functions/src/google/serverAuth.ts.
const OAUTH_REDIRECT_URI = 'https://googleoauthcallback-4cs64afhba-ew.a.run.app'
const SCOPES = 'https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/gmail.send'

export function GoogleServerConnect() {
  const uid = useAuthStore((s) => s.user?.uid)
  const isAdmin = useIsAdmin()
  const [connectedAt, setConnectedAt] = useState<number | null | undefined>(undefined)
  const [clientId, setClientId] = useState('')
  const [clientSecret, setClientSecret] = useState('')
  const [busy, setBusy] = useState(false)

  // État de connexion (one-shot) + clientId (admin) pour construire l'URL d'auth.
  useEffect(() => {
    if (!uid) return
    let cancelled = false
    getDoc(doc(db, 'users', uid)).then((snap) => {
      if (cancelled) return
      const gs = snap.data()?.googleServer as { connectedAt?: { toMillis?: () => number } } | undefined
      setConnectedAt(gs ? gs.connectedAt?.toMillis?.() ?? 0 : null)
    }).catch(() => setConnectedAt(null))
    if (isAdmin) {
      getDoc(doc(db, 'config', 'googleOAuth')).then((snap) => {
        if (!cancelled && snap.exists()) setClientId((snap.data().clientId as string) ?? '')
      }).catch(() => {})
    }
    return () => { cancelled = true }
  }, [uid, isAdmin])

  const saveOAuthClient = async () => {
    if (!clientId.trim()) { toast.warning('Client ID requis.'); return }
    await setDoc(doc(db, 'config', 'googleOAuth'), {
      clientId: clientId.trim(),
      ...(clientSecret.trim() ? { clientSecret: clientSecret.trim() } : {}),
    }, { merge: true })
    setClientSecret('')
    toast.success('Client OAuth enregistré.')
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
    setConnectedAt(null)
    toast.success('Accès serveur Google déconnecté.')
  }

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex items-start gap-2">
        <CloudCog className="w-4 h-4 text-emerald-400/80 shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <div className="text-[12px] text-white/80">Google — accès serveur (Drive + Gmail)</div>
          <p className="text-[10px] text-neutral-500 leading-snug mt-0.5">
            Autorise une fois ; les workflows <strong className="text-neutral-400">cron, webhook et Telegram</strong>{' '}
            pourront créer des Google Sheets et envoyer des Gmail sans navigateur. Aucun secret ne
            transite par Telegram.
          </p>
        </div>
        {connectedAt === undefined ? (
          <Loader2 className="w-4 h-4 text-white/20 animate-spin shrink-0" />
        ) : connectedAt !== null ? (
          <button
            onClick={() => void disconnect()}
            className="flex items-center gap-1 px-2 py-1 rounded bg-white/5 hover:bg-red-500/20 text-[10px] text-white/50 hover:text-red-300 shrink-0"
          >
            <Unlink className="w-3 h-3" /> Déconnecter
          </button>
        ) : (
          <button
            onClick={() => void connect()}
            disabled={busy}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-md bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-[11px] text-[#fff] shrink-0"
          >
            <Link2 className="w-3 h-3" /> Connecter
          </button>
        )}
      </div>
      {connectedAt !== null && connectedAt !== undefined && (
        <p className="text-[10px] text-emerald-300/70 px-6">
          ✅ Connecté{connectedAt > 0 ? ` depuis le ${new Date(connectedAt).toLocaleDateString('fr-FR')}` : ''} — Drive + Gmail utilisables côté serveur.
        </p>
      )}

      {isAdmin && (
        <div className="flex flex-col gap-1.5 px-6">
          <div className="text-[10px] text-white/30">
            Client OAuth (Google Cloud Console → Credentials) — l'URI de redirection{' '}
            <code className="text-white/40">{OAUTH_REDIRECT_URI}</code> doit y être ajoutée.
          </div>
          <input
            type="text"
            value={clientId}
            onChange={(e) => setClientId(e.target.value)}
            placeholder="Client ID (…apps.googleusercontent.com)"
            className="w-full bg-background border border-neutral-700 rounded-md px-2 py-1.5 text-[11px] text-white placeholder:text-neutral-600 focus:border-emerald-500 outline-none"
          />
          <div className="flex gap-1.5">
            <input
              type="password"
              autoComplete="off"
              value={clientSecret}
              onChange={(e) => setClientSecret(e.target.value)}
              placeholder="Client Secret (write-only)"
              className="flex-1 bg-background border border-neutral-700 rounded-md px-2 py-1.5 text-[11px] text-white placeholder:text-neutral-600 focus:border-emerald-500 outline-none"
            />
            <button
              onClick={() => void saveOAuthClient()}
              className="px-2.5 py-1 rounded-md bg-white/[0.06] hover:bg-white/[0.1] text-[11px] text-white/70"
            >
              Enregistrer
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
