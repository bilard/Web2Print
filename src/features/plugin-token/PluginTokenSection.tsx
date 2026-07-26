import { useEffect, useState } from 'react'
import { Plug, Copy, Trash2, RefreshCw, X, Eye, EyeOff } from 'lucide-react'
import { toast } from 'sonner'
import { usePluginTokens, type PluginToken } from '@/features/plugin-token/usePluginTokens'

export function PluginTokenSection() {
  const { createToken, listTokens, deleteToken } = usePluginTokens()
  const [tokens, setTokens] = useState<PluginToken[]>([])
  const [tokenKey, setTokenKey] = useState('')
  const [freshToken, setFreshToken] = useState<string | null>(null)
  const [showToken, setShowToken] = useState(false)
  const [revealedKeys, setRevealedKeys] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState(false)

  const refresh = () => { listTokens().then(setTokens) }
  useEffect(() => { refresh() }, [])

  const onCreate = async () => {
    setBusy(true)
    try {
      const t = await createToken(tokenKey)
      if (t) { setFreshToken(t); setShowToken(false); setTokenKey(''); refresh() }
    } finally { setBusy(false) }
  }

  const onCopy = async (value: string) => {
    await navigator.clipboard.writeText(value)
    toast.success('Token copié')
  }

  const onDelete = async (id: string) => {
    await deleteToken(id)
    refresh()
  }

  const toggleKey = (id: string) => {
    setRevealedKeys((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-sm font-medium text-white">
        <Plug className="h-4 w-4" /> Token du plugin InDesign
      </div>
      <p className="text-xs text-white/50">
        Génère un token, colle-le une fois dans le panneau Web2Print d'InDesign. Lecture seule de tes dataSets.
      </p>

      <div className="flex gap-2">
        <input
          type="text"
          placeholder="KEY (ex : poste-fabrication)"
          value={tokenKey}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => setTokenKey(e.target.value)}
          className="flex-1 bg-well border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white placeholder-white/30 focus:outline-none focus:border-indigo-500/50"
        />
        <button
          type="button"
          onClick={onCreate}
          disabled={busy}
          className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-xs text-white font-medium transition-colors"
        >
          Générer
        </button>
      </div>

      {freshToken && (
        <div className="rounded-md bg-well p-3 space-y-2">
          <p className="text-xs text-amber-400">Copie ce token maintenant — il ne sera plus affiché.</p>
          <div className="flex items-center gap-2">
            <code className="flex-1 truncate text-xs text-white">
              {showToken ? freshToken : '•'.repeat(Math.min(freshToken.length, 40))}
            </code>
            <button
              type="button"
              onClick={() => setShowToken((v) => !v)}
              className="p-1 rounded hover:bg-white/10 text-white/60 hover:text-white transition-colors"
              title={showToken ? 'Masquer' : 'Afficher'}
            >
              {showToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
            <button
              type="button"
              onClick={() => onCopy(freshToken)}
              className="p-1 rounded hover:bg-white/10 text-white/60 hover:text-white transition-colors"
              title="Copier"
            >
              <Copy className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => setFreshToken(null)}
              className="p-1 rounded hover:bg-white/10 text-white/50 hover:text-white transition-colors"
              title="Fermer"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      <div className="space-y-1">
        {tokens.length === 0 && <p className="text-xs text-white/40">Aucun token.</p>}
        {tokens.map((t) => (
          <div key={t.id} className="rounded bg-surface-2 px-3 py-2 text-xs">
            <div className="flex items-center justify-between">
              <div className="min-w-0 flex items-center gap-2">
                <span className="text-white truncate">{t.label}</span>
                <button
                  type="button"
                  onClick={() => toggleKey(t.id)}
                  className="p-0.5 rounded hover:bg-white/10 text-white/40 hover:text-white transition-colors shrink-0"
                  title={revealedKeys.has(t.id) ? 'Masquer la KEY' : 'Voir la KEY'}
                >
                  {revealedKeys.has(t.id) ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                </button>
                <span className="text-white/40 shrink-0">
                  {t.lastUsedAt ? `utilisé ${t.lastUsedAt.toLocaleDateString()}` : 'jamais utilisé'}
                </span>
              </div>
              <button
                type="button"
                onClick={() => onDelete(t.id)}
                className="p-1 rounded hover:bg-white/10 text-red-400/70 hover:text-red-400 transition-colors shrink-0"
                title="Supprimer"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
            {revealedKeys.has(t.id) && (
              <div className="mt-1.5 flex items-center gap-2">
                {t.token ? (
                  <>
                    <code className="flex-1 truncate text-white/80 bg-well rounded px-2 py-1">{t.token}</code>
                    <button
                      type="button"
                      onClick={() => onCopy(t.token as string)}
                      className="p-1 rounded hover:bg-white/10 text-white/60 hover:text-white transition-colors shrink-0"
                      title="Copier"
                    >
                      <Copy className="h-4 w-4" />
                    </button>
                  </>
                ) : (
                  <span className="text-white/40 italic">Valeur indisponible — régénère ce token pour pouvoir l'afficher.</span>
                )}
              </div>
            )}
          </div>
        ))}
        <button
          type="button"
          onClick={refresh}
          className="flex items-center gap-1 text-xs text-white/50 hover:text-white/70 px-1 py-0.5 transition-colors"
        >
          <RefreshCw className="h-3 w-3" /> Rafraîchir
        </button>
      </div>
    </div>
  )
}
