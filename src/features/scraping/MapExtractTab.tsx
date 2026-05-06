import { useCallback, useState } from 'react'
import { Map as MapIcon, Sparkles, Loader2, CheckSquare, Square, Globe, Search } from 'lucide-react'
import type { MapLink } from './useJina'
import { BrandSuggestion } from './BrandSuggestion'
import { UrlSourceSelector } from './UrlSourceSelector'

interface Props {
  url: string
  loading: boolean
  /** `rootUrl` permet de boucler sur N URLs racines. */
  onMap: (search?: string, rootUrl?: string) => Promise<MapLink[] | null>
  /** Lance le pipeline d'enrichissement complet (Produit complet) sur N URLs. */
  onEnrichMany: (urls: string[]) => Promise<void> | void
  /** True quand le batch est en cours — désactive le bouton. */
  batchRunning: boolean
  /** Appelé quand l'utilisateur accepte la suggestion site fabricant. */
  onUrlSuggestion?: (suggested: string) => void
}

export function MapExtractTab({ url, loading, onMap, onEnrichMany, batchRunning, onUrlSuggestion }: Props) {
  const [links, setLinks] = useState<MapLink[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [mapSearch, setMapSearch] = useState('')
  const [step, setStep] = useState<'map' | 'extract'>('map')
  const [rootUrls, setRootUrls] = useState<string[]>([])
  const [batchProgress, setBatchProgress] = useState<{ done: number; total: number } | null>(null)

  const handleSourceChange = useCallback((urls: string[]) => {
    setRootUrls(urls)
  }, [])

  const handleMap = async () => {
    if (rootUrls.length === 0) return
    setSelected(new Set())
    if (rootUrls.length === 1) {
      const found = await onMap(mapSearch)
      if (found) { setLinks(found); setStep('extract') }
      return
    }
    // Multi-URL : map chaque racine, agrège, dédoublonne par URL absolue
    setBatchProgress({ done: 0, total: rootUrls.length })
    const merged: MapLink[] = []
    const seen = new Set<string>()
    for (let i = 0; i < rootUrls.length; i++) {
      const found = await onMap(mapSearch, rootUrls[i])
      if (found) {
        for (const link of found) {
          if (!seen.has(link.url)) { merged.push(link); seen.add(link.url) }
        }
      }
      setBatchProgress({ done: i + 1, total: rootUrls.length })
    }
    setBatchProgress(null)
    if (merged.length > 0) { setLinks(merged); setStep('extract') }
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
        <BrandSuggestion url={url} onAccept={(u) => onUrlSuggestion?.(u)} />
        <div className="p-3 bg-blue-500/5 border border-blue-500/20 rounded-lg text-xs text-blue-300/70">
          <strong className="text-blue-300">Map →</strong> Découvre toutes les URLs d'un site, sélectionne les pages produits à scraper, puis lance l'enrichissement complet (Produit complet) sur chacune.
          <br />
          <span className="text-[11px] text-blue-300/50">Mode multi-URL : choisis Liste/Fichier/Sheet pour mapper plusieurs sites en séquence (résultats agrégés et dédoublonnés).</span>
        </div>

        {/* Sélecteur multi-source : 1 URL / Liste / Fichier / Google Sheet */}
        <UrlSourceSelector singleUrl={url} onChange={handleSourceChange} />

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
            disabled={rootUrls.length === 0 || loading}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-500/20 hover:bg-blue-500/30 border border-blue-500/20 text-blue-300 text-sm font-medium transition-colors disabled:opacity-40"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <MapIcon className="w-4 h-4" />}
            {batchProgress
              ? `Mapping ${batchProgress.done + 1}/${batchProgress.total}…`
              : rootUrls.length > 1
                ? `Mapper ${rootUrls.length} sites`
                : 'Mapper le site'}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="p-2.5 bg-indigo-500/5 border border-indigo-500/20 rounded-lg text-[11px] text-indigo-300/70">
        Sélectionne les URLs produits — chacune sera scrapée avec le pipeline <strong className="text-indigo-300">Produit complet</strong> (Jina + IA, multi-sources).
      </div>

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

      <button
        onClick={() => onEnrichMany(Array.from(selected))}
        disabled={selected.size === 0 || loading || batchRunning}
        className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg bg-indigo-500 hover:bg-indigo-600 text-white text-sm font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {batchRunning ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
        {batchRunning
          ? 'Enrichissement en cours...'
          : `Enrichir ${selected.size} produit${selected.size > 1 ? 's' : ''} (Produit complet)`}
      </button>
    </div>
  )
}
