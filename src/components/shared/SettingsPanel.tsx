import { useState, useEffect, useMemo, type ReactNode } from 'react'
import { Eye, EyeOff, RotateCcw, User, BarChart2, Plug, HardDrive, CheckCircle2, XCircle, Loader2, Wifi, LogOut, Sparkles, Flame, ChevronUp, ChevronDown, X, Plus, RefreshCw, ExternalLink, KeyRound, CreditCard, Cookie, Trash2 } from 'lucide-react'
import { TelegramSettings } from '@/features/telegram/TelegramSettings'
import { doc, getDoc, setDoc } from 'firebase/firestore'
import { db } from '@/lib/firebase/config'
import { useQueryClient } from '@tanstack/react-query'
import { getSiteCookie, setSiteCookie, removeSiteCookie, listSiteCookies, type SiteCookieEntry } from '@/lib/siteCookies'
import { useAuthStore } from '@/stores/auth.store'
import { useUsageStats } from '@/features/stats/useUsageStats'
import { useGoogleDrive } from '@/features/gdrive/useGoogleDrive'
import { useGDriveStore } from '@/stores/gdrive.store'
import { useGDriveSettings } from '@/features/gdrive/useGDriveSettings'
import { API_KEYS, getApiKey, setApiKey, isApiKeyOverridden, resetApiKey, getEnvDefault, getApiKeyLinks, testApiKey, type ApiTestResult, type ApiTestAction } from '@/lib/apiKeys'
import { AiProviderCard } from './AiProviderCard'
import type { AiProvider } from '@/lib/aiModels'
import { useAiSettingsStore, getSelectedModel, type ReasoningProvider } from '@/stores/aiSettings.store'
import { toast } from 'sonner'

const PROVIDER_LABELS: Record<AiProvider, string> = {
  claude: 'Claude',
  gemini: 'Gemini',
  openai: 'OpenAI',
  deepseek: 'DeepSeek',
  qwen: 'Qwen',
  kimi: 'Kimi',
  openrouter: 'OpenRouter',
}

const USD_TO_EUR = 0.92

function formatEur(usd: number): string {
  const eur = usd * USD_TO_EUR
  if (eur <= 0) {
    return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(0)
  }
  let decimals: number
  if (eur >= 1) decimals = 2
  else if (eur >= 0.01) decimals = 3
  else if (eur >= 0.0001) decimals = 4
  else decimals = 6
  return new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(eur)
}

function formatTokens(n: number): string {
  return n.toLocaleString('fr-FR')
}

type SettingsTab = 'profile' | 'ai' | 'firebase' | 'connectors' | 'cookies' | 'stats'

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
  { id: 'cookies',    label: 'Cookies',       icon: Cookie,    accent: 'text-amber-300' },
  { id: 'stats',      label: 'Statistiques',  icon: BarChart2, accent: 'text-sky-400' },
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

const ClaudeLogo = () => (
  <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 shrink-0" aria-hidden="true">
    <path
      fill="#D97757"
      d="M12 2.4c.4 3.7 2.5 5.8 6.2 6.2l.4.04v.7l-.4.04c-3.7.4-5.8 2.5-6.2 6.2l-.04.4-.7-.04-.04-.4c-.4-3.7-2.5-5.8-6.2-6.2l-.4-.04v-.7l.4-.04c3.7-.4 5.8-2.5 6.2-6.2l.04-.4.7.04.04.4z"
    />
  </svg>
)

const OpenAILogo = () => (
  <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 shrink-0" aria-hidden="true">
    <path
      fill="#FFFFFF"
      d="M22.28 9.82a5.98 5.98 0 0 0-.52-4.91 6.05 6.05 0 0 0-6.51-2.9A6 6 0 0 0 4.98 4.18a5.98 5.98 0 0 0-3.99 2.9 6.05 6.05 0 0 0 .74 7.1 5.98 5.98 0 0 0 .52 4.92 6.05 6.05 0 0 0 6.51 2.9 5.98 5.98 0 0 0 4.51 2.01 6.05 6.05 0 0 0 5.77-4.18 5.98 5.98 0 0 0 3.99-2.9 6.05 6.05 0 0 0-.74-7.1zm-9.02 12.6a4.48 4.48 0 0 1-2.88-1.04l.14-.08 4.78-2.76a.78.78 0 0 0 .39-.68v-6.74l2.02 1.17a.07.07 0 0 1 .04.06v5.58a4.5 4.5 0 0 1-4.5 4.49zM3.6 18.51a4.48 4.48 0 0 1-.54-3l.14.08 4.78 2.76a.78.78 0 0 0 .79 0L14.61 15v2.34a.08.08 0 0 1-.03.06l-4.83 2.79a4.5 4.5 0 0 1-6.15-1.65zm-1.26-10.4a4.48 4.48 0 0 1 2.34-1.97V12.36a.78.78 0 0 0 .39.68l5.84 3.37-2.02 1.17a.07.07 0 0 1-.07 0l-4.83-2.8a4.5 4.5 0 0 1-1.65-6.15zm16.6 3.86l-5.84-3.39 2.02-1.16a.07.07 0 0 1 .07 0l4.83 2.79a4.5 4.5 0 0 1-.68 8.12v-5.69a.78.78 0 0 0-.4-.67zm2.01-3.02l-.14-.09-4.77-2.78a.78.78 0 0 0-.79 0L9.39 9v-2.34a.07.07 0 0 1 .03-.06l4.83-2.78a4.5 4.5 0 0 1 6.69 4.66zM8.29 12.85L6.27 11.69a.07.07 0 0 1-.04-.06V6.05a4.5 4.5 0 0 1 7.38-3.46l-.14.08-4.78 2.76a.78.78 0 0 0-.39.68zm1.1-2.36L12 8.97l2.6 1.5v3l-2.6 1.5-2.6-1.5z"
    />
  </svg>
)

