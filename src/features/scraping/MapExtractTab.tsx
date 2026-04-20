import { useState } from 'react'
import { Map as MapIcon, Sparkles, Loader2, CheckSquare, Square, Globe, Search } from 'lucide-react'
import type { ScrapingField, MapLink, ScrapeResult } from './useJina'
import { SchemaEditor } from './SchemaEditor'
import { FIELD_TEMPLATES } from './useJina'

interface Props {
  url: string
  loading: boolean
  onMap: (search?: string) => Promise<MapLink[] | null>
  onExtract: (urls: string[], fields: ScrapingField[], prompt: string) => void
  result: ScrapeResult | null
}

export function MapExtractTab({ url, loading, onMap, onExtract, result }: Props) {
  const [links, setLinks] = useState<MapLink[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [mapSearch, setMapSearch] = useState('')
  const [fields, setFields] = useState<ScrapingField[]>(FIELD_TEMPLATES.listing.fields)
  const [prompt, setPrompt] = useState('')
  const [step, setStep] = useState<'map' | 'extract'>('map')

  const handleMap = async () => {
    const found = await onMap(mapSearch)
    if (found) { setLinks(found); setSelected(new Set()); setStep('extract') }
  }

  const toggleAll = () => {
    if (selected.size === links.length) setSelected(new Set())
    else setSelected(new Set(links.map((l) => l.url)))
  }

  const toggle = (url: string) => {
    const next = new Set(selected)
    next.has(url) ? next.delete(url) : next.add(url)
    setSelected(next)
  }

  if (step === 'map' || links.length === 0) {
    return (
      <div className="space-y-4">
        <div className="p-3 bg-blue-500/5 border border-blue-500/20 rounded-lg text-xs text-blue-300/70">
          <strong className="text-blue-300">Map →</strong> Découvrez toutes les URLs d'un site, sélectionnez les pages à extraire, puis lancez l'extraction structurée.
        </div>
        <div className="flex gap-2">
          <div className="flex-1 flex items-center gap-2 bg-black/20 border border-white/10 rounded-lg px-3 py-2">
            <Search className="w-3.5 h-3.5 text-white/20 shrink-0" />
            <input
              value={mapSearch}
              onChange={(e) => setMapSearch(e.target.value)}
              placeholder="Filtrer URLs (ex: produit, blog...)"
              className="flex-1 bg-transparent text-xs text-white/60 placeholder:text-white/20 outline-none"
            />
          </div>
          <button
            onClick={handleMap}
            disabled={!url || loading}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-500/20 hover:bg-blue-500/30 border border-blue-500/20 text-blue-300 text-sm font-medium transition-colors disabled:opacity-40"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <MapIcon className="w-4 h-4" />}
            Mapper le site
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* URL list */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <span className="text-[10px] text-white/30 uppercase tracking-wider">
            {links.length} URLs trouvées — {selected.size} sélectionnées
          </span>
          <div className="flex gap-2">
            <button onClick={toggleAll} className="text-[10px] text-indigo-400/60 hover:text-indigo-400 transition-colors">
              {selected.size === links.length ? 'Tout désélectionner' : 'Tout sélectionner'}
            </button>
            <button onClick={() => { setLinks([]); setStep('map') }} className="text-[10px] text-white/30 hover:text-white/50 transition-colors">
              ← Remapper
            </button>
          </div>
        </div>
        <div className="max-h-48 overflow-y-auto space-y-0.5 border border-white/[0.06] rounded-lg p-1">
          {links.map((link) => (
            <button
              key={link.url}
              onClick={() => toggle(link.url)}
              className={`w-full flex items-center gap-2 px-2 py-1.5 rounded text-left transition-colors ${
                selected.has(link.url) ? 'bg-indigo-500/10' : 'hover:bg-white/[0.03]'
              }`}
            >
              {selected.has(link.url)
                ? <CheckSquare className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                : <Square className="w-3.5 h-3.5 text-white/20 shrink-0" />}
              <Globe className="w-3 h-3 text-white/20 shrink-0" />
              <span className="text-[11px] text-white/60 truncate flex-1">{link.title || link.url}</span>
              <span className="text-[9px] text-white/20 truncate max-w-[150px]">{link.url.replace(/^https?:\/\/[^/]+/, '')}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Schema */}
      <SchemaEditor fields={fields} onChange={setFields} />

      {/* Prompt + options */}
      <textarea
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        placeholder="Prompt IA pour guider l'extraction..."
        rows={2}
        className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-xs text-white/70 placeholder:text-white/20 focus:border-indigo-500/50 focus:outline-none resize-none font-mono"
      />

      <button
        onClick={() => onExtract(Array.from(selected), fields, prompt)}
        disabled={selected.size === 0 || loading}
        className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg bg-indigo-500 hover:bg-indigo-600 text-white text-sm font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
        {loading ? 'Extraction async...' : `Extraire ${selected.size} page${selected.size > 1 ? 's' : ''}`}
      </button>
    </div>
  )
}
