import { useState, useEffect, useMemo, type ReactNode } from 'react'
import { Eye, EyeOff, RotateCcw, User, BarChart2, Plug, HardDrive, CheckCircle2, Sparkles, Flame, Plus, RefreshCw, Cookie, Trash2, Network, ScrollText, Bot } from 'lucide-react'
import { DataModelDiagram } from '@/features/data-graph/DataModelDiagram'
import { MyActivityTab } from '@/features/access/MyActivityTab'
import {
  FirebaseLogo, GeminiLogo, ClaudeLogo, OpenAILogo, DeepSeekLogo, KimiLogo, GLMLogo,
  OpenRouterLogo, QwenLogo, JinaLogo, RemoveBgLogo, FirecrawlLogo, ScrapflyLogo, GoogleVisionLogo,
} from '@/features/ai/providerLogos'
import { HiggsfieldConnectorRow } from './HiggsfieldConnectorRow'
import { TelegramSettings } from '@/features/telegram/TelegramSettings'
import { PipelineRunsPanel } from './PipelineRunsPanel'
import { GoogleServerConnect } from '@/features/settings/GoogleServerConnect'
import { getSiteCookie, setSiteCookie, removeSiteCookie, listSiteCookies, SITE_COOKIES_HYDRATED_EVENT, SITE_COOKIES_UPDATED_EVENT, type SiteCookieEntry } from '@/lib/siteCookies'
import { BrightDataConnectorRow } from '@/features/scraping/BrightDataConnectorRow'
import { useAuthStore } from '@/stores/auth.store'
import { useIsOwner } from '@/features/auth/useAuth'
import { useUsageStats } from '@/features/stats/useUsageStats'
import { API_KEYS } from '@/lib/apiKeys'
import { useTranslation, intlLocale, type TranslationKey } from '@/lib/i18n'
import { isRemoveBgApiEnabled, setRemoveBgApiEnabled } from '@/features/imaging/removeBackground'
import { UserFontsPanel } from '@/features/fonts/UserFontsPanel'
import { GDriveConnectorRow } from '@/features/gdrive/GDriveConnectorRow'
import { ResumeSetupButton } from '@/features/onboarding/ResumeSetupButton'
import { ApiKeyRow } from './ApiKeyRow'
import { ThemeSettingsSection } from './ThemeSettingsSection'
import { AiProviderCard } from './AiProviderCard'
import type { AiProvider } from '@/lib/aiModels'
import { AiCascadeEditor } from '@/features/ai/AiCascadeEditor'
import { ResetLlmModelsButton } from '@/features/ai/ResetLlmModelsButton'
import { useAccessStore } from '@/stores/access.store'
import { useModuleIntent } from '@/features/navigation/useModuleIntent'
import { PluginTokenSection } from '@/features/plugin-token/PluginTokenSection'

