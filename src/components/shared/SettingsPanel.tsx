import { useState, useEffect } from 'react'
import { Eye, EyeOff, RotateCcw, User, BarChart2, Plug, HardDrive, CheckCircle2, XCircle, Loader2, Wifi, LogOut, Sparkles, Flame, Info } from 'lucide-react'
import { useAuthStore } from '@/stores/auth.store'
import { useUsageStats } from '@/features/stats/useUsageStats'
import { useGoogleDrive } from '@/features/gdrive/useGoogleDrive'
import { useGDriveStore } from '@/stores/gdrive.store'
import { useGDriveSettings } from '@/features/gdrive/useGDriveSettings'
import { API_KEYS, getApiKey, setApiKey, isApiKeyOverridden, resetApiKey, getEnvDefault, testApiKey, type ApiTestResult } from '@/lib/apiKeys'

type SettingsTab = 'profile' | 'ai' | 'firebase' | 'connectors' | 'stats' | 'about'

interface TabConfig {
  id: SettingsTab
  label: string
  icon: React.ElementType
  accent: string
}

const TABS: TabConfig[] = [
  { id: 'profile',    label: 'Profil',        icon: User,      accent: 'text-indigo-400' },
  { id: 'ai',         label: 'IA',            icon: Sparkles,  accent: 'text-violet-400' },
  { id: 'firebase',   label: 'Firebase',      icon: Flame,     accent: 'text-amber-400' },
  { id: 'connectors', label: 'Connecteurs',   icon: Plug,      accent: 'text-emerald-400' },
  { id: 'stats',      label: 'Statistiques',  icon: BarChart2, accent: 'text-sky-400' },
  { id: 'about',      label: 'À propos',      icon: Info,      accent: 'text-white/60' },
]

const FirebaseLogo = () => (
  <svg viewBox="0 0 256 351" className="w-3.5 h-3.5 shrink-0" aria-hidden="true">
    <path fill="#FFC24A" d="M0 282.998l2.123-2.6L102.527 89.32l.212-2.018L58.78 4.341C55.097-2.586 44.802-.845 43.572 6.896L0 282.998z"/>
    <path fill="#FFA712" d="M2.86 281.317L4.581 277.992 102.422 88.638 58.546 4.262C54.9-2.595 46.169-.749 44.94 6.93L2.86 281.317z"/>
    <path fill="#F4BD62" d="M135.005 150.38l32.955-33.75-32.965-62.93c-3.127-5.969-11.866-5.954-14.962.022L102.42 88.6v2.86l32.585 58.92z"/>
    <path fill="#FFA50E" d="M134.795 150.272l32.057-32.829-32.056-61.075c-3.043-5.804-10.67-6.348-13.673-.522L102.6 92.703l-.296 1.005 32.491 56.564z"/>
    <path fill="#F6820C" d="M0 282.998l.962-.968 3.496-1.42 128.477-128 1.628-4.431-32.05-61.074L0 282.998z"/>
    <path fill="#FDE068" d="M139.121 347.551l116.275-64.847L222.27 77.678c-1.039-6.398-8.888-8.927-13.468-4.34L0 282.998l115.608 64.548a24.126 24.126 0 0 0 23.513.005"/>
    <path fill="#FCCA3F" d="M254.354 282.16L221.402 78.117c-1.03-6.35-7.558-8.94-12.103-4.4L1.29 282.6l114.339 63.908a23.943 23.943 0 0 0 23.334.006L254.354 282.16z"/>
    <path fill="#EEAB37" d="M139.12 345.64a24.126 24.126 0 0 1-23.512-.005L.931 282.015l-.93.983 115.607 64.548a24.126 24.126 0 0 0 23.513.005l116.275-64.847-.285-1.752-115.99 64.689z"/>
  </svg>
)

const GeminiLogo = () => (
  <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 shrink-0" aria-hidden="true">
    <path fill="url(#gemini-g)" d="M12 0c.6 6 5.4 10.8 11.4 11.4v1.2C17.4 13.2 12.6 18 12 24c-.6-6-5.4-10.8-11.4-11.4v-1.2C6.6 10.8 11.4 6 12 0z"/>
    <defs>
      <linearGradient id="gemini-g" x1="0" y1="0" x2="24" y2="24">
        <stop offset="0%" stopColor="#4796E1"/>
        <stop offset="50%" stopColor="#9168C0"/>
        <stop offset="100%" stopColor="#E84B7D"/>
      </linearGradient>
    </defs>
  </svg>
)

const JinaLogo = () => (
  <svg viewBox="0 0 24 24" className="w-4 h-4 shrink-0 text-amber-400" fill="currentColor" aria-hidden="true">
    <path d="M12 2a10 10 0 100 20 10 10 0 000-20zm0 3a2 2 0 110 4 2 2 0 010-4zm0 14a7.5 7.5 0 01-5.5-2.4c.3-1.8 2.6-3.1 5.5-3.1s5.2 1.3 5.5 3.1A7.5 7.5 0 0112 19z"/>
  </svg>
)

const RemoveBgLogo = () => (
  <svg viewBox="0 0 24 24" className="w-4 h-4 shrink-0 text-blue-400" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="3" y="3" width="18" height="18" rx="3" />
    <path d="M9 3v18M3 9h6M3 15h6" strokeDasharray="2 2" opacity="0.4" />
    <circle cx="15" cy="12" r="4" fill="currentColor" stroke="none" />
  </svg>
)

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

