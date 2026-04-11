import { useCallback, useState } from 'react'
import { Sparkles, Loader2, Download, Plus, RotateCcw } from 'lucide-react'
import { generateImage } from '../../briefs/ai/geminiImageClient'
import { useDamCanvasInsert } from '../hooks/useDamCanvasInsert'

type OutputFormat = 'images-text' | 'images-only'
type AspectRatio = 'auto' | '1:1' | '16:9' | '9:16' | '4:3' | '3:4'
type Resolution = '512' | '1K' | '2K' | '4K'

const ASPECT_RATIOS: { value: AspectRatio; label: string }[] = [
  { value: 'auto', label: 'Auto' },
  { value: '1:1', label: '1:1' },
  { value: '16:9', label: '16:9' },
  { value: '9:16', label: '9:16' },
  { value: '4:3', label: '4:3' },
  { value: '3:4', label: '3:4' },
]

const RESOLUTIONS: { value: Resolution; label: string }[] = [
  { value: '512', label: '512' },
  { value: '1K', label: '1K' },
  { value: '2K', label: '2K' },
  { value: '4K', label: '4K' },
]

interface GenerateConfig {
  outputFormat: OutputFormat
  temperature: number
  aspectRatio: AspectRatio
  resolution: Resolution
  numberOfImages: number
}

const DEFAULT_CONFIG: GenerateConfig = {
  outputFormat: 'images-only',
  temperature: 1,
  aspectRatio: 'auto',
  resolution: '1K',
  numberOfImages: 1,
}

interface GeneratedImage {
  url: string
  blob: Blob
}

