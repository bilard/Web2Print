import { useState, useEffect, useMemo } from 'react'
import { Sparkles, Loader2, ChevronDown, ChevronUp, Timer, RefreshCw, ExternalLink } from 'lucide-react'
import type { ScrapingField, ScrapingMode, ScrapeResult, ExtractionTarget } from './useJina'
import { SchemaEditor } from './SchemaEditor'
import { FIELD_TEMPLATES, detectBrandFromUrl, BRAND_OFFICIAL_SITES } from './useJina'

interface Props {
  url: string
  loading: boolean
  onScrape: (
    mode: ScrapingMode, fields: ScrapingField[], prompt: string,
    opts: { target?: ExtractionTarget; waitFor?: number; noCache?: boolean }
  ) => void
  result: ScrapeResult | null
  /** Appelé quand l'utilisateur clique sur la suggestion de site officiel */
  onUrlSuggestion?: (url: string) => void
}

export function ScrapeTab({ url, loading, onScrape, result, onUrlSuggestion }: Props) {
  const [mode, setMode] = useState<ScrapingMode>('schema')
  const [fields, setFields] = useState<ScrapingField[]>(FIELD_TEMPLATES.product.fields)
  const [prompt, setPrompt] = useState('')
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [target, setTarget] = useState<ExtractionTarget>('single')
  const [noCache, setNoCache] = useState(false)
  const [waitFor, setWaitFor] = useState(0)

  // Détection de marque → suggestion site officiel
  const brandSuggestion = useMemo(() => detectBrandFromUrl(url), [url])

  // Auto-détection des sites SPA/JS-heavy → active waitFor par défaut
  useEffect(() => {
    try {
      const host = new URL(url).hostname
      const isSpa = /milwaukeetool|dewalt|metabo|bosch|stanley|hikoki|festool|makita|stihl|husqvarna|worx|ryobi|aeg-powertools/i.test(host)
      const needsWait = /leroymerlin|castorama|boulanger|fnac|darty|amazon|cdiscount|manomano|conforama|ikea|leroy/i.test(host)
      setWaitFor(isSpa || needsWait ? 10000 : 0)
      if (!isSpa && !needsWait) setWaitFor(0)
    } catch { /* URL invalide */ }
  }, [url])

  // Auto-switch vers template "Produit complet" quand on détecte un site fabricant
  useEffect(() => {
    try {
      const host = new URL(url).hostname
      const isBrandSite = Object.values(BRAND_OFFICIAL_SITES).some(b => host.includes(new URL(b.baseUrl).hostname))
      if (isBrandSite && fields === FIELD_TEMPLATES.product.fields) {
        setFields(FIELD_TEMPLATES.product_full.fields)
      }
    } catch { /* URL invalide */ }
  }, [url])

  return (
    <div className="space-y-4">
      {/* Suggestion site officiel */}
      {brandSuggestion && (
        <div className="flex items-center gap-2 p-2.5 rounded-lg bg-amber-500/8 border border-amber-500/20">
          <ExternalLink className="w-3.5 h-3.5 text-amber-400 shrink-0" />
          <p className="text-[11px] text-amber-300/80 flex-1">
            <strong>{brandSuggestion.officialSite.label}</strong> détecté — privilégier le site officiel pour des données complètes
          </p>
          <button
            onClick={() => onUrlSuggestion?.(brandSuggestion.officialSite.baseUrl)}
            className="text-[10px] px-2 py-1 rounded bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border border-amber-500/20 transition-colors whitespace-nowrap"
          >
            {new URL(brandSuggestion.officialSite.baseUrl).hostname}
          </button>
        </div>
      )}

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
                onChange={(e) => setWaitFor(Number(e.target.value))}
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

      {/* Action */}
      <button
        onClick={() => onScrape(mode, fields, prompt, { target, waitFor: waitFor > 0 ? waitFor : undefined, noCache })}
        disabled={!url || loading}
        className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg bg-indigo-500 hover:bg-indigo-600 text-white text-sm font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
        {loading ? 'Extraction...' : 'Extraire'}
      </button>
    </div>
  )
}
