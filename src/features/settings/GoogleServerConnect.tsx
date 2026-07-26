// Connexion Google « accès serveur » (OAuth offline) : autorise UNE FOIS Drive +
// Gmail ; le refresh token est stocké côté serveur (users/{uid}.googleServer) et
// permet aux workflows cron/webhook/Telegram d'utiliser les outils Google sans
// navigateur. Toute la logique vit dans useGoogleServerConnect.
import { useState } from 'react'
import { CloudCog, Link2, Unlink, Loader2, Eye, EyeOff, CheckCircle2, XCircle, Wifi } from 'lucide-react'
import { OAUTH_REDIRECT_URI, useGoogleServerConnect } from './useGoogleServerConnect'

export function GoogleServerConnect() {
  const {
    isAdmin, connectedAt, busy, testStatus, testMessage,
    clientId, setClientId, clientSecret, setClientSecret,
    saveOAuthClient, connect, disconnect, test,
  } = useGoogleServerConnect()
  const [showSecret, setShowSecret] = useState(false)

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex items-start gap-2">
        <CloudCog className="w-4 h-4 text-emerald-400/80 shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-[12px] text-white/80">Google — accès serveur (Drive + Gmail)</span>
            {testStatus === 'testing' && <Loader2 className="w-3 h-3 text-white/30 animate-spin" />}
            {testStatus === 'ok' && <CheckCircle2 className="w-3 h-3 text-green-400" />}
            {testStatus === 'error' && <XCircle className="w-3 h-3 text-red-400" />}
            {testStatus === 'empty' && <XCircle className="w-3 h-3 text-white/20" />}
            {isAdmin && connectedAt != null && (
              <button
                onClick={() => void test()}
                title="Tester la connexion serveur"
                className="text-white/20 hover:text-emerald-400 transition-colors p-1 rounded hover:bg-white/5"
              >
                <Wifi className="w-3 h-3" />
              </button>
            )}
          </div>
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
      {testStatus && testStatus !== 'testing' && testMessage && (
        <p className={`text-[10px] px-6 ${testStatus === 'ok' ? 'text-emerald-300/70' : 'text-red-400/70'}`}>
          {testStatus === 'ok' ? '✅ ' : ''}{testMessage}
          {testStatus === 'ok' && connectedAt != null && connectedAt > 0
            ? ` Connecté depuis le ${new Date(connectedAt).toLocaleDateString('fr-FR')}.`
            : ''}
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
            <div className="relative flex-1">
              <input
                type={showSecret ? 'text' : 'password'}
                autoComplete="off"
                value={clientSecret}
                onChange={(e) => setClientSecret(e.target.value)}
                placeholder="Client Secret (GOCSPX-…)"
                className="w-full bg-background border border-neutral-700 rounded-md pl-2 pr-8 py-1.5 text-[11px] text-white placeholder:text-neutral-600 focus:border-emerald-500 outline-none"
              />
              <button
                type="button"
                onClick={() => setShowSecret((v) => !v)}
                title={showSecret ? 'Masquer le secret' : 'Afficher le secret'}
                className="absolute right-1.5 top-1/2 -translate-y-1/2 p-1 rounded text-white/30 hover:text-white/70"
              >
                {showSecret ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              </button>
            </div>
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