const DeepSeekLogo = () => (
  <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 shrink-0" aria-hidden="true">
    <path
      fill="#4D6BFE"
      d="M22.4 5.32c-.21-.1-.3.09-.42.18-.05.04-.08.08-.13.13-.36.39-.78.65-1.36.62-.85-.05-1.57.22-2.21.87-.13-.79-.58-1.27-1.26-1.57-.36-.16-.72-.31-.97-.65-.18-.24-.23-.51-.32-.78-.05-.16-.11-.33-.3-.36-.21-.03-.29.14-.37.29-.34.62-.47 1.3-.46 1.99.04 1.55.69 2.78 1.99 3.66.15.1.18.21.14.35-.09.31-.19.61-.29.92-.06.2-.16.24-.37.16-.74-.31-1.39-.78-1.95-1.34-.95-.93-1.81-1.95-2.89-2.78-.25-.2-.5-.38-.77-.55-1.13-1.1.41-2 .77-2.13.37-.13.13-.59-1.06-.58-1.19 0-2.27.4-3.66.93-.2.08-.41.14-.62.19-1.21-.23-2.46-.28-3.77-.13-2.46.27-4.42 1.43-5.86 3.42C-.13 9.16-.39 11.69.34 14.31c.77 2.76 2.43 4.83 5.04 6.16 2.7 1.38 5.61 1.45 8.5.59 2.6-.78 4.6-2.42 5.93-4.84.07.04.14.07.21.11 1.18.66 1.51 2.17.71 3.27-.06.08-.13.15-.06.26.06.09.16.05.24.04.45-.05.78-.3 1.08-.62.86-.92 1.07-2.04.94-3.24-.07-.69-.36-1.32-.36-2.02 0-.62.11-1.16.59-1.57.45-.39.94-.46 1.42-.66.57-.24 1.07-.57 1.41-1.13.04-.07.08-.14.06-.23-.01-.13-.13-.16-.21-.18-.29-.07-.55-.18-.81-.29-.27-.11-.45-.36-.43-.65zM11.4 19.85c-3.55 0-6.43-2.92-6.43-6.51s2.88-6.51 6.43-6.51c3.55 0 6.43 2.92 6.43 6.51s-2.88 6.51-6.43 6.51zm.06-9.75c-1.74 0-3.16 1.41-3.16 3.16s1.42 3.16 3.16 3.16c1.74 0 3.16-1.41 3.16-3.16s-1.42-3.16-3.16-3.16zm0 4.97c-.99 0-1.81-.81-1.81-1.81s.81-1.81 1.81-1.81c.99 0 1.81.81 1.81 1.81s-.81 1.81-1.81 1.81z"
    />
  </svg>
)

const KimiLogo = () => (
  <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 shrink-0" aria-hidden="true">
    <circle cx="12" cy="12" r="10" fill="#1F1F1F" />
    <path
      fill="#FFFFFF"
      d="M7.5 7.75h2v3.4l3.4-3.4h2.55l-3.55 3.55 3.7 4.95H13l-2.7-3.7-.8.8v2.9h-2v-8.5zm9 0h2v8.5h-2z"
    />
  </svg>
)

const OpenRouterLogo = () => (
  <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 shrink-0" aria-hidden="true">
    <circle cx="12" cy="12" r="10" fill="#6366f1" />
    <path
      fill="#FFFFFF"
      d="M5 12h6.5l-2.4-2.4 1.4-1.4L15 12l-4.5 4.5-1.4-1.4L11.5 12.7H5v-.7zm9 0h5"
      strokeWidth="1.5"
      stroke="#FFFFFF"
    />
    <circle cx="19.5" cy="12" r="1.5" fill="#FFFFFF" />
  </svg>
)

