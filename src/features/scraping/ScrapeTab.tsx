import { useState, useEffect } from 'react'
import { Sparkles, Loader2, Monitor, Smartphone, Shield, ChevronDown, ChevronUp, Timer } from 'lucide-react'
import type { ScrapingField, ScrapingMode, ScrapeResult, ExtractionTarget } from './useFirecrawl'
import { SchemaEditor } from './SchemaEditor'
import { FIELD_TEMPLATES } from './useFirecrawl'

interface Props {
  url: string
  loading: boolean
  onScrape: (
    mode: ScrapingMode, fields: ScrapingField[], prompt: string,
    opts: { mobile?: boolean; screenshot?: boolean; proxy?: 'basic' | 'enhanced' | 'auto'; target?: ExtractionTarget; waitFor?: number }
  ) => void
  result: ScrapeResult | null
}

export function ScrapeTab({ url, loading, onScrape, result }: Props) {
  const [mode, setMode] = useState<ScrapingMode>('schema')
  const [fields, setFields] = useState<ScrapingField[]>(FIELD_TEMPLATES.product.fields)
  const [prompt, setPrompt] = useState('')
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [target, setTarget] = useState<ExtractionTarget>('single')
  const [mobile, setMobile] = useState(false)
  const [screenshot, setScreenshot] = useState(false)
  const [proxy, setProxy] = useState<'none' | 'basic' | 'enhanced' | 'auto'>('none')
  const [waitFor, setWaitFor] = useState(0)

  // Auto-détection des sites SPA/JS-heavy → active waitFor et proxy par défaut
  useEffect(() => {
    try {
      const host = new URL(url).hostname
      const isSpa = /milwaukeetool|dewalt|metabo|bosch|stanley|hikoki|festool|makita|stihl|husqvarna|worx|ryobi|aeg-powertools/i.test(host)
      const needsProxy = /leroymerlin|castorama|boulanger|fnac|darty|amazon|cdiscount|manomano|conforama|ikea|leroy/i.test(host)
      setWaitFor(isSpa || needsProxy ? 3000 : 0)
      if (needsProxy && proxy === 'none') setProxy('basic')
      else if (!needsProxy && !isSpa) { setProxy('none'); setWaitFor(0) }
    } catch { /* URL invalide */ }
  }, [url])  

  return (
    <div className="space-y-4">
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
          {/* Mode schema vs auto — auto désactivé pour produit unique */}
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
              className="text-[11px] px-2.5 py-0.5 rounded-full bg-white/[0.04] border border-white/[0.08] text-white/50 hover:text-indigo-300 hover:border-indigo-500/30 hover:bg-indigo-500/10 transition-colors"
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
              <input type="checkbox" checked={mobile} onChange={(e) => setMobile(e.target.checked)}
                className="rounded border-white/20 bg-white/5 text-indigo-500 focus:ring-indigo-500/30" />
              <Smartphone className="w-3 h-3 text-white/30" />
              <span className="text-[11px] text-white/50">Mobile</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={screenshot} onChange={(e) => setScreenshot(e.target.checked)}
                className="rounded border-white/20 bg-white/5 text-indigo-500 focus:ring-indigo-500/30" />
              <Monitor className="w-3 h-3 text-white/30" />
              <span className="text-[11px] text-white/50">Screenshot</span>
            </label>
            <div className="flex items-center gap-2">
              <Shield className="w-3 h-3 text-white/30" />
              <select
                value={proxy}
                onChange={(e) => setProxy(e.target.value as typeof proxy)}
                className="bg-white/5 border border-white/10 rounded px-2 py-0.5 text-[11px] text-white/60 focus:border-indigo-500/50 focus:outline-none"
              >
                <option value="none">Proxy : aucun</option>
                <option value="basic">Proxy basic</option>
                <option value="enhanced">Proxy enhanced</option>
                <option value="auto">Proxy auto</option>
              </select>
            </div>
            <div className="flex items-center gap-2">
              <Timer className={`w-3 h-3 ${waitFor > 0 ? 'text-amber-400/70' : 'text-white/30'}`} />
              <select
                value={waitFor}
                onChange={(e) => setWaitFor(Number(e.target.value))}
                className={`bg-white/5 border rounded px-2 py-0.5 text-[11px] focus:outline-none ${waitFor > 0 ? 'border-amber-500/30 text-amber-300 focus:border-amber-500/50' : 'border-white/10 text-white/60 focus:border-indigo-500/50'}`}
              >
                <option value={0}>Attente JS : aucune</option>
                <option value={1000}>Attente JS : 1s</option>
                <option value={2000}>Attente JS : 2s</option>
                <option value={3000}>Attente JS : 3s</option>
                <option value={5000}>Attente JS : 5s</option>
              </select>
            </div>
          </div>
        )}
      </div>

      {/* Screenshot preview */}
      {result?.screenshot && (
        <div className="space-y-1.5">
          <span className="text-[10px] text-white/30 uppercase tracking-wider">Screenshot</span>
          <img src={result.screenshot} alt="Screenshot" className="w-full rounded-lg border border-white/10 object-cover max-h-48" />
        </div>
      )}

      {/* Action */}
      <button
        onClick={() => onScrape(mode, fields, prompt, { mobile, screenshot, proxy: proxy === 'none' ? undefined : proxy, target, waitFor: waitFor > 0 ? waitFor : undefined })}
        disabled={!url || loading}
        className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg bg-indigo-500 hover:bg-indigo-600 text-white text-sm font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
        {loading ? 'Extraction...' : 'Extraire'}
      </button>
    </div>
  )
}
