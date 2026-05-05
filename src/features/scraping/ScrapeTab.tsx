import { useState, useEffect } from 'react'
import { Sparkles, Loader2, ChevronDown, ChevronUp, Timer, RefreshCw, Link2, ListPlus, FileSpreadsheet, Cloud, X as XIcon } from 'lucide-react'
import type { ScrapingField, ScrapingMode, ScrapeResult, ExtractionTarget } from './useJina'
import { SchemaEditor } from './SchemaEditor'
import { FIELD_TEMPLATES } from './useJina'
import { BrandSuggestion } from './BrandSuggestion'
import { extractUrlsFromFile, extractUrlsFromGoogleSheet, extractUrlsFromText } from './urlSourceParsers'
import { useGDriveStore } from '@/stores/gdrive.store'
import { toast } from 'sonner'

type UrlSource = 'single' | 'list' | 'file' | 'sheet'

interface Props {
  url: string
  loading: boolean
  onScrape: (
    mode: ScrapingMode, fields: ScrapingField[], prompt: string,
    opts: { target?: ExtractionTarget; waitFor?: number; noCache?: boolean; manualBreadcrumb?: string[] }
  ) => void
  result: ScrapeResult | null
  /** Appelé quand l'utilisateur clique sur la suggestion de site officiel */
  onUrlSuggestion?: (url: string) => void
  /** Lance le pipeline d'enrichissement complet (Produit complet) sur N URLs.
   *  Requis pour les modes Liste/Fichier/Sheet. */
  onEnrichMany?: (urls: string[]) => Promise<void> | void
  /** True quand un batch est en cours — désactive les boutons multi-URL. */
  batchRunning?: boolean
}

/** Parse une chaîne breadcrumb saisie à la main en tableau de niveaux.
 *  Accepte les séparateurs courants : `>`, `/`, `›`, `|`. Trim + dédoublonnage. */
function parseManualBreadcrumb(raw: string): string[] {
  if (!raw.trim()) return []
  return raw
    .split(/[>›/|]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && s.length < 80)
}

