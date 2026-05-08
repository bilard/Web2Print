import { useState, useEffect, useRef } from 'react'
import {
  Sparkles, Loader2, Timer, RefreshCw, Package, Cpu, PackageCheck,
  LayoutList, FileText, Users, ChevronDown, ChevronUp, ChevronLeft, X as XIcon, FileText as FilePdfIcon,
} from 'lucide-react'
import type { ScrapingField, ScrapingMode, ScrapeResult, ExtractionTarget } from './useJina'
import { SchemaEditor } from './SchemaEditor'
import { FIELD_TEMPLATES } from './useJina'
import { BrandSuggestion } from './BrandSuggestion'
import { extractUrlsFromFile, extractUrlsFromGoogleSheet, extractUrlsFromText } from './urlSourceParsers'
import { TypedLogConsole } from '@/features/excel/ai-enrichment/TypedLogConsole'
import { useGDriveStore } from '@/stores/gdrive.store'
import { toast } from 'sonner'

function parseManualBreadcrumb(raw: string): string[] {
  if (!raw.trim()) return []
  return raw.split(/[>›/|]+/).map(s => s.trim()).filter(s => s.length > 0 && s.length < 80)
}

interface Props {
  url: string
  loading: boolean
  onScrape: (
    mode: ScrapingMode, fields: ScrapingField[], prompt: string,
    opts: { target?: ExtractionTarget; waitFor?: number; noCache?: boolean; manualBreadcrumb?: string[] }
  ) => void
  result: ScrapeResult | null
  onUrlSuggestion?: (url: string) => void
  onEnrichMany?: (urls: string[]) => Promise<void> | void
  batchRunning?: boolean
  logs?: string[]
}

const TEMPLATES = [
  { key: 'product',      Icon: Package,      desc: 'Nom, prix, specs, image'              },
  { key: 'product_tech', Icon: Cpu,          desc: 'Specs techniques complètes'            },
  { key: 'product_full', Icon: PackageCheck, desc: 'Maximum : USPs, PDFs, toutes images'  },
  { key: 'listing',      Icon: LayoutList,   desc: "Liste de produits d'un catalogue"      },
  { key: 'article',      Icon: FileText,     desc: 'Blog, actualités, presse'             },
  { key: 'contact',      Icon: Users,        desc: 'Annuaire, fiches contacts'            },
] as const

type MultiMode = 'list' | 'file' | 'sheet'

