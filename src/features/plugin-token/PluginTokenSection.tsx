// src/features/plugin-token/PluginTokenSection.tsx
import { useEffect, useState } from 'react'
import { Plug, Copy, Trash2, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'
import { usePluginTokens, type PluginToken } from '@/features/plugin-token/usePluginTokens'

export function PluginTokenSection() {
  const { createToken, listTokens, revokeToken } = usePluginTokens()
  const [tokens, setTokens] = useState<PluginToken[]>([])
  const [label, setLabel] = useState('')
  const [freshToken, setFreshToken] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const refresh = () => { listTokens().then(setTokens) }
  useEffect(() => { refresh() }, [])

  const onCreate = async () => {
    setBusy(true)
    try {
      const t = await createToken(label)
      if (t) { setFreshToken(t); setLabel(''); refresh() }
    } finally { setBusy(false) }
  }

  const onCopy = async (value: string) => {
    await navigator.clipboard.writeText(value)
    toast.success('Token copié')
  }

  const onRevoke = async (id: string) => {
    await revokeToken(id)
    refresh()
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
          placeholder="Nom (ex : mon poste)"
          value={label}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => setLabel(e.target.value)}
          className="flex-1 bg-white/[0.05] border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white placeholder-white/30 focus:outline-none focus:border-indigo-500/50"
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
            <code className="flex-1 truncate text-xs text-white">{freshToken}</code>
            <button
              type="button"
              onClick={() => onCopy(freshToken)}
              className="p-1 rounded hover:bg-white/10 text-white/60 hover:text-white transition-colors"
              title="Copier"
            >
              <Copy className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      <div className="space-y-1">
        {tokens.length === 0 && <p className="text-xs text-white/40">Aucun token.</p>}
        {tokens.map((t) => (
          <div key={t.id} className="flex items-center justify-between rounded bg-surface-2 px-3 py-2 text-xs">
            <div className="min-w-0">
              <span className={t.revoked ? 'text-white/40 line-through' : 'text-white'}>{t.label}</span>
              <span className="ml-2 text-white/40">
                {t.lastUsedAt ? `utilisé ${t.lastUsedAt.toLocaleDateString()}` : 'jamais utilisé'}
              </span>
            </div>
            {!t.revoked && (
              <button
                type="button"
                onClick={() => onRevoke(t.id)}
                className="p-1 rounded hover:bg-white/10 text-red-400/70 hover:text-red-400 transition-colors"
                title="Révoquer"
              >
                <Trash2 className="h-4 w-4" />
              </button>
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
