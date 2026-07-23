import { useState, useEffect } from 'react'
import { Loader2, CheckCircle2, XCircle, Wifi, Eye, EyeOff, KeyRound, ExternalLink } from 'lucide-react'
import { BrightDataLogo } from '@/features/ai/providerLogos'
import { doc, getDoc, setDoc } from 'firebase/firestore'
import { db } from '@/lib/firebase/config'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'

export function BrightDataConnectorRow() {
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
    } catch {
      // `config/*` est verrouillé côté client (secret d'infra partagé) → la Function
      // lit le token via Secret Manager / Admin SDK. Plus modifiable depuis l'app.
      toast.error('Token Bright Data géré côté serveur (Secret Manager) — non modifiable depuis l\'app.')
      setTokenEditing(false)
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
    } catch {
      toast.error('Endpoint Scraping Browser géré côté serveur — non modifiable depuis l\'app.')
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
            href="https://brightdata.fr/cp/billing/invoices"
            target="_blank"
            rel="noopener noreferrer"
            title="Facturation & solde (nouvel onglet)"
            className="flex items-center gap-1 text-[10px] text-amber-400/70 hover:text-amber-300 transition-colors"
          >
            <span>Billing</span>
            <ExternalLink className="w-3 h-3" />
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
              className="text-xs bg-violet-500 hover:bg-violet-600 text-[#fff] px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50 flex items-center gap-1"
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
                  className="text-xs bg-violet-500 hover:bg-violet-600 text-[#fff] px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50 flex items-center gap-1"
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