export function ScrapeTab({ url, loading, onScrape, result, onUrlSuggestion, onEnrichMany, batchRunning, logs }: Props) {
  const [step, setStep] = useState<1 | 2 | 3>(1)
  const [templateKey, setTemplateKey] = useState<string>('product_full')
  const [showMulti, setShowMulti] = useState(false)
  const [multiMode, setMultiMode] = useState<MultiMode>('list')
  const [listText, setListText] = useState('')
  const [importedUrls, setImportedUrls] = useState<string[]>([])
  const [importing, setImporting] = useState(false)
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [fields, setFields] = useState<ScrapingField[]>(FIELD_TEMPLATES.product_full.fields)
  const [prompt, setPrompt] = useState('')
  const [noCache, setNoCache] = useState(false)
  const [includePdfs, setIncludePdfs] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false
    return window.localStorage.getItem('ds-scrape-include-pdfs') === '1'
  })

  const updateIncludePdfs = (v: boolean) => {
    setIncludePdfs(v)
    if (typeof window !== 'undefined') {
      if (v) window.localStorage.setItem('ds-scrape-include-pdfs', '1')
      else window.localStorage.removeItem('ds-scrape-include-pdfs')
    }
  }
  const [manualBreadcrumb, setManualBreadcrumb] = useState('')
  const [waitFor, setWaitFor] = useState<number>(() => {
    if (typeof window === 'undefined') return 0
    const saved = window.localStorage.getItem('ds-scrape-wait-for')
    return saved ? Number(saved) || 0 : 0
  })

  const gdriveAccessToken = useGDriveStore(s => s.accessToken)
  const gdriveConnected = useGDriveStore(s => s.connected)
  const gdriveDisconnect = useGDriveStore(s => s.disconnect)

  // Auto-bascule en mode Google Sheet quand l'URL principale est un Sheet.
  useEffect(() => {
    if (!/docs\.google\.com\/spreadsheets/i.test(url)) return
    setShowMulti(true)
    setMultiMode('sheet')
  }, [url])

  // Auto-import dès que (URL Sheet + token GDrive) sont disponibles.
  // Guard via ref pour ne déclencher qu'une fois par URL et éviter les boucles.
  const autoImportedUrlRef = useRef<string | null>(null)
  useEffect(() => {
    if (!/docs\.google\.com\/spreadsheets/i.test(url)) {
      autoImportedUrlRef.current = null
      return
    }
    if (!gdriveAccessToken) return
    if (autoImportedUrlRef.current === url) return

    const idMatch = url.match(/spreadsheets\/d\/([a-zA-Z0-9-_]+)/)
    const fileId = idMatch?.[1]
    if (!fileId) return

    autoImportedUrlRef.current = url
    let cancelled = false
    setImporting(true)
    ;(async () => {
      try {
        const result = await extractUrlsFromGoogleSheet(fileId, gdriveAccessToken)
        if (cancelled) return
        setImportedUrls(result.urls)
        if (result.urls.length === 0) {
          toast.warning(
            `Aucune URL trouvée (${result.rowCount} lignes, colonne : "${result.detectedColumn ?? 'non détectée'}", méthode : ${result.method})`
          )
        } else {
          const colInfo = result.detectedColumn ? `colonne "${result.detectedColumn}"` : 'fallback texte'
          toast.success(`${result.urls.length} URL(s) importée(s) sur ${result.rowCount} lignes (${colInfo})`)
        }
      } catch (e) {
        if (cancelled) return
        const msg = e instanceof Error ? e.message : 'inconnu'
        if (msg === 'TOKEN_EXPIRED') {
          gdriveDisconnect()
          toast.error('Session Google Drive expirée — reconnecte-toi dans Paramètres → Connectors')
        } else {
          toast.error(`Échec import Sheet : ${msg}`)
        }
        autoImportedUrlRef.current = null
      } finally {
        if (!cancelled) setImporting(false)
      }
    })()
    return () => { cancelled = true }
  }, [url, gdriveAccessToken, gdriveDisconnect])

  const listUrls = multiMode === 'list' ? extractUrlsFromText(listText) : []
  const multiUrls = multiMode === 'list' ? listUrls : importedUrls
  const resolvedUrls = showMulti ? multiUrls : (url ? [url] : [])
  const isMulti = showMulti && multiUrls.length > 0
  const target: ExtractionTarget = templateKey === 'listing' ? 'multiple' : 'single'
  const hasBreadcrumbField = fields.some(f => f.key === 'breadcrumb')
  const parsedBreadcrumb = parseManualBreadcrumb(manualBreadcrumb)

  const tpl = TEMPLATES.find(t => t.key === templateKey) ?? TEMPLATES[2]
  const TplIcon = tpl.Icon

  // Hostnames uniques des URLs importées (ex: "nicoll.fr, makita.fr")
  const importedHosts = (() => {
    const hosts = new Set<string>()
    for (const u of multiUrls) {
      try { hosts.add(new URL(u).hostname.replace(/^www\./, '')) } catch { /* ignore */ }
    }
    return [...hosts]
  })()

  useEffect(() => {
    if (typeof window !== 'undefined' && window.localStorage.getItem('ds-scrape-wait-for')) return
    try {
      const host = new URL(url).hostname
      const isSpa = /milwaukeetool|dewalt|metabo|bosch|stanley|hikoki|festool|makita|stihl|husqvarna|worx|ryobi|aeg-powertools/i.test(host)
      const needsWait = /leroymerlin|castorama|boulanger|fnac|darty|amazon|cdiscount|manomano|conforama|ikea|leroy/i.test(host)
      if (needsWait) setWaitFor(30000)
      else if (isSpa) setWaitFor(10000)
      else setWaitFor(0)
    } catch { /* URL invalide */ }
  }, [url])

  const updateWaitFor = (v: number) => {
    setWaitFor(v)
    if (v > 0) window.localStorage.setItem('ds-scrape-wait-for', String(v))
    else window.localStorage.removeItem('ds-scrape-wait-for')
  }

  const handleFileUpload = async (file: File | null) => {
    if (!file) return
    setImporting(true)
    try {
      const urls = await extractUrlsFromFile(file)
      setImportedUrls(urls)
      if (urls.length === 0) toast.warning(`Aucune URL trouvée dans ${file.name}`)
      else toast.success(`${urls.length} URL(s) détectée(s)`)
    } catch (e) {
      toast.error(`Échec import : ${e instanceof Error ? e.message : 'inconnu'}`)
    } finally {
      setImporting(false)
    }
  }


  const handleLaunch = async () => {
    if (isMulti) {
      if (!onEnrichMany || multiUrls.length === 0) return
      await onEnrichMany(multiUrls)
    } else {
      onScrape('schema', fields, prompt, {
        target,
        waitFor: waitFor > 0 ? waitFor : undefined,
        noCache,
        manualBreadcrumb: parsedBreadcrumb.length > 0 ? parsedBreadcrumb : undefined,
      })
    }
  }

  const selectTemplate = (key: string) => {
    setTemplateKey(key)
    setFields(FIELD_TEMPLATES[key].fields)
    setStep(2)
  }

  const goBack = () => setStep(s => Math.max(1, s - 1) as 1 | 2 | 3)

  return (
    <div className="space-y-4">

      {/* Indicateur d'étapes */}
      {step > 1 && (
        <div className="flex items-center gap-2">
          <button onClick={goBack} className="text-white/30 hover:text-white/60 transition-colors">
            <ChevronLeft className="w-4 h-4" />
          </button>
          <div className="flex items-center gap-1.5 text-[10px]">
            {['Type', 'Source', 'Lancer'].map((label, i) => (
              <span key={i} className={`flex items-center gap-1 ${i + 1 <= step ? 'text-indigo-300' : 'text-white/20'}`}>
                {i > 0 && <span className="text-white/15">›</span>}
                {label}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Étape 1 — Template */}
      {step === 1 && (
        <div>
          <p className="text-[10px] text-white/30 uppercase tracking-wider mb-3">Quel type de contenu ?</p>
          <div className="grid grid-cols-2 gap-2">
            {TEMPLATES.map(({ key, Icon, desc }) => (
              <button
                key={key}
                onClick={() => selectTemplate(key)}
                className="flex flex-col gap-1.5 p-3 rounded-lg border border-white/[0.08] bg-white/[0.02] hover:bg-indigo-500/10 hover:border-indigo-500/30 text-left transition-colors group"
              >
                <div className="flex items-center gap-2">
                  <Icon className="w-4 h-4 text-white/40 group-hover:text-indigo-400 transition-colors shrink-0" />
                  <span className="text-[12px] font-medium text-white/70 group-hover:text-white/90">{FIELD_TEMPLATES[key].label}</span>
                </div>
                <span className="text-[10px] text-white/30 leading-relaxed">{desc}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Étape 2 — Source */}
      {step === 2 && (
        <div className="space-y-3">
          <BrandSuggestion url={url} onAccept={u => onUrlSuggestion?.(u)} />
          <p className="text-[10px] text-white/30 uppercase tracking-wider">Combien d'URLs ?</p>
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => { setShowMulti(false); setStep(3) }}
              className="flex flex-col gap-1 p-3 rounded-lg border border-white/[0.08] bg-white/[0.02] hover:bg-indigo-500/10 hover:border-indigo-500/30 text-left transition-colors group"
            >
              <span className="text-[12px] font-medium text-white/70 group-hover:text-white/90">1 URL</span>
              <span className="text-[10px] text-white/30 truncate">{url || 'URL actuelle'}</span>
            </button>
            <button
              onClick={() => setShowMulti(true)}
              className={`flex flex-col gap-1 p-3 rounded-lg border text-left transition-colors ${showMulti ? 'border-indigo-500/40 bg-indigo-500/10' : 'border-white/[0.08] bg-white/[0.02] hover:bg-indigo-500/10 hover:border-indigo-500/30'} group`}
            >
              <span className={`text-[12px] font-medium ${showMulti ? 'text-indigo-300' : 'text-white/70 group-hover:text-white/90'}`}>Plusieurs URLs</span>
              <span className="text-[10px] text-white/30">Liste, fichier ou Sheet</span>
            </button>
          </div>

          {showMulti && (
            <div className="space-y-2">
              {/* Sélecteur de mode multi */}
              <div className="flex rounded-md overflow-hidden border border-white/10">
                {(['list', 'file', 'sheet'] as MultiMode[]).map(m => {
                  const labels = { list: 'Liste', file: 'Fichier', sheet: 'Google Sheet' }
                  return (
                    <button
                      key={m}
                      onClick={() => { setMultiMode(m); setImportedUrls([]) }}
                      className={`flex-1 text-[11px] px-2 py-1.5 transition-colors ${multiMode === m ? 'bg-indigo-500/20 text-indigo-300' : 'text-white/30 hover:text-white/50'}`}
                    >
                      {labels[m]}
                    </button>
                  )
                })}
              </div>

              {multiMode === 'list' && (
                <div>
                  {listUrls.length > 0 && (
                    <p className="text-[10px] text-emerald-400/80 mb-1">{listUrls.length} URL{listUrls.length > 1 ? 's' : ''} détectée{listUrls.length > 1 ? 's' : ''}</p>
                  )}
                  <textarea
                    value={listText}
                    onChange={e => setListText(e.target.value)}
                    placeholder={'https://example.com/produit-1\nhttps://example.com/produit-2'}
                    rows={5}
                    className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-xs text-white/70 placeholder:text-white/20 focus:border-indigo-500/50 focus:outline-none resize-y transition-colors font-mono"
                  />
                </div>
              )}

              {multiMode === 'file' && (
                <div className="space-y-2">
                  <div className="flex gap-2">
                    <input
                      type="file"
                      accept=".csv,.tsv,.txt,.xlsx,.xls,.xlsm,.ods"
                      onChange={e => handleFileUpload(e.target.files?.[0] ?? null)}
                      disabled={importing}
                      className="flex-1 text-[11px] text-white/60 file:mr-2 file:py-1 file:px-3 file:rounded-md file:border-0 file:text-[11px] file:bg-indigo-500/20 file:text-indigo-300 hover:file:bg-indigo-500/30 file:cursor-pointer"
                    />
                    {importing && <Loader2 className="w-4 h-4 text-indigo-400 animate-spin self-center" />}
                  </div>
                  {importedUrls.length > 0 && (
                    <div className="flex items-center justify-between gap-2 p-2 rounded bg-emerald-500/10 border border-emerald-500/20">
                      <div className="flex items-center gap-2 flex-wrap min-w-0">
                        <span className="text-[11px] text-emerald-300 shrink-0">{importedUrls.length} URL{importedUrls.length > 1 ? 's' : ''}</span>
                        {importedHosts.length > 0 && (
                          <span className="text-[10px] text-emerald-400/60 truncate font-mono" title={importedHosts.join(', ')}>
                            {importedHosts.slice(0, 3).join(', ')}{importedHosts.length > 3 ? ` +${importedHosts.length - 3}` : ''}
                          </span>
                        )}
                      </div>
                      <button onClick={() => setImportedUrls([])} className="text-emerald-400/60 hover:text-emerald-300 shrink-0"><XIcon className="w-3 h-3" /></button>
                    </div>
                  )}
                </div>
              )}

              {multiMode === 'sheet' && (
                <div className="space-y-2">
                  {!gdriveConnected && (
                    <p className="p-2 rounded bg-amber-500/10 border border-amber-500/20 text-[10px] text-amber-300/80">
                      Connecte Google Drive dans Paramètres → Connectors.
                    </p>
                  )}
                  {gdriveConnected && importing && (
                    <div className="flex items-center gap-2 p-2 rounded bg-indigo-500/5 border border-indigo-500/20">
                      <Loader2 className="w-3 h-3 text-indigo-400 animate-spin" />
                      <span className="text-[11px] text-indigo-300/80">Import en cours…</span>
                    </div>
                  )}
                  {gdriveConnected && !importing && importedUrls.length === 0 && (
                    <p className="p-2 rounded bg-white/[0.02] border border-white/[0.06] text-[10px] text-white/40">
                      Colle une URL Google Sheets dans la barre du haut — l'import est automatique.
                    </p>
                  )}
                  {importedUrls.length > 0 && (
                    <div className="flex items-center justify-between gap-2 p-2 rounded bg-emerald-500/10 border border-emerald-500/20">
                      <div className="flex items-center gap-2 flex-wrap min-w-0">
                        <span className="text-[11px] text-emerald-300 shrink-0">{importedUrls.length} URL{importedUrls.length > 1 ? 's' : ''}</span>
                        {importedHosts.length > 0 && (
                          <span className="text-[10px] text-emerald-400/60 truncate font-mono" title={importedHosts.join(', ')}>
                            {importedHosts.slice(0, 3).join(', ')}{importedHosts.length > 3 ? ` +${importedHosts.length - 3}` : ''}
                          </span>
                        )}
                      </div>
                      <button onClick={() => setImportedUrls([])} className="text-emerald-400/60 hover:text-emerald-300 shrink-0"><XIcon className="w-3 h-3" /></button>
                    </div>
                  )}
                </div>
              )}

              {multiUrls.length > 0 && (
                <button
                  onClick={() => setStep(3)}
                  className="w-full py-2 rounded-lg bg-indigo-500/20 hover:bg-indigo-500/30 text-indigo-300 text-[12px] font-medium border border-indigo-500/30 transition-colors"
                >
                  Continuer avec {multiUrls.length} URL{multiUrls.length > 1 ? 's' : ''} →
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* Étape 3 — Lancer */}
      {step === 3 && (
        <div className="space-y-3">
          {/* Résumé */}
          <div className="flex items-center gap-2.5 p-3 rounded-lg bg-white/[0.03] border border-white/[0.06]">
            <TplIcon className="w-4 h-4 text-indigo-400 shrink-0" />
            <div className="flex-1 min-w-0">
              <span className="text-[12px] text-white/80 font-medium">{FIELD_TEMPLATES[templateKey].label}</span>
              <span className="text-[11px] text-white/30 ml-2">
                {isMulti ? `${multiUrls.length} URL${multiUrls.length > 1 ? 's' : ''}` : (url || '—')}
              </span>
            </div>
          </div>

          {/* Options avancées */}
          <div>
            <button
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="flex items-center gap-1.5 text-[10px] text-white/25 hover:text-white/50 transition-colors"
            >
              {showAdvanced ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
              Options avancées
              {waitFor > 0 && !showAdvanced && (
                <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20">
                  <Timer className="w-2.5 h-2.5" />{waitFor / 1000}s
                </span>
              )}
              {includePdfs && !showAdvanced && (
                <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20">
                  <FilePdfIcon className="w-2.5 h-2.5" />PDFs
                </span>
              )}
            </button>
            {showAdvanced && (
              <div className="mt-2 space-y-3 p-3 bg-black/20 rounded-lg border border-white/[0.06]">
                <div>
                  <label className="text-[10px] text-white/30 uppercase tracking-wider block mb-1.5">Prompt IA</label>
                  <textarea
                    value={prompt}
                    onChange={e => setPrompt(e.target.value)}
                    placeholder="Ex : Extrais uniquement le produit principal, ignore les accessoires..."
                    rows={2}
                    className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-xs text-white/70 placeholder:text-white/20 focus:border-indigo-500/50 focus:outline-none resize-none transition-colors font-mono"
                  />
                </div>
                <SchemaEditor fields={fields} onChange={setFields} />
                {hasBreadcrumbField && (
                  <div>
                    <label className="text-[10px] text-white/30 uppercase tracking-wider block mb-1.5">Fil d'Ariane (override)</label>
                    <input
                      type="text"
                      value={manualBreadcrumb}
                      onChange={e => setManualBreadcrumb(e.target.value)}
                      placeholder="Ex : Outillage > Perceuses > Sans fil"
                      className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-xs text-white/70 placeholder:text-white/20 focus:border-indigo-500/50 focus:outline-none transition-colors font-mono"
                    />
                  </div>
                )}
                <div className="flex flex-wrap gap-3">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={noCache} onChange={e => setNoCache(e.target.checked)}
                      className="rounded border-white/20 bg-white/5 text-indigo-500 focus:ring-indigo-500/30" />
                    <RefreshCw className="w-3 h-3 text-white/30" />
                    <span className="text-[11px] text-white/50">Pas de cache</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer" title="Inclure le contenu textuel des PDFs liés (notices/fiches techniques) dans l'extraction. Désactivé par défaut car les notices multilingues polluent les specs.">
                    <input type="checkbox" checked={includePdfs} onChange={e => updateIncludePdfs(e.target.checked)}
                      className="rounded border-white/20 bg-white/5 text-indigo-500 focus:ring-indigo-500/30" />
                    <FilePdfIcon className={`w-3 h-3 ${includePdfs ? 'text-amber-400/70' : 'text-white/30'}`} />
                    <span className={`text-[11px] ${includePdfs ? 'text-amber-300' : 'text-white/50'}`}>Scraper les PDFs</span>
                  </label>
                  <div className="flex items-center gap-2">
                    <Timer className={`w-3 h-3 ${waitFor > 0 ? 'text-amber-400/70' : 'text-white/30'}`} />
                    <select
                      value={waitFor}
                      onChange={e => updateWaitFor(Number(e.target.value))}
                      className={`bg-white/5 border rounded px-2 py-0.5 text-[11px] focus:outline-none ${waitFor > 0 ? 'border-amber-500/30 text-amber-300 focus:border-amber-500/50' : 'border-white/10 text-white/60 focus:border-indigo-500/50'}`}
                    >
                      <option value={0}>Timeout : défaut</option>
                      <option value={10000}>10s</option>
                      <option value={15000}>15s</option>
                      <option value={20000}>20s</option>
                      <option value={30000}>30s</option>
                    </select>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Bouton lancer */}
          <button
            onClick={handleLaunch}
            disabled={resolvedUrls.length === 0 || loading || batchRunning}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg bg-indigo-500 hover:bg-indigo-600 text-white text-sm font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {loading || batchRunning ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            {loading || batchRunning
              ? (isMulti ? 'Enrichissement en cours…' : 'Extraction...')
              : isMulti
                ? `Lancer ${multiUrls.length} enrichissement${multiUrls.length > 1 ? 's' : ''}`
                : 'Extraire'}
          </button>

          {/* Console de logs temps réel */}
          {logs && logs.length > 0 && (
            <TypedLogConsole logs={logs} maxHeight="20rem" />
          )}
        </div>
      )}
    </div>
  )
}
