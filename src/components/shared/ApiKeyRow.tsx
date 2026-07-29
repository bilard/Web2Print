import { useState, useEffect, type ReactNode } from 'react'
import { Eye, EyeOff, RotateCcw, CheckCircle2, XCircle, Loader2, Wifi, ExternalLink, KeyRound } from 'lucide-react'
import {
  getApiKey, setApiKey, isApiKeyOverridden, resetApiKey, getEnvDefault, getApiKeyLinks,
  testApiKey, type ApiTestResult, type ApiTestAction,
} from '@/lib/apiKeys'
import { API_KEYS_HYDRATED_EVENT } from '@/features/settings/useApiKeysSync'
import { useTranslation, type TranslationKey } from '@/lib/i18n'

/**
 * Ligne d'édition d'une clé API : input masqué, test de connexion, liens console,
 * réinitialisation vers le `.env`. Partagée entre le SettingsPanel et le wizard
 * d'onboarding des clés IA.
 */
export function ApiKeyRow({ id, labelKey, descriptionKey, logo, placeholder, placeholderKey }: {
  id: string
  labelKey: TranslationKey
  descriptionKey: TranslationKey
  logo?: ReactNode
  /** Exemple de format de clé (ex. « AIza… ») — jamais traduit, c'est un motif. */
  placeholder?: string
  /** Invite traduite, quand il n'y a pas de motif à montrer. */
  placeholderKey?: TranslationKey
}) {
  const { t } = useTranslation()
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
    window.addEventListener(API_KEYS_HYDRATED_EVENT, refresh)
    return () => window.removeEventListener(API_KEYS_HYDRATED_EVENT, refresh)
  }, [id])

  const handleSave = () => {
    setApiKey(id, value)
    setEditing(false)
    setOverridden(isApiKeyOverridden(id))
    setTestStatus('testing')
    setTestMessage('')
    setTestAction(null)
    testApiKey(id).then((r) => { setTestStatus(r.status); setTestMessage(r.message); setTestAction(r.action ?? null) })
  }

  const handleReset = () => {
    resetApiKey(id)
    setValue(getApiKey(id))
    setOverridden(isApiKeyOverridden(id))
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
              <p className="text-xs font-medium text-white/70">{t(labelKey)}</p>
              {testStatus === 'testing' && <Loader2 className="w-3 h-3 text-white/30 animate-spin" />}
              {testStatus === 'ok' && <CheckCircle2 className="w-3 h-3 text-green-400" />}
              {testStatus === 'error' && <XCircle className="w-3 h-3 text-red-400" />}
              {testStatus === 'empty' && <XCircle className="w-3 h-3 text-white/20" />}
            </div>
            <p className="text-[10px] text-white/30">{t(descriptionKey)}</p>
          </div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {links?.manage && (
            <a
              href={links.manage}
              target="_blank"
              rel="noopener noreferrer"
              title={t('apikey.manage')}
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
              title={t('apikey.billing')}
              className="flex items-center gap-1 text-[10px] text-amber-400/70 hover:text-amber-300 transition-colors"
            >
              <span>{t('apikey.billing.short')}</span>
              <ExternalLink className="w-3 h-3" />
            </a>
          )}
          <button onClick={handleTest} title={t('apikey.test')} className="text-white/20 hover:text-indigo-400 transition-colors p-1 rounded hover:bg-white/5">
            <Wifi className="w-3 h-3" />
          </button>
          {overridden && (
            <button onClick={handleReset} title={t('apikey.reset')} className="text-white/20 hover:text-amber-400 transition-colors p-1 rounded hover:bg-white/5">
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
              {t(testAction.labelKey)}
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
            placeholder={placeholder ?? t(placeholderKey ?? 'apikey.placeholder')}
            autoFocus
          />
          <button onClick={() => setVisible(!visible)} className="text-white/30 hover:text-white/60 px-1">
            {visible ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
          </button>
          <button onClick={handleSave} className="text-xs bg-indigo-500 hover:bg-indigo-600 text-[#fff] px-3 py-1.5 rounded-lg transition-colors">
            OK
          </button>
        </div>
      ) : (
        <button
          onClick={() => setEditing(true)}
          className="text-left text-xs font-mono text-white/30 bg-white/5 rounded-lg px-2.5 py-1.5 hover:bg-white/10 transition-colors truncate"
        >
          {overridden ? '••••••••' + value.slice(-4) : getEnvDefault(id)}
          {overridden && <span className="ml-2 text-[9px] text-indigo-400">{t('apikey.overridden')}</span>}
        </button>
      )}
    </div>
  )
}