function ApiKeyRow({ id, label, description, logo, placeholder = 'Entrer la clé API...' }: {
  id: string; label: string; description: string; logo?: React.ReactNode; placeholder?: string
}) {
  const [editing, setEditing] = useState(false)
  const [visible, setVisible] = useState(false)
  const [value, setValue] = useState(() => getApiKey(id))
  const [testStatus, setTestStatus] = useState<ApiTestResult | 'testing' | null>(null)
  const [testMessage, setTestMessage] = useState('')
  const overridden = isApiKeyOverridden(id)

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
                    ? <XCircle className="w-3 h-3 text-amber-400" />
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

function ProfileTab() {
  const user = useAuthStore((s) => s.user)
  return (
    <div className="bg-white/[0.03] rounded-xl p-4 flex items-center gap-4">
      {user?.photoURL
        ? <img src={user.photoURL} alt="" className="w-14 h-14 rounded-full shrink-0 ring-1 ring-white/10" />
        : <div className="w-14 h-14 rounded-full bg-indigo-500/30 flex items-center justify-center text-indigo-300 font-bold text-xl shrink-0">
            {user?.displayName?.[0] ?? '?'}
          </div>
      }
      <div className="min-w-0 flex-1">
        <p className="text-base font-medium text-white truncate">{user?.displayName}</p>
        <p className="text-xs text-white/40 truncate">{user?.email}</p>
      </div>
    </div>
  )
}

function AiTab() {
  return (
    <div className="flex flex-col gap-2">
      <ApiKeyRow id="gemini" label="Nano Banana (Gemini)" description="Génération d'images IA via Google Gemini" logo={<GeminiLogo />} />
      <ApiKeyRow id="anthropic" label="Claude (Anthropic)" description="Claude Opus 4.7 — raisonnement briefs, panier, deck" placeholder="sk-ant-..." />
      <ApiKeyRow id="openai" label="OpenAI" description="GPT — fallback ou tâches spécifiques (optionnel)" placeholder="sk-..." />
    </div>
  )
}

function FirebaseTab() {
  const firebaseKeys = API_KEYS.filter((k) => k.id.startsWith('firebase_'))
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-start gap-2 px-1 pb-1 text-[11px] text-white/40">
        <FirebaseLogo />
        <span>Configuration du backend (authentification, base de données, stockage)</span>
      </div>
      {firebaseKeys.map((k) => (
        <ApiKeyRow key={k.id} id={k.id} label={k.label} description={k.description} />
      ))}
    </div>
  )
}

function ConnectorsTab() {
  return (
    <div className="flex flex-col gap-2">
      <ApiKeyRow id="removebg" label="Remove.bg" description="Suppression de fond d'images" logo={<RemoveBgLogo />} />
      <ApiKeyRow id="jina" label="Jina AI" description="Scraping et recherche web" logo={<JinaLogo />} placeholder="jina_..." />
      <GDriveConnectorRow />
    </div>
  )
}

function StatsTab() {
  const { data: stats, isLoading } = useUsageStats()

  if (isLoading) {
    return (
      <div className="flex flex-col gap-2">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-16 bg-white/5 rounded-xl animate-pulse" />
        ))}
      </div>
    )
  }
  if (!stats) {
    return <p className="text-xs text-white/30">Impossible de charger les statistiques</p>
  }
  return (
    <div className="flex flex-col gap-2">
      <div className="bg-white/[0.03] rounded-xl p-4">
        <StatRow label="Projets" value={String(stats.projectCount)} />
        <StatRow label="Exports ce mois" value={stats.exportCount === 0 ? '—' : String(stats.exportCount)} />
      </div>
      <div className="bg-white/[0.03] rounded-xl p-4 flex flex-col gap-2">
        <div className="flex items-center gap-1.5 text-[10px] font-semibold text-white/30 uppercase tracking-wider mb-1">
          <HardDrive className="w-3 h-3" /> Stockage Firestore
        </div>
        <StorageBar used={stats.storageUsedMb} quota={stats.storageQuotaMb} />
      </div>
    </div>
  )
}

function AboutTab() {
  return (
    <div className="bg-white/[0.03] rounded-xl p-4">
      <StatRow label="Version" value="v0.1.0" />
      <StatRow label="Projet Firebase" value="web2print-6fe5a" />
    </div>
  )
}

export function SettingsPanel() {
  const [activeTab, setActiveTab] = useState<SettingsTab>('profile')

  return (
    <div className="flex flex-col gap-5">
      {/* Tab navigation */}
      <nav
        aria-label="Sections des paramètres"
        className="flex flex-wrap gap-1 bg-white/[0.02] border border-white/5 rounded-xl p-1"
      >
        {TABS.map(({ id, label, icon: Icon, accent }) => {
          const isActive = activeTab === id
          return (
            <button
              key={id}
              type="button"
              onClick={() => setActiveTab(id)}
              aria-current={isActive ? 'page' : undefined}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium transition-colors ${
                isActive
                  ? 'bg-white/[0.06] text-white'
                  : 'text-white/45 hover:text-white/80 hover:bg-white/[0.03]'
              }`}
            >
              <Icon className={`w-3.5 h-3.5 ${isActive ? accent : 'opacity-60'}`} />
              {label}
            </button>
          )
        })}
      </nav>

      {/* Tab content */}
      <div className="max-w-2xl">
        {activeTab === 'profile' && <ProfileTab />}
        {activeTab === 'ai' && <AiTab />}
        {activeTab === 'firebase' && <FirebaseTab />}
        {activeTab === 'connectors' && <ConnectorsTab />}
        {activeTab === 'stats' && <StatsTab />}
        {activeTab === 'about' && <AboutTab />}
      </div>
    </div>
  )
}
