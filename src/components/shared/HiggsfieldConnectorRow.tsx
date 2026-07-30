import { useState, useEffect } from 'react'
import { Eye, EyeOff, CheckCircle2, KeyRound, CreditCard } from 'lucide-react'
import { HiggsfieldLogo } from '@/features/ai/providerLogos'
import { getApiKey, setApiKey, resetApiKey, getApiKeyLinks } from '@/lib/apiKeys'
import { API_KEYS_HYDRATED_EVENT } from '@/features/settings/useApiKeysSync'
import { useTranslation } from '@/lib/i18n'

/**
 * Connecteur Higgsfield — DEUX champs séparés (ID + Secret) pour la clarté, mais
 * stockés en une seule valeur `higgsfield` = « ID:SECRET » (format attendu par le
 * SDK / les Cloud Functions). Évite l'erreur fréquente de ne coller qu'une moitié.
 */
function splitCreds(v: string): { id: string; secret: string } {
  const i = v.indexOf(':')
  return i < 0 ? { id: v, secret: '' } : { id: v.slice(0, i), secret: v.slice(i + 1) }
}

export function HiggsfieldConnectorRow() {
  const { t } = useTranslation()
  const [id, setId] = useState('')
  const [secret, setSecret] = useState('')
  const [secretVisible, setSecretVisible] = useState(false)
  const [saved, setSaved] = useState(false)
  const links = getApiKeyLinks('higgsfield')

  // Hydrate depuis la valeur stockée (+ resynchronise après hydratation Firestore).
  useEffect(() => {
    const load = () => {
      const { id: i, secret: s } = splitCreds(getApiKey('higgsfield'))
      setId(i)
      setSecret(s)
    }
    load()
    window.addEventListener(API_KEYS_HYDRATED_EVENT, load)
    return () => window.removeEventListener(API_KEYS_HYDRATED_EVENT, load)
  }, [])

  const handleSave = () => {
    const i = id.trim()
    const s = secret.trim()
    if (i && s) setApiKey('higgsfield', `${i}:${s}`)
    else resetApiKey('higgsfield')
    setSaved(true)
    window.setTimeout(() => setSaved(false), 1500)
  }

  const complete = id.trim().length > 0 && secret.trim().length > 0
  const inputCls =
    'flex-1 bg-white/5 border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-white font-mono focus:outline-none focus:border-indigo-500/50'

  return (
    <div className="bg-white/[0.03] rounded-xl p-3 flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <HiggsfieldLogo />
          <div>
            <div className="flex items-center gap-1.5">
              <p className="text-xs font-medium text-white/70">Higgsfield</p>
              {complete && <CheckCircle2 className="w-3 h-3 text-green-400" />}
            </div>
            <p className="text-[10px] text-white/30">{t('higgsfield.desc')}</p>
          </div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {links?.manage && (
            <a href={links.manage} target="_blank" rel="noopener noreferrer" title={t('higgsfield.manage')}
              className="text-white/20 hover:text-indigo-400 transition-colors p-1 rounded hover:bg-white/5">
              <KeyRound className="w-3 h-3" />
            </a>
          )}
          {links?.billing && (
            <a href={links.billing} target="_blank" rel="noopener noreferrer" title={t('higgsfield.credits')}
              className="text-white/20 hover:text-emerald-400 transition-colors p-1 rounded hover:bg-white/5">
              <CreditCard className="w-3 h-3" />
            </a>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <div className="flex items-center gap-1.5">
          <span className="text-[9px] uppercase tracking-wider text-white/30 w-12 shrink-0">Key ID</span>
          <input
            type="text"
            value={id}
            onChange={(e) => setId(e.target.value)}
            placeholder="2ed4f233-89e7-4d96-…"
            className={inputCls}
          />
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-[9px] uppercase tracking-wider text-white/30 w-12 shrink-0">Secret</span>
          <input
            type={secretVisible ? 'text' : 'password'}
            value={secret}
            onChange={(e) => setSecret(e.target.value)}
            placeholder="de70b45db0221e21…"
            className={inputCls}
          />
          <button onClick={() => setSecretVisible((v) => !v)} className="text-white/30 hover:text-white/60 px-1">
            {secretVisible ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
          </button>
          <button
            onClick={handleSave}
            className="text-xs bg-indigo-500 hover:bg-indigo-600 text-[#fff] px-3 py-1.5 rounded-lg transition-colors"
          >
            {saved ? t('apikey.saved') : 'Sauvegarder'}
          </button>
        </div>
      </div>

      <p className="text-[10px] text-white/30 bg-white/5 rounded-lg px-2.5 py-1.5 leading-relaxed">
        {t('hf.keysNote')}
      </p>
    </div>
  )
}