const PROVIDER_LABELS: Record<AiProvider, string> = {
  claude: 'Claude',
  gemini: 'Gemini',
  openai: 'OpenAI',
  deepseek: 'DeepSeek',
  qwen: 'Qwen',
  kimi: 'Kimi',
  glm: 'GLM',
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

type SettingsTab = 'profile' | 'ai' | 'firebase' | 'connectors' | 'cookies' | 'stats' | 'data' | 'activity'

interface TabConfig {
  id: SettingsTab
  labelKey: TranslationKey
  icon: React.ElementType
  accent: string
}

const TABS: TabConfig[] = [
  { id: 'profile',    labelKey: 'settings.tab.profile',    icon: User,       accent: 'text-indigo-400' },
  { id: 'ai',         labelKey: 'settings.tab.ai',         icon: Sparkles,   accent: 'text-violet-400' },
  { id: 'firebase',   labelKey: 'settings.tab.firebase',   icon: Flame,      accent: 'text-amber-400' },
  { id: 'connectors', labelKey: 'settings.tab.connectors', icon: Plug,       accent: 'text-emerald-400' },
  { id: 'cookies',    labelKey: 'settings.tab.cookies',    icon: Cookie,     accent: 'text-amber-300' },
  { id: 'data',       labelKey: 'settings.tab.data',       icon: Network,    accent: 'text-cyan-400' },
  { id: 'stats',      labelKey: 'settings.tab.stats',      icon: BarChart2,  accent: 'text-sky-400' },
  { id: 'activity',   labelKey: 'settings.tab.activity',   icon: ScrollText, accent: 'text-rose-400' },
]

const TAB_PERMISSION: Partial<Record<SettingsTab, string>> = {
  connectors: 'settings.connectors.edit',
  cookies: 'settings.cookies.edit',
}

function StatRow({ labelKey, value }: { labelKey: TranslationKey; value: string }) {
  const { t } = useTranslation()
  return (
    <div className="flex items-center justify-between py-2 border-b border-white/5 last:border-0">
      <span className="text-xs text-white/40">{t(labelKey)}</span>
      <span className="text-xs font-mono text-white/70">{value}</span>
    </div>
  )
}

function StorageBar({ used, quota }: { used: number; quota: number }) {
  const { t } = useTranslation()
  const pct = Math.min(100, (used / quota) * 100)
  const color = pct > 80 ? 'bg-red-500' : pct > 60 ? 'bg-amber-500' : 'bg-indigo-500'
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between text-[10px] text-white/30">
        <span>{t('stats.storage.used', { used: used.toFixed(2) })}</span>
        <span>{t('stats.storage.quota', { quota })}</span>
      </div>
      <div className="w-full h-1.5 bg-white/10 rounded-full overflow-hidden">
        <div className={`h-full ${color} rounded-full transition-all`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

function ProfileTab() {
  const user = useAuthStore((s) => s.user)
  return (
    <div className="flex flex-col gap-3">
      <ThemeSettingsSection />
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
    </div>
  )
}

function AiTab() {
  return (
    <div className="flex flex-col gap-2">
      <ResetLlmModelsButton />
      <AiCascadeEditor />
      <AiProviderCard
        provider="gemini"
        apiKeyId="gemini"
        labelKey="aiCard.gemini.label"
        descriptionKey="aiCard.gemini.desc"
        logo={<GeminiLogo />}
        apiKeyUrl="https://aistudio.google.com/app/apikey"
        noteForGemini
      />
      <AiProviderCard
        provider="claude"
        apiKeyId="anthropic"
        labelKey="aiCard.claude.label"
        descriptionKey="aiCard.claude.desc"
        logo={<ClaudeLogo />}
        apiKeyUrl="https://console.anthropic.com/settings/keys"
        billingUrl="https://platform.claude.com/settings/billing"
      />
      <AiProviderCard
        provider="openai"
        apiKeyId="openai"
        labelKey="aiCard.openai.label"
        descriptionKey="aiCard.openai.desc"
        logo={<OpenAILogo />}
        apiKeyUrl="https://platform.openai.com/api-keys"
      />
      <AiProviderCard
        provider="deepseek"
        apiKeyId="deepseek"
        labelKey="aiCard.deepseek.label"
        descriptionKey="aiCard.deepseek.desc"
        logo={<DeepSeekLogo />}
        apiKeyUrl="https://platform.deepseek.com/api_keys"
      />
      <AiProviderCard
        provider="qwen"
        apiKeyId="qwen"
        labelKey="aiCard.qwen.label"
        descriptionKey="aiCard.qwen.desc"
        logo={<QwenLogo />}
        apiKeyUrl="https://dashscope.console.aliyun.com/apiKey"
      />
      <AiProviderCard
        provider="kimi"
        apiKeyId="kimi"
        labelKey="aiCard.kimi.label"
        descriptionKey="aiCard.kimi.desc"
        logo={<KimiLogo />}
        apiKeyUrl="https://www.kimi.com/code/console"
      />
      <AiProviderCard
        provider="glm"
        apiKeyId="glm"
        labelKey="aiCard.glm.label"
        descriptionKey="aiCard.glm.desc"
        logo={<GLMLogo />}
        apiKeyUrl="https://z.ai/manage-apikey/apikey-list"
      />
      <AiProviderCard
        provider="openrouter"
        apiKeyId="openrouter"
        labelKey="aiCard.openrouter.label"
        descriptionKey="aiCard.openrouter.desc"
        logo={<OpenRouterLogo />}
        apiKeyUrl="https://openrouter.ai/settings/keys"
      />
    </div>
  )
}

function FirebaseTab() {
  const { t } = useTranslation()
  const firebaseKeys = API_KEYS.filter((k) => k.id.startsWith('firebase_'))
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-start gap-2 px-1 pb-1 text-[11px] text-white/40">
        <FirebaseLogo />
        <span>{t('settings.firebase.intro')}</span>
      </div>
      <div className="bg-white/[0.03] rounded-xl px-4 py-1">
        <StatRow labelKey="settings.firebase.project" value="web2print-6fe5a" />
      </div>
      {firebaseKeys.map((k) => (
        <ApiKeyRow key={k.id} id={k.id} labelKey={k.labelKey} descriptionKey={k.descriptionKey} />
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
  const { t } = useTranslation()
  const [entries, setEntries] = useState<SiteCookieEntry[]>(() => listSiteCookies())
  const [adding, setAdding] = useState(false)
  const [newHostname, setNewHostname] = useState('')
  const [newCookie, setNewCookie] = useState('')
  const [revealedHost, setRevealedHost] = useState<string | null>(null)
  const [editingHost, setEditingHost] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')
  const [savedFlash, setSavedFlash] = useState<string | null>(null)

  const refresh = () => setEntries(listSiteCookies())

  // Rafraîchit la liste quand les cookies sont hydratés depuis Firestore (au login) ou
  // modifiés ailleurs — sinon l'affichage resterait figé sur l'état du montage.
  useEffect(() => {
    const onChange = () => setEntries(listSiteCookies())
    window.addEventListener(SITE_COOKIES_HYDRATED_EVENT, onChange)
    window.addEventListener(SITE_COOKIES_UPDATED_EVENT, onChange)
    return () => {
      window.removeEventListener(SITE_COOKIES_HYDRATED_EVENT, onChange)
      window.removeEventListener(SITE_COOKIES_UPDATED_EVENT, onChange)
    }
  }, [])

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
            <p className="text-xs font-medium text-white/70">{t('cookies.title')}</p>
            <p className="text-[10px] text-white/30">{t('cookies.subtitle')}</p>
          </div>
        </div>
        <button
          onClick={() => setAdding((v) => !v)}
          title={t('cookies.add')}
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
                  <button onClick={() => setRevealedHost(revealedHost === e.hostname ? null : e.hostname)} title={t('cookies.toggle')} className="text-white/20 hover:text-white/60 p-0.5">
                    {revealedHost === e.hostname ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                  </button>
                  <button onClick={() => { setEditingHost(e.hostname); setEditValue(getSiteCookie(e.hostname)) }} title={t('cookies.edit')} className="text-white/20 hover:text-amber-400 p-0.5">
                    <RotateCcw className="w-3 h-3" />
                  </button>
                  <button onClick={() => handleDelete(e.hostname)} title={t('cookies.delete')} className="text-white/20 hover:text-red-400 p-0.5">
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
                  <p className="text-[9px] text-white/20">{t('cookies.pasteHint')}</p>
                  <div className="flex gap-1 justify-end">
                    <button onClick={() => setEditingHost(null)} className="text-[10px] text-white/30 hover:text-white/60 px-2 py-0.5">{t('cookies.cancel')}</button>
                    <button onClick={() => handleSaveEdit(e.hostname)} className="text-[10px] text-amber-400 hover:text-amber-300 px-2 py-0.5">{t('cookies.save')}</button>
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
            placeholder={t('cookies.textareaPlaceholder')}
            value={newCookie}
            onChange={(e) => setNewCookie(e.target.value)}
            rows={3}
            className="w-full bg-black/40 text-[10px] text-white/50 font-mono rounded px-2 py-1 border border-white/10 focus:outline-none focus:border-amber-500/50 resize-none"
          />
          {parsedPreview && (
            <div className="bg-amber-500/5 border border-amber-500/20 rounded px-2 py-1">
              <p className="text-[9px] text-amber-400/70 mb-0.5">{t('cookies.detected')}</p>
              <p className="text-[10px] text-white/50 font-mono break-all">{parsedPreview}</p>
            </div>
          )}
          <p className="text-[9px] text-white/20 leading-relaxed">
            {t('settingsPanel.devtoolsApplicationCookies')}
          </p>
          <div className="flex gap-1 justify-end">
            <button onClick={() => { setAdding(false); setNewCookie(''); setNewHostname('') }} className="text-[10px] text-white/30 hover:text-white/60 px-2 py-0.5">{t('cookies.cancel')}</button>
            <button onClick={handleAdd} disabled={!newHostname.trim() || (!newCookie.trim() && !parsedPreview)} className="text-[10px] text-amber-400 hover:text-amber-300 px-2 py-0.5 disabled:opacity-30">{t('cookies.addAction')}</button>
          </div>
        </div>
      )}

      {entries.length === 0 && !adding && (
        <p className="text-[10px] text-white/20 text-center py-1">{t('cookies.empty')}</p>
      )}
    </div>
  )
}

/**
 * Interrupteur du moteur de détourage : rembg (inclus, illimité) est TOUJOURS
 * disponible ; Remove.bg (payant à l'image) ne sert que si activé ici ET clé
 * présente — état dans features/imaging/removeBackground.
 */
function RemoveBgEngineToggle() {
  const { t } = useTranslation()
  const [enabled, setEnabled] = useState(isRemoveBgApiEnabled())
  const toggle = (v: boolean) => { setRemoveBgApiEnabled(v); setEnabled(v) }
  return (
    <div className="bg-white/[0.03] rounded-xl px-3 py-2.5 flex items-center justify-between gap-3">
      <div className="min-w-0">
        <p className="text-xs text-white/70">{t('removebg.toggle')}</p>
        <p className="text-[10px] text-white/30">
          {enabled
            ? t('removebg.on')
            : t('removebg.off')}
        </p>
      </div>
      <button type="button" onClick={() => toggle(!enabled)} title={t(enabled ? 'removebg.disable' : 'removebg.enable')}
        className={`shrink-0 w-9 h-5 rounded-full transition-colors relative ${enabled ? 'bg-indigo-600' : 'bg-white/10'}`}>
        <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ${enabled ? 'left-[18px]' : 'left-0.5'}`} />
      </button>
    </div>
  )
}

function ConnectorsTab() {
  return (
    <div className="flex flex-col gap-2">
      <ApiKeyRow id="google_vision" labelKey="apikeys.googleVision.label" descriptionKey="connectors.googleVision.desc" logo={<GoogleVisionLogo />} placeholder="AIza..." />
      <ApiKeyRow id="removebg" labelKey="apikeys.removebg.label" descriptionKey="connectors.removebg.desc" logo={<RemoveBgLogo />} />
      <RemoveBgEngineToggle />
      <ApiKeyRow id="jina" labelKey="apikeys.jina.label" descriptionKey="connectors.jina.desc" logo={<JinaLogo />} placeholder="jina_..." />
      <ApiKeyRow id="firecrawl" labelKey="apikeys.firecrawl.label" descriptionKey="connectors.firecrawl.desc" logo={<FirecrawlLogo />} placeholder="fc-..." />
      <BrightDataConnectorRow />
      {/* BrowserAct n'est PAS un lecteur d'URL comme les trois précédents : il exécute des
          « bots » construits dans son tableau de bord. Il n'est donc PAS un moteur de
          scraping — l'exécuter page par page polluait la moisson. Usage : le node
          « BrowserAct (bot) » d'un workflow, explicite et ponctuel. */}
      <ApiKeyRow id="browseract" labelKey="apikeys.browseract.label" descriptionKey="connectors.browseract.desc" logo={<Bot className="w-5 h-5 text-teal-300" />} />
      <ApiKeyRow id="scrapfly" labelKey="apikeys.scrapfly.label" descriptionKey="connectors.scrapfly.desc" logo={<ScrapflyLogo />} placeholder="scp-live-..." />
      <HiggsfieldConnectorRow />
      <GDriveConnectorRow />

      {/* ── Mes polices (globales : catalogue, promo…) ── */}
      <div className="bg-white/[0.03] rounded-xl p-3">
        <UserFontsPanel />
      </div>

      {/* ── Google accès serveur (OAuth offline : Drive + Gmail pour cron/webhook/Telegram) ── */}
      <div className="bg-white/[0.03] rounded-xl p-3">
        <GoogleServerConnect />
      </div>

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

      <div className="border-t border-white/10 pt-4 mt-4">
        <PluginTokenSection />
      </div>
    </div>
  )
}

function CookiesTab() {
  const { t } = useTranslation()
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-start gap-2 px-1 pb-1 text-[11px] text-white/40 leading-relaxed">
        <Cookie className="w-3.5 h-3.5 text-amber-400/70 shrink-0 mt-0.5" />
        <span>{t('cookies.intro')}</span>
      </div>
      <SiteCookiesSection />
    </div>
  )
}

function StatsTab() {
  const { t, locale } = useTranslation()
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
    return <p className="text-xs text-white/30">{t('stats.error')}</p>
  }

  const providers: AiProvider[] = ['claude', 'gemini', 'openai', 'deepseek', 'qwen', 'kimi', 'openrouter']
  const totalTokensIn = providers.reduce((s, p) => s + stats.aiCost.byProvider[p].tokensIn, 0)
  const totalTokensOut = providers.reduce((s, p) => s + stats.aiCost.byProvider[p].tokensOut, 0)
  const updatedLabel = dataUpdatedAt
    ? new Date(dataUpdatedAt).toLocaleTimeString(intlLocale(locale), { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    : null

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between px-1">
        <span className="text-[10px] text-white/25">
          {updatedLabel ? t('stats.updatedAt', { time: updatedLabel }) : '—'}
        </span>
        <button
          type="button"
          onClick={() => refetch()}
          disabled={isFetching}
          title={t('stats.refresh.title')}
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-medium text-white/60 hover:text-white bg-white/[0.04] hover:bg-white/[0.08] border border-white/5 hover:border-white/10 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <RefreshCw className={`w-3 h-3 ${isFetching ? 'animate-spin' : ''}`} />
          {t('stats.refresh')}
        </button>
      </div>

      <div className="bg-white/[0.03] rounded-xl p-4">
        <StatRow labelKey="stats.projects" value={String(stats.projectCount)} />
      </div>

      <div className="bg-white/[0.03] rounded-xl p-4 flex flex-col gap-2">
        <div className="flex items-center gap-1.5 text-[10px] font-semibold text-white/30 uppercase tracking-wider mb-1">
          <HardDrive className="w-3 h-3" /> {t('stats.storage')}
        </div>
        <StorageBar used={stats.storageUsedMb} quota={stats.storageQuotaMb} />
      </div>

      <div className="bg-white/[0.03] rounded-xl p-4 flex flex-col gap-2">
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-1.5 text-[10px] font-semibold text-white/30 uppercase tracking-wider">
            <Sparkles className="w-3 h-3" /> {t('stats.aiCost')}
          </div>
          <span className="text-[9px] text-white/20 uppercase">{t('stats.estimate', { rate: USD_TO_EUR.toFixed(2) })}</span>
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
          <span>{t('stats.totalTokens')}</span>
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

      <PipelineRunsPanel />
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
  const { t } = useTranslation()
  const [activeTab, setActiveTab] = useState<SettingsTab>('connectors')
  // Les clés Firebase (config du backend partagé) ne sont montrées qu'au propriétaire.
  const isOwner = useIsOwner()
  const permissions = useAccessStore((s) => s.permissions)
  const canTab = (id: SettingsTab) => {
    if (id === 'firebase' || id === 'data') return isOwner
    const perm = TAB_PERMISSION[id]
    return isOwner || !perm || permissions.has(perm)
  }
  // `(tab)` et non `(t)` : la lambda masquerait la fonction de traduction.
  const visibleTabs = TABS.filter((tab) => canTab(tab.id))

  useModuleIntent('settings', (action) => {
    if (action.startsWith('tab:')) {
      const tab = action.slice('tab:'.length) as SettingsTab
      if (canTab(tab)) setActiveTab(tab)
    }
  })

  const headerBlock = (
    <div className="flex flex-col gap-4 shrink-0">
      {header}
      <ResumeSetupButton variant="banner" />
      <nav
        aria-label={t('settings.nav')}
        className="flex flex-wrap gap-1 bg-white/[0.02] border border-white/5 rounded-xl p-1"
      >
        {visibleTabs.map(({ id, labelKey, icon: Icon, accent }) => {
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
              {t(labelKey)}
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
      {activeTab === 'firebase' && isOwner && <FirebaseTab />}
      {activeTab === 'connectors' && canTab('connectors') && <ConnectorsTab />}
      {activeTab === 'cookies' && canTab('cookies') && <CookiesTab />}
      {activeTab === 'stats' && <StatsTab />}
      {activeTab === 'activity' && <MyActivityTab />}
      {activeTab === 'data' && isOwner && <DataModelDiagram />}
    </>
  )

  // ── Mode page : header fixe + 2 colonnes scrollables indépendamment ──
  if (fillHeight) {
    // L'onglet Données (diagramme ERD) occupe toute la largeur dispo.
    if (activeTab === 'data' && isOwner) {
      return (
        <div className="h-full min-h-0 flex flex-col gap-5">
          {headerBlock}
          <div className="flex-1 min-h-0"><DataModelDiagram /></div>
        </div>
      )
    }
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
