import { useState, useEffect } from 'react'
import { Key, Eye, EyeOff, RotateCcw, User, BarChart2, Plug, HardDrive, CheckCircle2, XCircle, Loader2, Wifi, LogOut } from 'lucide-react'
import { useAuthStore } from '@/stores/auth.store'
import { useUsageStats } from '@/features/stats/useUsageStats'
import { useGoogleDrive } from '@/features/gdrive/useGoogleDrive'
import { useGDriveStore } from '@/stores/gdrive.store'
import { useGDriveSettings } from '@/features/gdrive/useGDriveSettings'
import { API_KEYS, getApiKey, setApiKey, isApiKeyOverridden, resetApiKey, getEnvDefault, testApiKey, type ApiTestResult } from '@/lib/apiKeys'

function StatRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-white/5 last:border-0">
      <span className="text-xs text-white/40">{label}</span>
      <span className="text-xs font-mono text-white/70">{value}</span>
    </div>
  )
}

function StorageBar({ used, quota }: { used: number; quota: number }) {
  const pct = Math.min(100, (used / quota) * 100)
  const color = pct > 80 ? 'bg-red-500' : pct > 60 ? 'bg-amber-500' : 'bg-indigo-500'
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between text-[10px] text-white/30">
        <span>{used.toFixed(2)} Mo utilisés</span>
        <span>{quota} Mo</span>
      </div>
      <div className="w-full h-1.5 bg-white/10 rounded-full overflow-hidden">
        <div className={`h-full ${color} rounded-full transition-all`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

const FirecrawlLogo = () => (
  <svg viewBox="0 0 24 24" className="w-4 h-4 shrink-0 text-orange-400" fill="currentColor" aria-hidden="true">
    <path d="M12 2C8 2 5 5.5 5 9c0 2.5 1.2 4.7 3 6.1V17a1 1 0 001 1h6a1 1 0 001-1v-1.9c1.8-1.4 3-3.6 3-6.1 0-3.5-3-7-7-7zm-1 15v1h2v-1h-2zm3.7-4.3A5 5 0 0112 14a5 5 0 01-2.7-.3C8.5 13 7 11.1 7 9c0-2.8 2.2-5 5-5s5 2.2 5 5c0 2.1-1.5 4-3.3 4.7z"/>
  </svg>
)

const RemoveBgLogo = () => (
  <svg viewBox="0 0 24 24" className="w-4 h-4 shrink-0 text-blue-400" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="3" y="3" width="18" height="18" rx="3" />
    <path d="M9 3v18M3 9h6M3 15h6" strokeDasharray="2 2" opacity="0.4" />
    <circle cx="15" cy="12" r="4" fill="currentColor" stroke="none" />
  </svg>
)

function ApiKeyRow({ id, label, description, logo, placeholder = 'Entrer la clé API...' }: {
  id: string; label: string; description: string; logo?: React.ReactNode; placeholder?: string
}) {
  const [editing, setEditing] = useState(false)
  const [visible, setVisible] = useState(false)
  const [value, setValue] = useState(() => getApiKey(id))
  const [testStatus, setTestStatus] = useState<ApiTestResult | 'testing' | null>(null)
  const [testMessage, setTestMessage] = useState('')
  const overridden = isApiKeyOverridden(id)

  // Auto-test on mount if key exists
  useEffect(() => {
    const key = getApiKey(id)
    if (key) {
      setTestStatus('testing')
      testApiKey(id).then((r) => { setTestStatus(r.status); setTestMessage(r.message) })
    }
  }, [id])

  const handleSave = () => {
    setApiKey(id, value)
    setEditing(false)
    // Re-test after save
    setTestStatus('testing')
    setTestMessage('')
    testApiKey(id).then((r) => { setTestStatus(r.status); setTestMessage(r.message) })
  }

  const handleReset = () => {
    resetApiKey(id)
    setValue(getApiKey(id))
    setTestStatus('testing')
    testApiKey(id).then((r) => { setTestStatus(r.status); setTestMessage(r.message) })
  }

  const handleTest = () => {
    setTestStatus('testing')
    setTestMessage('')
    testApiKey(id).then((r) => { setTestStatus(r.status); setTestMessage(r.message) })
  }

  return (
    <div className="bg-white/[0.03] rounded-xl p-3 flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <div className={`flex items-center gap-2 ${logo ? '' : 'flex-1 min-w-0'}`}>
          {logo}
          <div className={logo ? undefined : 'flex-1 min-w-0'}>
            <div className="flex items-center gap-2">
              <p className="text-xs font-medium text-white/70">{label}</p>
              {testStatus === 'testing' && <Loader2 className="w-3 h-3 text-white/30 animate-spin" />}
              {testStatus === 'ok' && <CheckCircle2 className="w-3 h-3 text-green-400" />}
              {testStatus === 'error' && <XCircle className="w-3 h-3 text-red-400" />}
              {testStatus === 'empty' && <XCircle className="w-3 h-3 text-white/20" />}
            </div>
            <p className="text-[10px] text-white/30">{description}</p>
          </div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <button onClick={handleTest} title="Tester la connexion" className="text-white/20 hover:text-indigo-400 transition-colors p-1 rounded hover:bg-white/5">
            <Wifi className="w-3 h-3" />
          </button>
          {overridden && (
            <button onClick={handleReset} title="Réinitialiser (utiliser .env)" className="text-white/20 hover:text-amber-400 transition-colors p-1 rounded hover:bg-white/5">
              <RotateCcw className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>

      {/* Status message */}
      {testStatus && testStatus !== 'testing' && testMessage && (
        <p className={`text-[10px] ${testStatus === 'ok' ? 'text-green-400/70' : testStatus === 'error' ? 'text-red-400/70' : 'text-white/20'}`}>
          {testMessage}
        </p>
      )}

      {editing ? (
        <div className="flex gap-1.5">
          <input
            type={visible ? 'text' : 'password'}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            className="flex-1 bg-white/5 border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-white font-mono focus:outline-none focus:border-indigo-500/50"
            placeholder={placeholder}
            autoFocus
          />
          <button onClick={() => setVisible(!visible)} className="text-white/30 hover:text-white/60 px-1">
            {visible ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
          </button>
          <button onClick={handleSave} className="text-xs bg-indigo-500 hover:bg-indigo-600 text-white px-3 py-1.5 rounded-lg transition-colors">
            OK
          </button>
        </div>
      ) : (
        <button
          onClick={() => setEditing(true)}
          className="text-left text-xs font-mono text-white/30 bg-white/5 rounded-lg px-2.5 py-1.5 hover:bg-white/10 transition-colors truncate"
        >
          {overridden ? '••••••••' + value.slice(-4) : getEnvDefault(id)}
          {overridden && <span className="ml-2 text-[9px] text-indigo-400">(personnalisée)</span>}
        </button>
      )}
    </div>
  )
}

function GDriveConnectorRow() {
  const { connected, accountEmail } = useGDriveStore()
  const { connectDrive, disconnect: runtimeDisconnect } = useGoogleDrive()
  const { savedEmail, loading, saveSettings, clearSettings } = useGDriveSettings()
  const [connecting, setConnecting] = useState(false)

  const handleConnect = async () => {
    setConnecting(true)
    try {
      await connectDrive()
      // connectDrive met à jour useGDriveStore — on récupère l'email depuis le store
      const email = useGDriveStore.getState().accountEmail
      if (email) await saveSettings(email)
    } finally {
      setConnecting(false)
    }
  }

  const handleDisconnect = async () => {
    runtimeDisconnect()
    await clearSettings()
  }

  const displayEmail = accountEmail ?? savedEmail
  const isConnected = connected

  const GDriveLogo = () => (
    <svg viewBox="0 0 87.3 78" className="w-4 h-4 shrink-0">
      <path d="M6.6 66.85l3.85 6.65c.8 1.4 1.95 2.5 3.3 3.3l13.75-23.8H1.1c0 1.55.4 3.1 1.2 4.5z" fill="#0066da"/>
      <path d="M43.65 25L29.9 1.2C28.55 2 27.4 3.1 26.6 4.5L1.2 48.5c-.8 1.4-1.2 2.95-1.2 4.5h27.5z" fill="#00ac47"/>
      <path d="M73.55 76.8c1.35-.8 2.5-1.9 3.3-3.3l1.6-2.75 7.65-13.25c.8-1.4 1.2-2.95 1.2-4.5H59.8l5.85 11.65z" fill="#ea4335"/>
      <path d="M43.65 25L57.4 1.2C56.05.4 54.5 0 52.95 0H34.35c-1.55 0-3.1.4-4.45 1.2z" fill="#00832d"/>
      <path d="M59.8 53H27.5L13.75 76.8c1.35.8 2.9 1.2 4.45 1.2h50.9c1.55 0 3.1-.4 4.45-1.2z" fill="#2684fc"/>
      <path d="M73.4 26.5l-12.7-22c-.8-1.4-1.95-2.5-3.3-3.3L43.65 25 59.8 53h27.45c0-1.55-.4-3.1-1.2-4.5z" fill="#ffba00"/>
    </svg>
  )

  return (
    <div className="bg-white/[0.03] rounded-xl p-3 flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <GDriveLogo />
          <div>
            <div className="flex items-center gap-1.5">
              <p className="text-xs font-medium text-white/70">Google Drive</p>
              {loading
                ? <Loader2 className="w-3 h-3 text-white/20 animate-spin" />
                : isConnected
                  ? <CheckCircle2 className="w-3 h-3 text-green-400" />
                  : savedEmail
                    ? <XCircle className="w-3 h-3 text-amber-400" title="Token expiré — reconnexion requise" />
                    : <XCircle className="w-3 h-3 text-white/20" />}
            </div>
            <p className="text-[10px] text-white/30">Accès aux fichiers Google Sheets</p>
          </div>
        </div>
        {(isConnected || savedEmail) && (
          <button onClick={handleDisconnect} title="Déconnecter" className="text-white/20 hover:text-red-400 transition-colors p-1 rounded hover:bg-white/5">
            <LogOut className="w-3 h-3" />
          </button>
        )}
      </div>

      {isConnected ? (
        <div className="text-[10px] text-green-400/70 font-mono bg-white/5 rounded-lg px-2.5 py-1.5 truncate">
          {displayEmail}
        </div>
      ) : savedEmail ? (
        <button
          onClick={handleConnect}
          disabled={connecting}
          className="flex items-center justify-center gap-2 text-xs bg-white/5 hover:bg-white/10 text-amber-300/60 rounded-lg px-3 py-1.5 transition-colors disabled:opacity-50"
        >
          {connecting && <Loader2 className="w-3 h-3 animate-spin" />}
          {connecting ? 'Connexion...' : `Reconnecter ${savedEmail}`}
        </button>
      ) : (
        <button
          onClick={handleConnect}
          disabled={connecting}
          className="flex items-center justify-center gap-2 text-xs bg-white/5 hover:bg-white/10 text-white/60 rounded-lg px-3 py-1.5 transition-colors disabled:opacity-50"
        >
          {connecting && <Loader2 className="w-3 h-3 animate-spin" />}
          {connecting ? 'Connexion...' : 'Connecter Google Drive'}
        </button>
      )}
    </div>
  )
}

export function SettingsPanel() {
  const user = useAuthStore((s) => s.user)
  const { data: stats, isLoading } = useUsageStats()

  return (
    <div className="flex flex-col gap-6">
      {/* Profil */}
      <section>
        <div className="flex items-center gap-2 text-xs font-semibold text-white/30 uppercase tracking-wider mb-3">
          <User className="w-3.5 h-3.5" /> Profil
        </div>
        <div className="flex items-center gap-3 bg-white/5 rounded-xl p-3">
          {user?.photoURL
            ? <img src={user.photoURL} alt="" className="w-10 h-10 rounded-full shrink-0" />
            : <div className="w-10 h-10 rounded-full bg-indigo-500/30 flex items-center justify-center text-indigo-300 font-bold shrink-0">
                {user?.displayName?.[0] ?? '?'}
              </div>
          }
          <div className="min-w-0">
            <p className="text-sm font-medium text-white truncate">{user?.displayName}</p>
            <p className="text-xs text-white/40 truncate">{user?.email}</p>
          </div>
        </div>
      </section>

      {/* Clés API */}
      <section>
        <div className="flex items-center gap-2 text-xs font-semibold text-white/30 uppercase tracking-wider mb-3">
          <Key className="w-3.5 h-3.5" /> Clés API
        </div>
        <div className="flex flex-col gap-2">
          {API_KEYS.filter((k) => k.id !== 'firecrawl').map((k) => (
            <ApiKeyRow key={k.id} id={k.id} label={k.label} description={k.description} />
          ))}
        </div>
      </section>

      {/* Statistiques */}
      <section>
        <div className="flex items-center gap-2 text-xs font-semibold text-white/30 uppercase tracking-wider mb-3">
          <BarChart2 className="w-3.5 h-3.5" /> Statistiques
        </div>
        {isLoading ? (
          <div className="flex flex-col gap-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-6 bg-white/5 rounded animate-pulse" />
            ))}
          </div>
        ) : stats ? (
          <div className="flex flex-col gap-3">
            <div className="bg-white/[0.03] rounded-xl p-3 flex flex-col">
              <StatRow label="Projets" value={String(stats.projectCount)} />
              <StatRow label="Exports ce mois" value={stats.exportCount === 0 ? '—' : String(stats.exportCount)} />
            </div>
            <div className="bg-white/[0.03] rounded-xl p-3 flex flex-col gap-2">
              <div className="flex items-center gap-1.5 text-[10px] font-semibold text-white/30 uppercase tracking-wider mb-1">
                <HardDrive className="w-3 h-3" /> Stockage Firestore
              </div>
              <StorageBar used={stats.storageUsedMb} quota={stats.storageQuotaMb} />
            </div>
          </div>
        ) : (
          <p className="text-xs text-white/30">Impossible de charger les statistiques</p>
        )}
      </section>

      {/* Connecteurs */}
      <section>
        <div className="flex items-center gap-2 text-xs font-semibold text-white/30 uppercase tracking-wider mb-3">
          <Plug className="w-3.5 h-3.5" /> Connecteurs
        </div>
        <div className="flex flex-col gap-2">
          <ApiKeyRow id="firecrawl" label="Firecrawl" description="Scraping et extraction web" logo={<FirecrawlLogo />} placeholder="fc-..." />
          <ApiKeyRow id="removebg" label="Remove.bg" description="Suppression de fond d'images" logo={<RemoveBgLogo />} placeholder="Entrer la clé API..." />
          <GDriveConnectorRow />
        </div>
      </section>

      {/* Version */}
      <div>
        <p className="text-[10px] text-white/20 text-center">Web2Print v0.1.0 · Firebase web2print-6fe5a</p>
      </div>
    </div>
  )
}
