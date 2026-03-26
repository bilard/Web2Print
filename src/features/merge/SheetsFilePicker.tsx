import { useState, useEffect, useRef } from 'react'
import { Search, Loader2, FileSpreadsheet, LogOut } from 'lucide-react'
import { useGoogleSheetsImport } from './useGoogleSheetsImport'
import type { SheetsFile } from './useGoogleSheetsImport'

interface Props {
  onClose: () => void
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })
}

export function SheetsFilePicker({ onClose }: Props) {
  const { connected, connecting, importing, error, connect, disconnect, listSheetsFiles, importFile } =
    useGoogleSheetsImport()

  const [files, setFiles] = useState<SheetsFile[]>([])
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState('')
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!connected) return
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(async () => {
      setLoading(true)
      const result = await listSheetsFiles(search)
      setFiles(result)
      setLoading(false)
    }, search ? 400 : 0)
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [connected, search]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!connected) {
    return (
      <div className="p-4 flex flex-col items-center gap-3">
        <div className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold text-white"
          style={{ background: 'linear-gradient(135deg,#4285F4,#34A853)' }}>
          G
        </div>
        <p className="text-xs text-white/50 text-center">
          Connectez-vous pour accéder à vos Google Sheets
        </p>
        <button
          onClick={connect}
          disabled={connecting}
          className="flex items-center gap-2 px-4 py-2 rounded-md bg-indigo-500/20 hover:bg-indigo-500/30 text-sm text-indigo-300 transition-colors disabled:opacity-50"
        >
          {connecting ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
          {connecting ? 'Connexion...' : 'Se connecter avec Google'}
        </button>
        {error && <p className="text-xs text-red-400/80 text-center">{error}</p>}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-2 p-3">
      {/* Search + disconnect */}
      <div className="flex items-center gap-1.5">
        <div className="relative flex-1">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/30" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher un fichier..."
            className="w-full pl-7 pr-2 py-1.5 rounded-md bg-white/5 border border-white/10 text-xs text-white/80 placeholder:text-white/25 outline-none focus:border-indigo-500/40"
            autoFocus
          />
        </div>
        <button
          onClick={disconnect}
          title="Déconnecter Google"
          className="p-1.5 rounded-md text-white/30 hover:text-red-400 hover:bg-white/5 transition-colors"
        >
          <LogOut className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* File list */}
      <div className="max-h-52 overflow-y-auto space-y-0.5">
        {loading ? (
          <div className="flex justify-center py-6">
            <Loader2 className="w-5 h-5 text-indigo-400 animate-spin" />
          </div>
        ) : files.length === 0 ? (
          <p className="text-xs text-white/30 text-center py-6">Aucun fichier Google Sheets trouvé</p>
        ) : (
          files.map((file) => (
            <button
              key={file.id}
              onClick={() => importFile(file)}
              disabled={importing !== null}
              className="w-full flex items-center gap-2 px-2 py-2 rounded-md bg-white/5 hover:bg-green-500/10 text-left transition-colors disabled:opacity-50"
            >
              {importing === file.id ? (
                <Loader2 className="w-4 h-4 text-green-400 animate-spin shrink-0" />
              ) : (
                <FileSpreadsheet className="w-4 h-4 text-green-400 shrink-0" />
              )}
              <div className="flex-1 min-w-0">
                <div className="text-xs text-white/80 truncate">{file.name}</div>
                <div className="text-[10px] text-white/30">{formatDate(file.modifiedTime)}</div>
              </div>
            </button>
          ))
        )}
      </div>

      {error && <p className="text-xs text-red-400/80">{error}</p>}
    </div>
  )
}