export function DamGenerate() {
  const [prompt, setPrompt] = useState('')
  const [config, setConfig] = useState<GenerateConfig>(DEFAULT_CONFIG)
  const [generating, setGenerating] = useState(false)
  const [images, setImages] = useState<GeneratedImage[]>([])
  const [error, setError] = useState<string | null>(null)
  const { insertOnCanvas } = useDamCanvasInsert()

  const handleGenerate = useCallback(async () => {
    if (!prompt.trim() || generating) return
    setGenerating(true)
    setError(null)

    try {
      const aspectHint =
        config.aspectRatio !== 'auto'
          ? ` Generate the image in ${config.aspectRatio} aspect ratio.`
          : ''
      const fullPrompt = `${prompt.trim()}${aspectHint}`

      const results: GeneratedImage[] = []
      for (let i = 0; i < config.numberOfImages; i++) {
        const { blob } = await generateImage(fullPrompt)
        const url = URL.createObjectURL(blob)
        results.push({ url, blob })
      }
      setImages(results)
    } catch (err) {
      console.error('Generation failed:', err)
      setError(err instanceof Error ? err.message : 'Erreur de génération')
    } finally {
      setGenerating(false)
    }
  }, [prompt, config, generating])

  const handleDownload = useCallback((img: GeneratedImage, index: number) => {
    const a = document.createElement('a')
    a.href = img.url
    a.download = `nano-banana-${Date.now()}-${index + 1}.png`
    a.click()
  }, [])

  const handleInsertCanvas = useCallback(
    (img: GeneratedImage) => {
      const damImage = {
        id: `gen-${Date.now()}`,
        sourceProvider: 'pexels' as const,
        sourceId: '',
        sourceUrl: '',
        thumbnailUrl: img.url,
        previewUrl: img.url,
        fullUrl: img.url,
        width: 1024,
        height: 1024,
        photographer: 'Nano Banana',
        photographerUrl: '',
        description: prompt,
        tags: [],
        color: '#000000',
        orientation: 'square' as const,
      }
      insertOnCanvas(damImage)
    },
    [insertOnCanvas, prompt]
  )

  return (
    <div className="flex h-full">
      {/* Config sidebar */}
      <div className="w-[260px] bg-[#141414] border-r border-white/5 p-4 flex flex-col gap-4 overflow-y-auto shrink-0">
        <div className="flex items-center gap-2 mb-1">
          <Sparkles className="w-4 h-4 text-indigo-400" />
          <span className="text-xs font-medium text-white/80">Nano Banana</span>
        </div>

        {/* Prompt */}
        <div>
          <div className="text-[9px] text-white/40 uppercase tracking-wider mb-1.5">Prompt</div>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Décrivez l'image à générer..."
            rows={4}
            className="w-full bg-[#111] border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder:text-white/30 outline-none focus:border-indigo-500/50 resize-none"
          />
        </div>

        {/* Output format */}
        <div>
          <div className="text-[9px] text-white/40 uppercase tracking-wider mb-1.5">Format de sortie</div>
          <div className="flex gap-1">
            <button
              onClick={() => setConfig((c) => ({ ...c, outputFormat: 'images-text' }))}
              className={`flex-1 px-2 py-1.5 rounded text-[10px] transition ${
                config.outputFormat === 'images-text'
                  ? 'bg-indigo-500/20 text-indigo-400'
                  : 'bg-white/5 text-white/50 hover:bg-white/10'
              }`}
            >
              Images & texte
            </button>
            <button
              onClick={() => setConfig((c) => ({ ...c, outputFormat: 'images-only' }))}
              className={`flex-1 px-2 py-1.5 rounded text-[10px] transition ${
                config.outputFormat === 'images-only'
                  ? 'bg-indigo-500/20 text-indigo-400'
                  : 'bg-white/5 text-white/50 hover:bg-white/10'
              }`}
            >
              Images seul.
            </button>
          </div>
        </div>

        {/* Temperature */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <div className="text-[9px] text-white/40 uppercase tracking-wider">Température</div>
            <span className="text-[10px] text-white/50 font-mono">{config.temperature.toFixed(1)}</span>
          </div>
          <input
            type="range"
            min={0}
            max={2}
            step={0.1}
            value={config.temperature}
            onChange={(e) => setConfig((c) => ({ ...c, temperature: parseFloat(e.target.value) }))}
            className="w-full h-1 bg-white/10 rounded-full appearance-none cursor-pointer accent-indigo-500
              [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3
              [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-indigo-500"
          />
          <div className="flex justify-between text-[9px] text-white/20 mt-0.5">
            <span>Précis</span>
            <span>Créatif</span>
          </div>
        </div>

        {/* Aspect ratio */}
        <div>
          <div className="text-[9px] text-white/40 uppercase tracking-wider mb-1.5">Ratio</div>
          <div className="flex flex-wrap gap-1">
            {ASPECT_RATIOS.map((ar) => (
              <button
                key={ar.value}
                onClick={() => setConfig((c) => ({ ...c, aspectRatio: ar.value }))}
                className={`px-2 py-1 rounded text-[10px] transition ${
                  config.aspectRatio === ar.value
                    ? 'bg-indigo-500/20 text-indigo-400'
                    : 'bg-white/5 text-white/50 hover:bg-white/10'
                }`}
              >
                {ar.label}
              </button>
            ))}
          </div>
        </div>

        {/* Resolution */}
        <div>
          <div className="text-[9px] text-white/40 uppercase tracking-wider mb-1.5">Résolution</div>
          <div className="flex gap-1">
            {RESOLUTIONS.map((r) => (
              <button
                key={r.value}
                onClick={() => setConfig((c) => ({ ...c, resolution: r.value }))}
                className={`px-2.5 py-1 rounded text-[10px] transition ${
                  config.resolution === r.value
                    ? 'bg-indigo-500/20 text-indigo-400'
                    : 'bg-white/5 text-white/50 hover:bg-white/10'
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>

        {/* Number of images */}
        <div>
          <div className="text-[9px] text-white/40 uppercase tracking-wider mb-1.5">Nombre d'images</div>
          <div className="flex gap-1">
            {[1, 2, 4].map((n) => (
              <button
                key={n}
                onClick={() => setConfig((c) => ({ ...c, numberOfImages: n }))}
                className={`px-3 py-1 rounded text-[10px] transition ${
                  config.numberOfImages === n
                    ? 'bg-indigo-500/20 text-indigo-400'
                    : 'bg-white/5 text-white/50 hover:bg-white/10'
                }`}
              >
                {n}
              </button>
            ))}
          </div>
        </div>

        {/* Generate button */}
        <button
          onClick={handleGenerate}
          disabled={!prompt.trim() || generating}
          className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-indigo-500 text-white text-sm font-medium hover:bg-indigo-600 disabled:opacity-40 disabled:cursor-not-allowed transition mt-2"
        >
          {generating ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Génération...
            </>
          ) : (
            <>
              <Sparkles className="w-4 h-4" />
              Générer
            </>
          )}
        </button>
      </div>

      {/* Result area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-y-auto">
        {images.length === 0 && !generating && !error && (
          <div className="flex-1 flex flex-col items-center justify-center text-white/20 gap-3">
            <Sparkles className="w-12 h-12" />
            <div className="text-sm">Entrez un prompt pour générer des images</div>
            <div className="text-[10px] text-white/10 max-w-[300px] text-center">
              Powered by Gemini — Nano Banana 2
            </div>
          </div>
        )}

        {generating && (
          <div className="flex-1 flex flex-col items-center justify-center text-white/30 gap-3">
            <Loader2 className="w-8 h-8 animate-spin text-indigo-400" />
            <div className="text-sm">Génération en cours...</div>
          </div>
        )}

        {error && (
          <div className="m-4 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
            {error}
          </div>
        )}

        {images.length > 0 && !generating && (
          <div className="p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="text-xs text-white/50">
                {images.length} image{images.length > 1 ? 's' : ''} générée{images.length > 1 ? 's' : ''}
              </div>
              <button
                onClick={() => {
                  images.forEach((img) => URL.revokeObjectURL(img.url))
                  setImages([])
                }}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded text-[10px] text-white/40 hover:text-white/60 hover:bg-white/5 transition"
              >
                <RotateCcw className="w-3 h-3" />
                Effacer
              </button>
            </div>

            <div className={`grid gap-3 ${images.length === 1 ? 'grid-cols-1 max-w-[600px] mx-auto' : 'grid-cols-2'}`}>
              {images.map((img, i) => (
                <div key={i} className="group relative rounded-lg overflow-hidden bg-[#111]">
                  <img
                    src={img.url}
                    alt={`Generated ${i + 1}`}
                    className="w-full object-contain"
                  />
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition flex items-end justify-center pb-3 opacity-0 group-hover:opacity-100">
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleDownload(img, i)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-black/60 text-white text-xs hover:bg-black/80 transition"
                      >
                        <Download className="w-3.5 h-3.5" />
                        Télécharger
                      </button>
                      <button
                        onClick={() => handleInsertCanvas(img)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-500 text-white text-xs hover:bg-indigo-600 transition"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        Canvas
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