const QwenLogo = () => (
  <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 shrink-0" aria-hidden="true">
    <path
      fill="#615CED"
      d="M12 2.25 4.5 6.5v8.5L12 19.25 19.5 15V6.5L12 2.25zm0 2.31 5.5 3.12-5.5 3.12-5.5-3.12L12 4.56zM6 9.39l5 2.84v6.27L6 15.66V9.39zm12 0v6.27l-5 2.84v-6.27l5-2.84z"
    />
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

const FirecrawlLogo = () => (
  <svg viewBox="0 0 24 24" className="w-4 h-4 shrink-0 text-orange-400" fill="currentColor" aria-hidden="true">
    <path d="M13.5 2c-.3 0-.5.2-.6.4-1 2.7-2.5 4.4-4.3 6-1.6 1.4-3.6 3.2-3.6 6.6 0 3.5 2.6 7 7 7s7-3.5 7-7.7c0-2-.7-3.7-1.4-5-.9-1.6-1.8-3-1.6-5.1 0-.5-.4-.9-.9-.9-1.4 0-1.6 1-1.6 1.8-.7-1.5-1-2.5-1-3.1z M11 12c1 1 2 1.5 2 3 0 1-.8 2-2 2s-2-1-2-2c0-1.5 1-2 2-3z"/>
  </svg>
)

const ScrapflyLogo = () => (
  <svg viewBox="0 0 24 24" className="w-4 h-4 shrink-0 text-cyan-400" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M3 12h4l3-9 4 18 3-9h4" />
  </svg>
)

const BrightDataLogo = () => (
  <svg viewBox="0 0 24 24" className="w-4 h-4 shrink-0 text-orange-400" fill="currentColor" aria-hidden="true">
    <path d="M12 2L4 7v10l8 5 8-5V7l-8-5zm0 2.5L17 7l-5 3-5-3 5-2.5zM6 8.5l5 3v6l-5-3v-6zm12 0v6l-5 3v-6l5-3z"/>
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
  const [testAction, setTestAction] = useState<ApiTestAction | null>(null)
  const [overridden, setOverridden] = useState(() => isApiKeyOverridden(id))
  const links = getApiKeyLinks(id)

  // Re-test au mount + lors d'une hydratation Firestore (clés synchronisées)
  useEffect(() => {
    const refresh = () => {
      const newValue = getApiKey(id)
      setValue(newValue)
      setOverridden(isApiKeyOverridden(id))
      if (newValue) {
        setTestStatus('testing')
        testApiKey(id).then((r) => { setTestStatus(r.status); setTestMessage(r.message); setTestAction(r.action ?? null) })
      } else {
        setTestStatus('empty')
        setTestMessage('')
        setTestAction(null)
      }
    }
    refresh()
    window.addEventListener('apikeys:hydrated', refresh)
    return () => window.removeEventListener('apikeys:hydrated', refresh)
  }, [id])

  const handleSave = () => {
    setApiKey(id, value)
    setEditing(false)
    setTestStatus('testing')
    setTestMessage('')
    setTestAction(null)
    testApiKey(id).then((r) => { setTestStatus(r.status); setTestMessage(r.message); setTestAction(r.action ?? null) })
  }

  const handleReset = () => {
    resetApiKey(id)
    setValue(getApiKey(id))
    setTestStatus('testing')
    setTestAction(null)
    testApiKey(id).then((r) => { setTestStatus(r.status); setTestMessage(r.message); setTestAction(r.action ?? null) })
  }

  const handleTest = () => {
    setTestStatus('testing')
    setTestMessage('')
    setTestAction(null)
    testApiKey(id).then((r) => { setTestStatus(r.status); setTestMessage(r.message); setTestAction(r.action ?? null) })
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
          {links?.manage && (
            <a
              href={links.manage}
              target="_blank"
              rel="noopener noreferrer"
              title="Gérer la clé API (console provider)"
              className="text-white/20 hover:text-indigo-400 transition-colors p-1 rounded hover:bg-white/5"
            >
              <KeyRound className="w-3 h-3" />
            </a>
          )}
          {links?.billing && (
            <a
              href={links.billing}
              target="_blank"
              rel="noopener noreferrer"
              title="Acheter des crédits / facturation"
              className="text-white/20 hover:text-emerald-400 transition-colors p-1 rounded hover:bg-white/5"
            >
              <CreditCard className="w-3 h-3" />
            </a>
          )}
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
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <p className={`text-[10px] ${testStatus === 'ok' ? 'text-green-400/70' : testStatus === 'error' ? 'text-red-400/70' : 'text-white/20'}`}>
            {testMessage}
          </p>
          {testAction && (
            <a
              href={testAction.url}
              target="_blank"
              rel="noopener noreferrer"
              className={`inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded border transition-colors ${
                testStatus === 'error'
                  ? 'text-red-300 border-red-500/40 hover:bg-red-500/10 hover:border-red-500/60'
                  : 'text-amber-300 border-amber-500/40 hover:bg-amber-500/10 hover:border-amber-500/60'
              }`}
            >
              {testAction.label}
              <ExternalLink className="w-2.5 h-2.5" />
            </a>
          )}
        </div>
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

function BrightDataConnectorRow() {
  // État du test de connectivité. Bright Data est server-side via Cloud Function,
  // donc pas d'input de clé ; on test la chaîne complète Browser → CF → BD via
  // une URL bénigne (httpbin.org/html, ~500 bytes, ~1s, coûte ~$0.003).
  const [testStatus, setTestStatus] = useState<'idle' | 'testing' | 'ok' | 'error'>('idle')
  const [testMessage, setTestMessage] = useState('')

  // Token Bright Data persisté dans Firestore (config/brightdata.apiToken).
  // Lu côté server par les Cloud Functions via getBrightDataToken() avec
  // fallback sur le Secret Manager si Firestore est vide.
  const [tokenEditing, setTokenEditing] = useState(false)
  const [tokenValue, setTokenValue] = useState('')
  const [tokenLoaded, setTokenLoaded] = useState(false)
  const [tokenSaving, setTokenSaving] = useState(false)
  const [tokenVisible, setTokenVisible] = useState(false)
  // Endpoint WSS du Scraping Browser (tier 2 anti-bot), persisté dans config/brightdata.browserWs.
  const [wsValue, setWsValue] = useState('')
  const [wsEditing, setWsEditing] = useState(false)
  const [wsSaving, setWsSaving] = useState(false)
  const [wsVisible, setWsVisible] = useState(false)
  const queryClient = useQueryClient()

  useEffect(() => {
    let cancelled = false
    getDoc(doc(db, 'config/brightdata'))
      .then((snap) => {
        if (cancelled) return
        const data = snap.exists() ? snap.data() : undefined
        const tk = data?.apiToken
        const ws = data?.browserWs
        setTokenValue(typeof tk === 'string' ? tk : '')
        setWsValue(typeof ws === 'string' ? ws : '')
        setTokenLoaded(true)
      })
      .catch(() => { if (!cancelled) setTokenLoaded(true) })
    return () => { cancelled = true }
  }, [])

  const handleSaveToken = async () => {
    setTokenSaving(true)
    try {
      const trimmed = tokenValue.trim()
      await setDoc(doc(db, 'config/brightdata'), { apiToken: trimmed }, { merge: true })
      setTokenEditing(false)
      // Force le rafraîchissement du panneau live BD
      queryClient.invalidateQueries({ queryKey: ['brightDataAccount'] })
    } finally {
      setTokenSaving(false)
    }
  }

  const tokenMasked = tokenValue ? '•'.repeat(8) + tokenValue.slice(-4) : ''

  const handleSaveWs = async () => {
    setWsSaving(true)
    try {
      await setDoc(doc(db, 'config/brightdata'), { browserWs: wsValue.trim() }, { merge: true })
      setWsEditing(false)
    } finally {
      setWsSaving(false)
    }
  }
  // Masque le mot de passe (…:PASSWORD@…) et tronque pour l'affichage.
  const wsMasked = wsValue
    ? wsValue.replace(/:([^:@/]+)@/, ':••••@').replace(/^(.{56}).+$/, '$1…')
    : ''

  const handleTest = async () => {
    setTestStatus('testing')
    setTestMessage('')
    try {
      const { brightDataScrapeHtml, getLastBrightDataError, getLastBrightDataSuccess } = await import('@/features/scraping/core/brightDataFallback')
      const html = await brightDataScrapeHtml('https://httpbin.org/html')
      const err = getLastBrightDataError()
      if (err) {
        setTestStatus('error')
        if (err.code === 'unauthenticated') setTestMessage('Auth Firebase requise — connecte-toi à l\'app')
        else if (err.code === 'balance_exhausted') setTestMessage('Balance Bright Data épuisée — recharger sur le dashboard')
        else if (err.code === 'not_configured') setTestMessage('Cloud Function non déployée ou secret BRIGHTDATA_API_TOKEN absent')
        else if (err.code === 'rate_limited') setTestMessage('Rate limit Bright Data atteint — réessayer dans 1 min')
        else if (err.code === 'timeout') setTestMessage('Timeout 90s — Bright Data a mis trop de temps')
        else setTestMessage(err.message.slice(0, 120))
      } else if (html) {
        const success = getLastBrightDataSuccess()
        setTestStatus('ok')
        if (success) {
          setTestMessage(`OK · ${success.country} · ${(success.lengthBytes / 1024).toFixed(0)} KB · ${(success.durationMs / 1000).toFixed(1)}s`)
        } else {
          setTestMessage('Connecté')
        }
      } else {
        setTestStatus('error')
        setTestMessage('Pas de contenu retourné')
      }
    } catch (e) {
      setTestStatus('error')
      setTestMessage(e instanceof Error ? e.message.slice(0, 120) : 'Erreur inconnue')
    }
  }

  return (
    <div className="bg-white/[0.03] rounded-xl p-3 flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <BrightDataLogo />
          <div>
            <div className="flex items-center gap-1.5">
              <p className="text-xs font-medium text-white/70">Bright Data Web Unlocker</p>
              {testStatus === 'testing' && <Loader2 className="w-3 h-3 text-white/30 animate-spin" />}
              {testStatus === 'ok' && <CheckCircle2 className="w-3 h-3 text-green-400" />}
              {testStatus === 'error' && <XCircle className="w-3 h-3 text-red-400" />}
              {testStatus === 'idle' && <span className="text-[8px] text-violet-300/60 px-1.5 py-0.5 rounded bg-violet-500/10 border border-violet-500/30 uppercase tracking-wider">Server-side</span>}
            </div>
            <p className="text-[10px] text-white/30">Bypass CAPTCHA premium (DataDome/Akamai/PerimeterX) — token éditable ci-dessous</p>
          </div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <a
            href="https://brightdata.com/cp/zones"
            target="_blank"
            rel="noopener noreferrer"
            title="Gérer les zones (Bright Data dashboard)"
            className="text-white/20 hover:text-indigo-400 transition-colors p-1 rounded hover:bg-white/5"
          >
            <KeyRound className="w-3 h-3" />
          </a>
          <a
            href="https://brightdata.com/cp/billing"
            target="_blank"
            rel="noopener noreferrer"
            title="Recharger la balance / facturation"
            className="text-white/20 hover:text-emerald-400 transition-colors p-1 rounded hover:bg-white/5"
          >
            <CreditCard className="w-3 h-3" />
          </a>
          <button
            onClick={handleTest}
            disabled={testStatus === 'testing'}
            title="Tester la Cloud Function (coûte ~$0.003)"
            className="text-white/20 hover:text-indigo-400 transition-colors p-1 rounded hover:bg-white/5 disabled:opacity-30"
          >
            <Wifi className="w-3 h-3" />
          </button>
        </div>
      </div>

      {testMessage && (
        <p className={`text-[10px] ${testStatus === 'ok' ? 'text-green-400/70' : testStatus === 'error' ? 'text-red-400/70' : 'text-white/40'}`}>
          {testMessage}
        </p>
      )}

      {/* Champ API key Bright Data — saisi via UI, stocké dans Firestore,
          lu par les Cloud Functions sans nécessiter de redéploiement */}
      {!tokenLoaded ? (
        <div className="bg-white/5 rounded-lg px-2.5 py-1.5 text-[10px] text-white/30 flex items-center gap-1.5">
          <Loader2 className="w-3 h-3 animate-spin" /> Chargement du token…
        </div>
      ) : tokenEditing ? (
        <div className="flex flex-col gap-1.5">
          <div className="flex gap-1.5">
            <input
              type={tokenVisible ? 'text' : 'password'}
              value={tokenValue}
              onChange={(e) => setTokenValue(e.target.value)}
              placeholder="Coller le token Bright Data API…"
              className="flex-1 bg-white/5 border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-white font-mono focus:outline-none focus:border-violet-500/50"
              autoFocus
            />
            <button onClick={() => setTokenVisible((v) => !v)} className="text-white/30 hover:text-white/60 px-1">
              {tokenVisible ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
            </button>
            <button
              onClick={handleSaveToken}
              disabled={tokenSaving}
              className="text-xs bg-violet-500 hover:bg-violet-600 text-white px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50 flex items-center gap-1"
            >
              {tokenSaving && <Loader2 className="w-3 h-3 animate-spin" />}
              Sauvegarder
            </button>
          </div>
          <p className="text-[10px] text-white/30">
            Stocké dans Firestore <code className="text-violet-300/70">config/brightdata.apiToken</code>.
            Lu par les Cloud Functions sans redéploiement.
          </p>
        </div>
      ) : (
        <button
          onClick={() => setTokenEditing(true)}
          className="text-left text-xs font-mono text-white/40 bg-white/5 rounded-lg px-2.5 py-1.5 hover:bg-white/10 transition-colors truncate flex items-center justify-between"
        >
          <span>{tokenValue ? tokenMasked : '— aucun token configuré (clique pour saisir)'}</span>
          {tokenValue && <span className="text-[9px] text-violet-300/60 ml-2">Firestore</span>}
        </button>
      )}

      {/* Scraping Browser (tier 2) — lien WSS d'une zone « Scraping Browser » Bright Data, pour les
          DataDome les plus durs (Leroy Merlin) que le Web Unlocker ne passe pas. Stocké dans
          config/brightdata.browserWs, lu par la Cloud Function scrapeWithScrapingBrowser. */}
      {tokenLoaded && (
        <div className="flex flex-col gap-1.5 pt-1.5 border-t border-white/[0.06]">
          <p className="text-[10px] text-white/40 font-medium">Scraping Browser (tier 2 — DataDome durs)</p>
          {wsEditing ? (
            <>
              <div className="flex gap-1.5">
                <input
                  type={wsVisible ? 'text' : 'password'}
                  value={wsValue}
                  onChange={(e) => setWsValue(e.target.value)}
                  placeholder="wss://brd-customer-…-zone-…:PASSWORD@brd.superproxy.io:9222"
                  className="flex-1 bg-white/5 border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-white font-mono focus:outline-none focus:border-violet-500/50"
                  autoFocus
                />
                <button onClick={() => setWsVisible((v) => !v)} className="text-white/30 hover:text-white/60 px-1">
                  {wsVisible ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                </button>
                <button
                  onClick={handleSaveWs}
                  disabled={wsSaving}
                  className="text-xs bg-violet-500 hover:bg-violet-600 text-white px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50 flex items-center gap-1"
                >
                  {wsSaving && <Loader2 className="w-3 h-3 animate-spin" />}
                  Sauvegarder
                </button>
              </div>
              <p className="text-[10px] text-white/30">
                Lien WSS de ta zone « Scraping Browser » (≠ Web Unlocker). Stocké dans{' '}
                <code className="text-violet-300/70">config/brightdata.browserWs</code>.
              </p>
            </>
          ) : (
            <button
              onClick={() => setWsEditing(true)}
              className="text-left text-xs font-mono text-white/40 bg-white/5 rounded-lg px-2.5 py-1.5 hover:bg-white/10 transition-colors truncate flex items-center justify-between"
            >
              <span>{wsValue ? wsMasked : '— aucun Scraping Browser (clique pour coller le lien WSS)'}</span>
              {wsValue && <span className="text-[9px] text-violet-300/60 ml-2">Firestore</span>}
            </button>
          )}
        </div>
      )}

      <div className="text-[10px] text-white/30 bg-white/5 rounded-lg px-2.5 py-1.5 leading-relaxed">
        <span className="text-white/50 font-medium">Note :</span> le token saisi ici prend le pas sur le Secret Manager.
        Pour le scope BD requis : <span className="text-white/60">Account read</span> (solde) + <span className="text-white/60">Zone read/write</span> (scraping).
      </div>
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

const CASCADE_PROVIDER_INFO: Record<ReasoningProvider, { label: string; sub: string; logo: React.ReactNode }> = {
  gemini:     { label: 'Gemini',      sub: 'free tier · économique',          logo: <GeminiLogo /> },
  claude:     { label: 'Claude Opus', sub: 'pay-as-you-go · qualité max',     logo: <ClaudeLogo /> },
  openai:     { label: 'OpenAI',      sub: 'GPT · json_schema strict',        logo: <OpenAILogo /> },
  deepseek:   { label: 'DeepSeek',    sub: 'low cost · JSON natif',           logo: <DeepSeekLogo /> },
  qwen:       { label: 'Qwen',        sub: 'multilingue · alternatif',        logo: <QwenLogo /> },
  openrouter: { label: 'OpenRouter',  sub: 'agrégateur · routing multi-LLM',  logo: <OpenRouterLogo /> },
}

const ALL_REASONING_PROVIDERS: ReasoningProvider[] = ['gemini', 'claude', 'openai', 'deepseek', 'qwen', 'openrouter']

function ReasoningCascadeSelector() {
  const cascade = useAiSettingsStore((s) => s.reasoningCascade)
  const setCascade = useAiSettingsStore((s) => s.setReasoningCascade)
  const [adding, setAdding] = useState(false)
  const available = ALL_REASONING_PROVIDERS.filter((p) => !cascade.includes(p))

  const moveUp = (i: number) => {
    if (i === 0) return
    const next = [...cascade]
    ;[next[i - 1], next[i]] = [next[i], next[i - 1]]
    setCascade(next)
  }
  const moveDown = (i: number) => {
    if (i === cascade.length - 1) return
    const next = [...cascade]
    ;[next[i + 1], next[i]] = [next[i], next[i + 1]]
    setCascade(next)
  }
  const remove = (i: number) => {
    if (cascade.length <= 1) return
    setCascade(cascade.filter((_, idx) => idx !== i))
  }
  const add = (p: ReasoningProvider) => {
    setCascade([...cascade, p])
    setAdding(false)
  }

  return (
    <div className="bg-white/[0.03] rounded-xl p-3 flex flex-col gap-2">
      <div className="flex items-start gap-2">
        <Sparkles className="w-3.5 h-3.5 text-violet-400 shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold text-white tracking-tight">Cascade de raisonnement (texte/JSON)</p>
          <p className="text-[10px] text-white/40">
            Pour le scraping produit, la composition Art Director et l'amélioration de prompt. Premier provider essayé en priorité, suivants en fallback automatique.
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-1.5 mt-1">
        {cascade.map((p, i) => {
          const info = CASCADE_PROVIDER_INFO[p]
          const canRemove = cascade.length > 1
          return (
            <div
              key={p}
              className="flex items-center gap-2 bg-white/[0.04] hover:bg-white/[0.06] border border-white/10 rounded-lg px-2.5 py-2 transition-colors"
            >
              <span className="w-5 h-5 rounded bg-violet-500/15 text-violet-300 text-[10px] font-mono font-semibold flex items-center justify-center shrink-0">
                {i + 1}
              </span>
              {info.logo}
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-white">{info.label}</p>
                <p className="text-[10px] text-white/40">{info.sub}</p>
                <p className="text-[9.5px] font-mono text-violet-300/70 mt-0.5 truncate">{getSelectedModel(p as AiProvider)}</p>
              </div>
              <div className="flex items-center gap-0.5 shrink-0">
                <button
                  onClick={() => moveUp(i)}
                  disabled={i === 0}
                  title="Monter"
                  className="text-white/40 hover:text-violet-300 disabled:opacity-20 disabled:cursor-not-allowed p-1 rounded hover:bg-white/5"
                >
                  <ChevronUp className="w-3 h-3" />
                </button>
                <button
                  onClick={() => moveDown(i)}
                  disabled={i === cascade.length - 1}
                  title="Descendre"
                  className="text-white/40 hover:text-violet-300 disabled:opacity-20 disabled:cursor-not-allowed p-1 rounded hover:bg-white/5"
                >
                  <ChevronDown className="w-3 h-3" />
                </button>
                <button
                  onClick={() => remove(i)}
                  disabled={!canRemove}
                  title={canRemove ? 'Retirer' : 'Au moins un provider requis'}
                  className="text-white/40 hover:text-red-400 disabled:opacity-20 disabled:cursor-not-allowed p-1 rounded hover:bg-white/5"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            </div>
          )
        })}
      </div>

      {available.length > 0 && !adding && (
        <button
          onClick={() => setAdding(true)}
          className="flex items-center justify-center gap-1.5 text-xs text-white/50 hover:text-violet-300 bg-white/[0.02] hover:bg-white/[0.04] border border-dashed border-white/10 hover:border-violet-500/30 rounded-lg px-3 py-2 transition-colors"
        >
          <Plus className="w-3 h-3" />
          Ajouter un provider en fallback
        </button>
      )}

      {adding && (
        <div className="flex flex-col gap-1 bg-white/[0.04] border border-violet-500/20 rounded-lg p-1">
          {available.map((p) => {
            const info = CASCADE_PROVIDER_INFO[p]
            return (
              <button
                key={p}
                onClick={() => add(p)}
                className="w-full flex items-center gap-2 px-2 py-1.5 rounded hover:bg-white/[0.06] transition-colors"
              >
                {info.logo}
                <div className="flex-1 text-left min-w-0">
                  <p className="text-xs font-semibold text-white/80">{info.label}</p>
                  <p className="text-[10px] text-white/40">{info.sub}</p>
                </div>
                <Plus className="w-3 h-3 text-violet-400" />
              </button>
            )
          })}
          <button
            onClick={() => setAdding(false)}
            className="text-[10px] text-white/30 hover:text-white/60 px-2 py-1"
          >
            Annuler
          </button>
        </div>
      )}
    </div>
  )
}

function AiTab() {
  const resetToLatest = useAiSettingsStore((s) => s.resetToLatestModels)
  return (
    <div className="flex flex-col gap-2">
      <button
        onClick={() => {
          resetToLatest()
          toast.success('Tous les LLM mis à jour vers leur dernière version')
        }}
        title="Sélectionne le dernier modèle phare de chaque provider (Claude, Gemini, OpenAI, DeepSeek, Qwen, Kimi, OpenRouter)"
        className="flex items-center justify-center gap-1.5 text-xs font-medium text-violet-200 bg-violet-500/15 hover:bg-violet-500/25 border border-violet-500/30 rounded-lg px-3 py-2 transition-colors"
      >
        <RefreshCw className="w-3.5 h-3.5" />
        Mettre à jour tous les LLM (dernières versions)
      </button>
      <ReasoningCascadeSelector />
      <AiProviderCard
        provider="gemini"
        apiKeyId="gemini"
        label="Nano Banana (Gemini)"
        description="Génération d'images IA et raisonnement via Google Gemini"
        logo={<GeminiLogo />}
        apiKeyUrl="https://aistudio.google.com/app/apikey"
        noteForGemini
      />
      <AiProviderCard
        provider="claude"
        apiKeyId="anthropic"
        label="Claude (Anthropic)"
        description="Raisonnement briefs, panier, deck, design"
        logo={<ClaudeLogo />}
        apiKeyUrl="https://console.anthropic.com/settings/keys"
      />
      <AiProviderCard
        provider="openai"
        apiKeyId="openai"
        label="OpenAI"
        description="GPT — fallback ou tâches spécifiques (optionnel)"
        logo={<OpenAILogo />}
        apiKeyUrl="https://platform.openai.com/api-keys"
      />
      <AiProviderCard
        provider="deepseek"
        apiKeyId="deepseek"
        label="DeepSeek"
        description="DeepSeek V4 — raisonnement à faible coût (optionnel)"
        logo={<DeepSeekLogo />}
        apiKeyUrl="https://platform.deepseek.com/api_keys"
      />
      <AiProviderCard
        provider="qwen"
        apiKeyId="qwen"
        label="Qwen (Alibaba)"
        description="Qwen Max / Plus / Turbo via DashScope (optionnel)"
        logo={<QwenLogo />}
        apiKeyUrl="https://dashscope.console.aliyun.com/apiKey"
      />
      <AiProviderCard
        provider="kimi"
        apiKeyId="kimi"
        label="Kimi (Moonshot)"
        description="Kimi Code — endpoint OpenAI-compatible (optionnel)"
        logo={<KimiLogo />}
        apiKeyUrl="https://www.kimi.com/code/console"
      />
      <AiProviderCard
        provider="openrouter"
        apiKeyId="openrouter"
        label="OpenRouter"
        description="Accès unifié à tous les LLM (Claude, GPT, Gemini, Llama, Mistral, Qwen, DeepSeek…)"
        logo={<OpenRouterLogo />}
        apiKeyUrl="https://openrouter.ai/settings/keys"
      />
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
      <div className="bg-white/[0.03] rounded-xl px-4 py-1">
        <StatRow label="Projet" value="web2print-6fe5a" />
      </div>
      {firebaseKeys.map((k) => (
        <ApiKeyRow key={k.id} id={k.id} label={k.label} description={k.description} />
      ))}
    </div>
  )
}

/**
 * Parse le format tableau DevTools → cookie string `NAME=VALUE; ...`
 * Garde UNIQUEMENT les cookies du domaine cible (filtre YouTube, Facebook, etc.)
 */
function parseDevToolsCookieTable(raw: string, targetHostname: string): string {
  const lines = raw.split('\n').map((l) => l.trim()).filter(Boolean)
  const tabLines = lines.filter((l) => l.split('\t').length >= 3)
  if (tabLines.length === 0) return raw.trim()

  // "www.partseurope.eu" → "partseurope.eu"
  const baseDomain = targetHostname.replace(/^www\./, '').toLowerCase()
  const TRACKING_RE = /^(_ga|_gid|_fbp|_fbc|fb\.|bp|gtm|_gat|__utm)/i
  const VALID_NAME_RE = /^[^\s()<>@,;:\\"\/\[\]?={}]+$/
  // Valeurs d'attributs HTTP qui ne sont jamais des noms de cookies
  const HTTP_ATTR_RE = /^(Lax|Strict|None|Secure|HttpOnly|Medium|High|Low|Session)$/i

  const pairs: string[] = []
  for (const line of tabLines) {
    const cols = line.split('\t')
    const name   = cols[0]?.trim()
    const value  = cols[1]?.trim() ?? ''
    const domain = (cols[2]?.trim() ?? '').replace(/^\./, '').toLowerCase()
    if (!name || !VALID_NAME_RE.test(name)) continue
    if (TRACKING_RE.test(name) || HTTP_ATTR_RE.test(name)) continue
    // Garder seulement les cookies du domaine cible
    if (baseDomain && domain && !domain.endsWith(baseDomain)) continue
    pairs.push(`${name}=${value}`)
  }
  return pairs.join('; ')
}

/** Section de gestion des cookies de session par domaine.
 *  Utilisé pour scraper les sites B2B qui cachent les prix derrière un login.
 *  Les cookies sont injectés dans les requêtes Bright Data côté Cloud Function. */
function SiteCookiesSection() {
  const [entries, setEntries] = useState<SiteCookieEntry[]>(() => listSiteCookies())
  const [adding, setAdding] = useState(false)
  const [newHostname, setNewHostname] = useState('')
  const [newCookie, setNewCookie] = useState('')
  const [revealedHost, setRevealedHost] = useState<string | null>(null)
  const [editingHost, setEditingHost] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')
  const [savedFlash, setSavedFlash] = useState<string | null>(null)

  const refresh = () => setEntries(listSiteCookies())

  // Preview toujours en sync avec hostname ET cookie — recalculé à chaque frappe des deux
  const parsedPreview = useMemo(() => {
    if (!newCookie.trim()) return ''
    const hn = newHostname.trim().replace(/^https?:\/\//, '').split('/')[0]
    const parsed = parseDevToolsCookieTable(newCookie, hn)
    return parsed !== newCookie.trim() ? parsed : ''
  }, [newCookie, newHostname])

  const handleAdd = () => {
    const hostname = newHostname.trim().replace(/^https?:\/\//, '').split('/')[0]
    const cookieValue = parsedPreview || parseDevToolsCookieTable(newCookie, hostname) || newCookie.trim()
    if (!hostname || !cookieValue) return
    setSiteCookie(hostname, cookieValue)
    setEntries(listSiteCookies())
    setNewHostname(''); setNewCookie(''); setAdding(false)
    setSavedFlash(hostname)
    setTimeout(() => setSavedFlash(null), 2500)
  }

  const handleDelete = (hostname: string) => {
    removeSiteCookie(hostname)
    refresh()
  }

  const handleSaveEdit = (hostname: string) => {
    const cookieValue = parseDevToolsCookieTable(editValue, hostname)
    if (cookieValue.trim()) setSiteCookie(hostname, cookieValue.trim())
    setEditingHost(null); setEditValue('')
    refresh()
  }

  const maskCookie = (c: string) => c.slice(0, 12) + '••••' + c.slice(-4)

  return (
    <div className="bg-white/[0.03] rounded-xl p-3 flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Cookie className="w-3.5 h-3.5 text-amber-400/70 shrink-0" />
          <div>
            <p className="text-xs font-medium text-white/70">Cookies de session</p>
            <p className="text-[10px] text-white/30">Sites B2B login-gated — injectés automatiquement dans Bright Data</p>
          </div>
        </div>
        <button
          onClick={() => setAdding((v) => !v)}
          title="Ajouter un cookie de session"
          className="text-white/20 hover:text-amber-400 transition-colors p-1 rounded hover:bg-white/5"
        >
          <Plus className="w-3 h-3" />
        </button>
      </div>

      {entries.length > 0 && (
        <div className="flex flex-col gap-1">
          {entries.map((e) => (
            <div key={e.hostname} className={`flex flex-col gap-1 rounded-lg px-2.5 py-1.5 transition-colors ${savedFlash === e.hostname ? 'bg-amber-500/10 border border-amber-500/30' : 'bg-white/5'}`}>
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 min-w-0">
                  {savedFlash === e.hostname && <CheckCircle2 className="w-3 h-3 text-amber-400 shrink-0" />}
                  <span className="text-[11px] text-white/60 font-mono truncate">{e.hostname}</span>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button onClick={() => setRevealedHost(revealedHost === e.hostname ? null : e.hostname)} title="Afficher/masquer" className="text-white/20 hover:text-white/60 p-0.5">
                    {revealedHost === e.hostname ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                  </button>
                  <button onClick={() => { setEditingHost(e.hostname); setEditValue(getSiteCookie(e.hostname)) }} title="Modifier" className="text-white/20 hover:text-amber-400 p-0.5">
                    <RotateCcw className="w-3 h-3" />
                  </button>
                  <button onClick={() => handleDelete(e.hostname)} title="Supprimer" className="text-white/20 hover:text-red-400 p-0.5">
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              </div>
              {editingHost === e.hostname ? (
                <div className="flex flex-col gap-1">
                  <textarea
                    value={editValue}
                    onChange={(ev) => setEditValue(ev.target.value)}
                    rows={3}
                    className="w-full bg-black/40 text-[10px] text-white/70 font-mono rounded px-2 py-1 border border-white/10 focus:outline-none focus:border-amber-500/50 resize-none"
                  />
                  <p className="text-[9px] text-white/20">Coller le tableau DevTools ou un cookie string — parsing automatique</p>
                  <div className="flex gap-1 justify-end">
                    <button onClick={() => setEditingHost(null)} className="text-[10px] text-white/30 hover:text-white/60 px-2 py-0.5">Annuler</button>
                    <button onClick={() => handleSaveEdit(e.hostname)} className="text-[10px] text-amber-400 hover:text-amber-300 px-2 py-0.5">Sauvegarder</button>
                  </div>
                </div>
              ) : (
                <p className="text-[10px] text-white/30 font-mono break-all">
                  {revealedHost === e.hostname ? e.cookie : maskCookie(e.cookie)}
                </p>
              )}
            </div>
          ))}
        </div>
      )}

      {adding && (
        <div className="flex flex-col gap-1.5 bg-white/5 rounded-lg px-2.5 py-2">
          <input
            type="text"
            placeholder="www.partseurope.eu"
            value={newHostname}
            onChange={(e) => setNewHostname(e.target.value)}
            className="w-full bg-black/40 text-[11px] text-white/70 font-mono rounded px-2 py-1 border border-white/10 focus:outline-none focus:border-amber-500/50"
          />
          <textarea
            placeholder={'Coller le tableau DevTools (copier-tout) ou écrire directement :\nPHPSESSID=abc123; user_locale=fr'}
            value={newCookie}
            onChange={(e) => setNewCookie(e.target.value)}
            rows={3}
            className="w-full bg-black/40 text-[10px] text-white/50 font-mono rounded px-2 py-1 border border-white/10 focus:outline-none focus:border-amber-500/50 resize-none"
          />
          {parsedPreview && (
            <div className="bg-amber-500/5 border border-amber-500/20 rounded px-2 py-1">
              <p className="text-[9px] text-amber-400/70 mb-0.5">Tableau détecté → converti en cookie string :</p>
              <p className="text-[10px] text-white/50 font-mono break-all">{parsedPreview}</p>
            </div>
          )}
          <p className="text-[9px] text-white/20 leading-relaxed">
            DevTools → Application → Cookies → sélectionner tout → copier · Tableau auto-parsé (colonnes analytiques ignorées)
          </p>
          <div className="flex gap-1 justify-end">
            <button onClick={() => { setAdding(false); setNewCookie(''); setNewHostname('') }} className="text-[10px] text-white/30 hover:text-white/60 px-2 py-0.5">Annuler</button>
            <button onClick={handleAdd} disabled={!newHostname.trim() || (!newCookie.trim() && !parsedPreview)} className="text-[10px] text-amber-400 hover:text-amber-300 px-2 py-0.5 disabled:opacity-30">Ajouter</button>
          </div>
        </div>
      )}

      {entries.length === 0 && !adding && (
        <p className="text-[10px] text-white/20 text-center py-1">Aucun cookie — cliquer + pour ajouter</p>
      )}
    </div>
  )
}

function ConnectorsTab() {
  return (
    <div className="flex flex-col gap-2">
      <ApiKeyRow id="removebg" label="Remove.bg" description="Suppression de fond d'images" logo={<RemoveBgLogo />} />
      <ApiKeyRow id="jina" label="Jina AI" description="Scraping et recherche web" logo={<JinaLogo />} placeholder="jina_..." />
      <ApiKeyRow id="firecrawl" label="Firecrawl" description="Scraping anti-bot fallback (Akamai, Cloudflare)" logo={<FirecrawlLogo />} placeholder="fc-..." />
      <BrightDataConnectorRow />
      <ApiKeyRow id="scrapfly" label="ScrapFly" description="Réservée — pas de CORS browser-side, en attente d'une Cloud Function proxy" logo={<ScrapflyLogo />} placeholder="scp-live-..." />
      <GDriveConnectorRow />

      {/* ── Telegram ── */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-1.5 px-1 pt-2 text-[10px] font-semibold text-white/30 uppercase tracking-wider">
          <Plug className="w-3 h-3 text-cyan-400/70" />
          Telegram
        </div>
        <div className="bg-white/[0.03] rounded-xl p-3">
          <TelegramSettings />
        </div>
      </div>
    </div>
  )
}

function CookiesTab() {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-start gap-2 px-1 pb-1 text-[11px] text-white/40 leading-relaxed">
        <Cookie className="w-3.5 h-3.5 text-amber-400/70 shrink-0 mt-0.5" />
        <span>
          Cookies de session B2B injectés automatiquement dans Bright Data au moment du scrape — permet
          de récupérer prix et stocks cachés derrière un login. Connecte-toi manuellement dans Chrome,
          copie les cookies depuis DevTools et colle-les ici. Validité typique : 24-72 h selon le site.
        </span>
      </div>
      <SiteCookiesSection />
    </div>
  )
}

function StatsTab() {
  const { data: stats, isLoading, isFetching, refetch, dataUpdatedAt } = useUsageStats()

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

  const providers: AiProvider[] = ['claude', 'gemini', 'openai', 'deepseek', 'qwen', 'kimi', 'openrouter']
  const totalTokensIn = providers.reduce((s, p) => s + stats.aiCost.byProvider[p].tokensIn, 0)
  const totalTokensOut = providers.reduce((s, p) => s + stats.aiCost.byProvider[p].tokensOut, 0)
  const updatedLabel = dataUpdatedAt
    ? new Date(dataUpdatedAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    : null

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between px-1">
        <span className="text-[10px] text-white/25">
          {updatedLabel ? `Mis à jour à ${updatedLabel}` : '—'}
        </span>
        <button
          type="button"
          onClick={() => refetch()}
          disabled={isFetching}
          title="Rafraîchir les données"
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-medium text-white/60 hover:text-white bg-white/[0.04] hover:bg-white/[0.08] border border-white/5 hover:border-white/10 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <RefreshCw className={`w-3 h-3 ${isFetching ? 'animate-spin' : ''}`} />
          Rafraîchir
        </button>
      </div>

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

      <div className="bg-white/[0.03] rounded-xl p-4 flex flex-col gap-2">
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-1.5 text-[10px] font-semibold text-white/30 uppercase tracking-wider">
            <Sparkles className="w-3 h-3" /> Coût IA estimé ce mois
          </div>
          <span className="text-[9px] text-white/20 uppercase">estimation · 1 USD ≈ {USD_TO_EUR.toFixed(2)} €</span>
        </div>
        <div className="flex items-baseline gap-2">
          <p className="text-2xl font-mono text-white/90">{formatEur(stats.aiCost.total)}</p>
          {stats.aiCost.total > 0 && stats.aiCost.total * USD_TO_EUR < 0.01 && (
            <span className="text-[10px] font-mono text-white/30">
              ({(stats.aiCost.total * USD_TO_EUR * 100).toFixed(4)} c)
            </span>
          )}
        </div>
        <div className="flex items-center justify-between text-[10px] font-mono text-white/30 pt-1 pb-1 border-b border-white/5">
          <span>Total tokens</span>
          <span>{formatTokens(totalTokensIn)} in · {formatTokens(totalTokensOut)} out</span>
        </div>
        <div className="flex flex-col gap-1 mt-1">
          {providers.map((p) => {
            const u = stats.aiCost.byProvider[p]
            const hasUsage = u.tokensIn > 0 || u.tokensOut > 0
            return (
              <div key={p} className={`flex items-center justify-between py-1 border-b border-white/5 last:border-0 ${hasUsage ? '' : 'opacity-40'}`}>
                <span className="text-xs text-white/50">{PROVIDER_LABELS[p]}</span>
                <span className="text-[10px] font-mono text-white/40">
                  {formatTokens(u.tokensIn)} in · {formatTokens(u.tokensOut)} out · <span className={hasUsage ? 'text-white/70' : ''}>{formatEur(u.costUsd)}</span>
                </span>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

export function SettingsPanel({
  header,
  aside,
  fillHeight,
}: {
  header?: ReactNode
  /** Colonne secondaire à droite du contenu (ex. panneau live conso LLM). */
  aside?: ReactNode
  /** Mode page (DashboardPage) : occupe toute la hauteur dispo, en-tête (titre +
   *  onglets) FIXE en haut, et chaque colonne (contenu + aside) défile indépendamment.
   *  Absent (ex. SettingsSheet) : en-tête statique, contenu qui flue (le sheet scrolle). */
  fillHeight?: boolean
} = {}) {
  const [activeTab, setActiveTab] = useState<SettingsTab>('connectors')

  const headerBlock = (
    <div className="flex flex-col gap-4 shrink-0">
      {header}
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
    </div>
  )

  const tabContent = (
    <>
      {activeTab === 'profile' && <ProfileTab />}
      {activeTab === 'ai' && <AiTab />}
      {activeTab === 'firebase' && <FirebaseTab />}
      {activeTab === 'connectors' && <ConnectorsTab />}
      {activeTab === 'cookies' && <CookiesTab />}
      {activeTab === 'stats' && <StatsTab />}
    </>
  )

  // ── Mode page : header fixe + 2 colonnes scrollables indépendamment ──
  if (fillHeight) {
    return (
      <div className="h-full min-h-0 flex flex-col gap-5">
        {headerBlock}
        <div className="flex-1 min-h-0 flex gap-6">
          <div className="w-[640px] max-w-full shrink-0 min-w-0 overflow-y-auto -mr-2 pr-2">
            {tabContent}
          </div>
          {aside && (
            <div className="hidden xl:block flex-1 min-w-0 max-w-[640px] min-h-0">
              {aside}
            </div>
          )}
        </div>
      </div>
    )
  }

  // ── Mode simple (SettingsSheet) : en-tête statique, contenu qui flue ──
  return (
    <div className="flex flex-col gap-5">
      {headerBlock}
      <div className="max-w-2xl min-w-0">{tabContent}</div>
    </div>
  )
}