export function ScrapeTab({ url, loading, onScrape, result, onUrlSuggestion, onEnrichMany, batchRunning }: Props) {
  const [mode, setMode] = useState<ScrapingMode>('schema')
  const [fields, setFields] = useState<ScrapingField[]>(FIELD_TEMPLATES.product_full.fields)
  const [prompt, setPrompt] = useState('')
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [target, setTarget] = useState<ExtractionTarget>('single')
  const [noCache, setNoCache] = useState(false)
  const [waitFor, setWaitFor] = useState<number>(() => {
    // Restaure la préférence utilisateur (0 = auto-détection par URL).
    if (typeof window === 'undefined') return 0
    const saved = window.localStorage.getItem('ds-scrape-wait-for')
    return saved ? Number(saved) || 0 : 0
  })
  const [manualBreadcrumb, setManualBreadcrumb] = useState('')

  // ── Multi-URL : source + URLs détectées ─────────────────────────────────────
  const [urlSource, setUrlSource] = useState<UrlSource>('single')
  const [listText, setListText] = useState('')
  const [importedUrls, setImportedUrls] = useState<string[]>([])
  const [sheetIdOrUrl, setSheetIdOrUrl] = useState('')
  const [importing, setImporting] = useState(false)
  const gdriveAccessToken = useGDriveStore((s) => s.accessToken)
  const gdriveConnected = useGDriveStore((s) => s.connected)

  const listUrls = urlSource === 'list' ? extractUrlsFromText(listText) : []
  const multiUrls = urlSource === 'list' ? listUrls : urlSource === 'file' || urlSource === 'sheet' ? importedUrls : []
  const isMulti = urlSource !== 'single'

  const handleFileUpload = async (file: File | null) => {
    if (!file) return
    setImporting(true)
    try {
      const urls = await extractUrlsFromFile(file)
      setImportedUrls(urls)
      if (urls.length === 0) toast.warning(`Aucune URL trouvée dans ${file.name}`)
      else toast.success(`${urls.length} URL(s) détectée(s) dans ${file.name}`)
    } catch (e) {
      toast.error(`Échec import : ${e instanceof Error ? e.message : 'inconnu'}`)
    } finally {
      setImporting(false)
    }
  }

  const handleSheetImport = async () => {
    if (!gdriveAccessToken) {
      toast.error('Connecte Google Drive dans Paramètres → Connectors')
      return
    }
    // Accepte l'URL complète d'un Sheet OU juste l'ID
    const idMatch = sheetIdOrUrl.match(/spreadsheets\/d\/([a-zA-Z0-9-_]+)/) ?? sheetIdOrUrl.match(/^([a-zA-Z0-9-_]{20,})$/)
    const fileId = idMatch?.[1]
    if (!fileId) {
      toast.error('ID ou URL de Sheet invalide')
      return
    }
    setImporting(true)
    try {
      const urls = await extractUrlsFromGoogleSheet(fileId, gdriveAccessToken)
      setImportedUrls(urls)
      if (urls.length === 0) toast.warning('Aucune URL trouvée dans le Sheet')
      else toast.success(`${urls.length} URL(s) importée(s) depuis le Sheet`)
    } catch (e) {
      toast.error(`Échec import Sheet : ${e instanceof Error ? e.message : 'inconnu'}`)
    } finally {
      setImporting(false)
    }
  }

  const handleLaunchBatch = async () => {
    if (!onEnrichMany || multiUrls.length === 0) return
    await onEnrichMany(multiUrls)
  }

  /** Met à jour waitFor + persiste en localStorage. Valeur 0 = réinitialise
   *  la préférence (auto-détection réactivée). */
  const updateWaitFor = (v: number) => {
    setWaitFor(v)
    if (v > 0) window.localStorage.setItem('ds-scrape-wait-for', String(v))
    else window.localStorage.removeItem('ds-scrape-wait-for')
  }

  const hasBreadcrumbField = fields.some((f) => f.key === 'breadcrumb')
  const parsedManualBreadcrumb = parseManualBreadcrumb(manualBreadcrumb)

  // Auto-détection des sites SPA/JS-heavy → active waitFor par défaut.
  // Skip si l'utilisateur a déjà une préférence persistée (localStorage) pour
  // ne pas écraser son choix à chaque changement d'URL.
  useEffect(() => {
    if (typeof window !== 'undefined' && window.localStorage.getItem('ds-scrape-wait-for')) return
    try {
      const host = new URL(url).hostname
      const isSpa = /milwaukeetool|dewalt|metabo|bosch|stanley|hikoki|festool|makita|stihl|husqvarna|worx|ryobi|aeg-powertools/i.test(host)
      // Revendeurs protégés DataDome/Akamai — Jina `X-Engine: browser` nécessite
      // un timeout long (challenge + hydratation React ~20-25s).
      const needsWait = /leroymerlin|castorama|boulanger|fnac|darty|amazon|cdiscount|manomano|conforama|ikea|leroy/i.test(host)
      if (needsWait) setWaitFor(30000)
      else if (isSpa) setWaitFor(10000)
      else setWaitFor(0)
    } catch { /* URL invalide */ }
  }, [url])

  return (
    <div className="space-y-4">
      {/* Sélecteur de source d'URLs : 1 URL / Liste / Fichier / Google Sheet */}
      <div>
        <label className="text-[10px] text-white/30 uppercase tracking-wider block mb-1">Source des URLs</label>
        <div className="flex rounded-md overflow-hidden border border-white/10">
          {([
            ['single', '1 URL', Link2],
            ['list', 'Liste', ListPlus],
            ['file', 'Fichier', FileSpreadsheet],
            ['sheet', 'Google Sheet', Cloud],
          ] as [UrlSource, string, typeof Link2][]).map(([s, label, Icon]) => (
            <button
              key={s}
              onClick={() => { setUrlSource(s); setImportedUrls([]) }}
              className={`flex-1 flex items-center justify-center gap-1.5 text-[11px] px-2 py-1.5 transition-colors ${
                urlSource === s ? 'bg-indigo-500/20 text-indigo-300' : 'text-white/30 hover:text-white/50'
              }`}
            >
              <Icon className="w-3 h-3" />
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Mode "Liste" : textarea N URLs */}
      {urlSource === 'list' && (
        <div>
          <label className="text-[10px] text-white/30 uppercase tracking-wider flex items-center justify-between mb-1.5">
            <span>Liste d'URLs (une par ligne)</span>
            {listUrls.length > 0 && (
              <span className="text-[10px] text-emerald-400/80 normal-case tracking-normal">
                {listUrls.length} URL{listUrls.length > 1 ? 's' : ''} détectée{listUrls.length > 1 ? 's' : ''}
              </span>
            )}
          </label>
          <textarea
            value={listText}
            onChange={(e) => setListText(e.target.value)}
            placeholder={'https://example.com/produit-1\nhttps://example.com/produit-2\nhttps://example.com/produit-3'}
            rows={6}
            className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-xs text-white/70 placeholder:text-white/20 focus:border-indigo-500/50 focus:outline-none resize-y transition-colors font-mono"
          />
          <p className="text-[10px] text-white/25 mt-1">Colle un texte libre — toutes les URLs http(s) sont détectées automatiquement.</p>
        </div>
      )}

      {/* Mode "Fichier" : upload CSV/Excel */}
      {urlSource === 'file' && (
        <div className="space-y-2">
          <label className="text-[10px] text-white/30 uppercase tracking-wider block mb-1.5">Fichier CSV ou Excel</label>
          <div className="flex gap-2">
            <input
              type="file"
              accept=".csv,.tsv,.txt,.xlsx,.xls,.xlsm,.ods"
              onChange={(e) => handleFileUpload(e.target.files?.[0] ?? null)}
              disabled={importing}
              className="flex-1 text-[11px] text-white/60 file:mr-2 file:py-1 file:px-3 file:rounded-md file:border-0 file:text-[11px] file:bg-indigo-500/20 file:text-indigo-300 hover:file:bg-indigo-500/30 file:cursor-pointer"
            />
            {importing && <Loader2 className="w-4 h-4 text-indigo-400 animate-spin self-center" />}
          </div>
          <p className="text-[10px] text-white/25">Auto-détection de la colonne URL (header "url"/"lien"/"link" ou contenu http).</p>
          {importedUrls.length > 0 && (
            <div className="flex items-center justify-between p-2 rounded bg-emerald-500/10 border border-emerald-500/20">
              <span className="text-[11px] text-emerald-300">{importedUrls.length} URL{importedUrls.length > 1 ? 's' : ''} importée{importedUrls.length > 1 ? 's' : ''}</span>
              <button onClick={() => setImportedUrls([])} className="text-emerald-400/60 hover:text-emerald-300">
                <XIcon className="w-3 h-3" />
              </button>
            </div>
          )}
        </div>
      )}

      {/* Mode "Google Sheet" : ID ou URL */}
      {urlSource === 'sheet' && (
        <div className="space-y-2">
          <label className="text-[10px] text-white/30 uppercase tracking-wider block mb-1.5">URL ou ID du Google Sheet</label>
          {!gdriveConnected && (
            <div className="p-2 rounded bg-amber-500/10 border border-amber-500/20 text-[10px] text-amber-300/80">
              Connecte Google Drive dans Paramètres → Connectors avant d'importer un Sheet.
            </div>
          )}
          <div className="flex gap-2">
            <input
              type="text"
              value={sheetIdOrUrl}
              onChange={(e) => setSheetIdOrUrl(e.target.value)}
              placeholder="https://docs.google.com/spreadsheets/d/ABC.../edit  ou  ABC..."
              disabled={!gdriveConnected || importing}
              className="flex-1 bg-black/30 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white/70 placeholder:text-white/20 focus:border-indigo-500/50 focus:outline-none transition-colors font-mono disabled:opacity-40"
            />
            <button
              onClick={handleSheetImport}
              disabled={!gdriveConnected || importing || !sheetIdOrUrl.trim()}
              className="px-3 py-1.5 rounded-lg bg-indigo-500/20 hover:bg-indigo-500/30 text-indigo-300 border border-indigo-500/30 text-[11px] font-medium disabled:opacity-40 transition-colors"
            >
              {importing ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Importer'}
            </button>
          </div>
          {importedUrls.length > 0 && (
            <div className="flex items-center justify-between p-2 rounded bg-emerald-500/10 border border-emerald-500/20">
              <span className="text-[11px] text-emerald-300">{importedUrls.length} URL{importedUrls.length > 1 ? 's' : ''} importée{importedUrls.length > 1 ? 's' : ''}</span>
              <button onClick={() => setImportedUrls([])} className="text-emerald-400/60 hover:text-emerald-300">
                <XIcon className="w-3 h-3" />
              </button>
            </div>
          )}
        </div>
      )}

      {/* Aperçu des URLs en mode multi (10 premières) */}
      {isMulti && multiUrls.length > 0 && (
        <div className="max-h-32 overflow-y-auto space-y-0.5 p-2 bg-black/20 border border-white/[0.06] rounded-lg">
          {multiUrls.slice(0, 10).map((u, i) => (
            <p key={i} className="text-[10px] text-white/40 font-mono truncate" title={u}>
              <span className="text-white/15 mr-1.5">{String(i + 1).padStart(2, '0')}</span>{u}
            </p>
          ))}
          {multiUrls.length > 10 && (
            <p className="text-[10px] text-white/25 italic">… et {multiUrls.length - 10} autre{multiUrls.length - 10 > 1 ? 's' : ''}</p>
          )}
        </div>
      )}

      <BrandSuggestion url={url} onAccept={(u) => onUrlSuggestion?.(u)} />

      {/* Cible + Mode */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          {/* Cible : single vs multiple */}
          <div className="flex-1">
            <label className="text-[10px] text-white/30 uppercase tracking-wider block mb-1">Type de page</label>
            <div className="flex rounded-md overflow-hidden border border-white/10">
              {([['single', 'Produit unique'], ['multiple', 'Liste / Catalogue']] as [ExtractionTarget, string][]).map(([t, label]) => (
                <button key={t} onClick={() => setTarget(t)}
                  className={`flex-1 text-[11px] px-2 py-1.5 transition-colors ${target === t ? 'bg-emerald-500/20 text-emerald-300' : 'text-white/30 hover:text-white/50'}`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          {/* Mode schema vs auto */}
          <div>
            <label className="text-[10px] text-white/30 uppercase tracking-wider block mb-1">Champs</label>
            <div className="flex rounded-md overflow-hidden border border-white/10">
              {(['auto', 'schema'] as ScrapingMode[]).map((m) => {
                const disabled = m === 'auto' && target === 'single'
                return (
                  <button key={m}
                    onClick={() => !disabled && setMode(m)}
                    disabled={disabled}
                    title={disabled ? "Mode auto non disponible pour produit unique" : undefined}
                    className={`text-[11px] px-3 py-1.5 transition-colors ${mode === m ? 'bg-indigo-500/20 text-indigo-300' : disabled ? 'text-white/15 cursor-not-allowed' : 'text-white/30 hover:text-white/50'}`}
                  >
                    {m === 'auto' ? 'Auto' : 'Schéma'}
                  </button>
                )
              })}
            </div>
          </div>
        </div>

        <div className="flex gap-1.5 flex-wrap items-center">
          <span className="text-[10px] text-white/20">Templates :</span>
          {Object.entries(FIELD_TEMPLATES).map(([key, t]) => (
            <button
              key={key}
              onClick={() => { setFields(t.fields); setMode('schema') }}
              className={`text-[11px] px-2.5 py-0.5 rounded-full border transition-colors ${
                fields === t.fields
                  ? 'bg-indigo-500/20 border-indigo-500/30 text-indigo-300'
                  : 'bg-white/[0.04] border-white/[0.08] text-white/50 hover:text-indigo-300 hover:border-indigo-500/30 hover:bg-indigo-500/10'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Schema */}
      {mode === 'schema' && <SchemaEditor fields={fields} onChange={setFields} />}

      {/* Prompt */}
      <div>
        <label className="text-[10px] text-white/30 uppercase tracking-wider block mb-1.5">Prompt IA</label>
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="Ex : Extrais uniquement le produit principal, ignore les accessoires liés..."
          rows={2}
          className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-xs text-white/70 placeholder:text-white/20 focus:border-indigo-500/50 focus:outline-none resize-none transition-colors font-mono"
        />
      </div>

      {/* Fil d'Ariane manuel — override pour les sites protégés anti-bot */}
      {hasBreadcrumbField && (
        <div>
          <label className="text-[10px] text-white/30 uppercase tracking-wider flex items-center justify-between mb-1.5">
            <span>Fil d'Ariane (manuel, override)</span>
            {parsedManualBreadcrumb.length > 0 && (
              <span className="text-[10px] text-emerald-400/80 normal-case tracking-normal">
                {parsedManualBreadcrumb.length} niveau{parsedManualBreadcrumb.length > 1 ? 'x' : ''}
              </span>
            )}
          </label>
          <input
            type="text"
            value={manualBreadcrumb}
            onChange={(e) => setManualBreadcrumb(e.target.value)}
            placeholder="Ex : Homme > Chaussures > Baskets"
            className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-xs text-white/70 placeholder:text-white/20 focus:border-indigo-500/50 focus:outline-none transition-colors font-mono"
          />
          <p className="text-[10px] text-white/25 mt-1">
            Sépare par <code className="text-white/40">&gt;</code>, <code className="text-white/40">/</code> ou <code className="text-white/40">|</code>. Si rempli, écrase l'extraction automatique.
          </p>
        </div>
      )}

      {/* Advanced options */}
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
        </button>
        {showAdvanced && (
          <div className="mt-2 flex flex-wrap gap-3 p-3 bg-black/20 rounded-lg border border-white/[0.06]">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={noCache} onChange={(e) => setNoCache(e.target.checked)}
                className="rounded border-white/20 bg-white/5 text-indigo-500 focus:ring-indigo-500/30" />
              <RefreshCw className="w-3 h-3 text-white/30" />
              <span className="text-[11px] text-white/50">Pas de cache</span>
            </label>
            <div className="flex items-center gap-2">
              <Timer className={`w-3 h-3 ${waitFor > 0 ? 'text-amber-400/70' : 'text-white/30'}`} />
              <select
                value={waitFor}
                onChange={(e) => updateWaitFor(Number(e.target.value))}
                className={`bg-white/5 border rounded px-2 py-0.5 text-[11px] focus:outline-none ${waitFor > 0 ? 'border-amber-500/30 text-amber-300 focus:border-amber-500/50' : 'border-white/10 text-white/60 focus:border-indigo-500/50'}`}
              >
                <option value={0}>Timeout : défaut (10s)</option>
                <option value={10000}>Timeout : 10s</option>
                <option value={15000}>Timeout : 15s</option>
                <option value={20000}>Timeout : 20s</option>
                <option value={30000}>Timeout : 30s</option>
              </select>
            </div>
          </div>
        )}
      </div>

      {/* Action — adapté selon mode single/multi */}
      {isMulti ? (
        <button
          onClick={handleLaunchBatch}
          disabled={multiUrls.length === 0 || batchRunning || loading}
          className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg bg-indigo-500 hover:bg-indigo-600 text-white text-sm font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {batchRunning ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
          {batchRunning
            ? `Enrichissement en cours…`
            : multiUrls.length === 0
              ? 'Aucune URL à enrichir'
              : `Lancer ${multiUrls.length} enrichissement${multiUrls.length > 1 ? 's' : ''}`}
        </button>
      ) : (
        <button
          onClick={() => onScrape(mode, fields, prompt, {
            target,
            waitFor: waitFor > 0 ? waitFor : undefined,
            noCache,
            manualBreadcrumb: parsedManualBreadcrumb.length > 0 ? parsedManualBreadcrumb : undefined,
          })}
          disabled={!url || loading}
          className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg bg-indigo-500 hover:bg-indigo-600 text-white text-sm font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
          {loading ? 'Extraction...' : 'Extraire'}
        </button>
      )}
    </div>
  )
}
