import { useState } from 'react'
import { Download, RotateCcw, Clock, Maximize2, Film, Save, Check, Loader2, Palette, Sparkles, FileCode2 } from 'lucide-react'
import { toast } from 'sonner'
import { saveRenderedVideo } from './saveVideo'
import { HyperframesPlayer } from './HyperframesPlayer'
import { downloadHtmlZip } from './exportHtmlZip'
import { useAuthStore } from '@/stores/auth.store'
import type { AspectFormat } from './types'
import type { StyleConfig } from './promptToStyleConfig'
import type { Composition } from './promptToComposition'

interface LivePreviewProps {
  svg?: string
  composition?: Composition
  aspect: AspectFormat
  styleConfig?: StyleConfig
  brand?: string
  caption?: string
  prompt?: string
}

interface Props {
  renderId: string
  url: string
  durationMs?: number
  aspect?: AspectFormat
  caption?: string
  brand?: string
  prompt?: string
  styleConfig?: StyleConfig
  initialSaved?: boolean
  onRegenerate: () => void
  preview?: LivePreviewProps
}

type SaveState = 'idle' | 'saving' | 'saved' | 'error'
type ZipState = 'idle' | 'building' | 'done' | 'error'

const ASPECT_LABEL: Record<AspectFormat, string> = {
  portrait: '9:16',
  square: '1:1',
  landscape: '16:9',
}

const ASPECT_MAX_HEIGHT: Record<AspectFormat, string> = {
  portrait: '60vh',
  square: '50vh',
  landscape: '36vh',
}

type ViewMode = 'mp4' | 'live'

export function VideoResult({ renderId, url, durationMs, aspect = 'square', caption, brand, prompt, styleConfig, initialSaved = false, onRegenerate, preview }: Props) {
  const user = useAuthStore((s) => s.user)
  const [saveState, setSaveState] = useState<SaveState>(initialSaved ? 'saved' : 'idle')
  const [zipState, setZipState] = useState<ZipState>('idle')
  const [viewMode, setViewMode] = useState<ViewMode>('mp4')

  /** Construit un ZIP HTML/CSS/JS du template (avec vars injectées) et le
   *  télécharge. On reconstruit les variables comme le `HyperframesPlayer` le
   *  fait : multi-scene (composition) vs design-reveal (svg + brand + caption). */
  const handleDownloadHtmlZip = async () => {
    const isMultiScene = !!preview?.composition
    const variables: Record<string, unknown> = isMultiScene
      ? {
          composition: preview?.composition,
          brand: preview?.brand,
          prompt: preview?.prompt,
        }
      : {
          svg: preview?.svg ?? '',
          brand: preview?.brand,
          caption: preview?.caption ?? caption,
          prompt: preview?.prompt ?? prompt,
          styleConfig: preview?.styleConfig ?? styleConfig,
          svgUrl: '',
        }
    setZipState('building')
    try {
      await downloadHtmlZip({
        aspect: preview?.aspect ?? aspect,
        isMultiScene,
        variables,
        filename: `hyperframes-${renderId}`,
      })
      setZipState('done')
      toast.success('ZIP HTML téléchargé')
    } catch (e) {
      setZipState('error')
      const msg = e instanceof Error ? e.message : String(e)
      console.error('downloadHtmlZip failed:', e)
      toast.error(`Export HTML échoué : ${msg}`)
    }
  }

  const handleSave = async () => {
    if (!user?.uid) {
      toast.error('Connecte-toi pour sauvegarder dans le DAM')
      return
    }
    setSaveState('saving')
    try {
      await saveRenderedVideo({ renderId, url, durationMs, aspect, caption, brand, prompt, styleConfig, ownerId: user.uid })
      setSaveState('saved')
      toast.success('Vidéo ajoutée au DAM')
    } catch (e) {
      setSaveState('error')
      const msg = e instanceof Error ? e.message : String(e)
      console.error('saveRenderedVideo failed:', e)
      toast.error(`Sauvegarde échouée : ${msg}`)
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {preview && (
        <div className="flex items-center gap-1 p-1 bg-white/5 border border-white/10 rounded-lg self-start">
          <button
            type="button"
            onClick={() => setViewMode('mp4')}
            className={`flex items-center gap-1.5 text-[11px] font-medium px-2.5 py-1 rounded transition-colors ${
              viewMode === 'mp4'
                ? 'bg-white/10 text-white'
                : 'text-white/50 hover:text-white/80'
            }`}
          >
            <Film className="w-3 h-3" />
            MP4
          </button>
          <button
            type="button"
            onClick={() => setViewMode('live')}
            className={`flex items-center gap-1.5 text-[11px] font-medium px-2.5 py-1 rounded transition-colors ${
              viewMode === 'live'
                ? 'bg-white/10 text-white'
                : 'text-white/50 hover:text-white/80'
            }`}
          >
            <Sparkles className="w-3 h-3" />
            Aperçu live
          </button>
        </div>
      )}

      {viewMode === 'live' && preview ? (
        <HyperframesPlayer
          aspect={preview.aspect}
          svg={preview.svg}
          composition={preview.composition}
          brand={preview.brand}
          caption={preview.caption}
          prompt={preview.prompt}
          styleConfig={preview.styleConfig}
          autoPlay
        />
      ) : (
        <div
          className="rounded-xl border border-white/10 bg-black overflow-hidden flex items-center justify-center"
          style={{ maxHeight: ASPECT_MAX_HEIGHT[aspect] }}
        >
          <video
            src={url}
            controls
            autoPlay
            loop
            muted
            className="block w-auto h-auto max-w-full"
            style={{ maxHeight: ASPECT_MAX_HEIGHT[aspect] }}
          />
        </div>
      )}

      <div className="flex items-center gap-3 text-[11px] text-white/50 font-mono tabular-nums">
        <span className="flex items-center gap-1.5"><Film className="w-3 h-3" />MP4</span>
        <span className="flex items-center gap-1.5"><Maximize2 className="w-3 h-3" />{ASPECT_LABEL[aspect]}</span>
        <span className="text-white/30">·</span>
        <span>10s</span>
        {durationMs !== undefined && (
          <>
            <span className="text-white/30">·</span>
            <span className="flex items-center gap-1.5">
              <Clock className="w-3 h-3" />
              rendu en {(durationMs / 1000).toFixed(1)}s
            </span>
          </>
        )}
      </div>

      {styleConfig && (
        <div className="bg-indigo-500/5 border border-indigo-500/20 rounded-lg p-2.5 text-[11px] text-white/70 leading-relaxed">
          <div className="flex items-center gap-1.5 mb-1.5 text-indigo-300 font-medium">
            <Palette className="w-3 h-3" />
            Style appliqué par Gemini
          </div>
          <div className="font-mono tabular-nums flex flex-wrap items-center gap-x-2 gap-y-0.5">
            <span>pace=<span className="text-white">{styleConfig.pace}</span></span>
            <span className="text-white/30">·</span>
            <span>intensity=<span className="text-white">{styleConfig.intensity}</span></span>
            <span className="text-white/30">·</span>
            <span>ease=<span className="text-white">{styleConfig.ease}</span></span>
            <span className="text-white/30">·</span>
            <span className="flex items-center gap-1">
              <span className="inline-block w-2.5 h-2.5 rounded-sm border border-white/20" style={{ background: styleConfig.palette.bg }} />
              <span className="inline-block w-2.5 h-2.5 rounded-sm border border-white/20" style={{ background: styleConfig.palette.accent }} />
            </span>
          </div>
          <p className="mt-1.5 text-white/50 italic">{styleConfig.mood}</p>
        </div>
      )}

      <div className="flex flex-col gap-2">
        <button
          onClick={handleSave}
          disabled={saveState === 'saving' || saveState === 'saved'}
          className={`flex items-center justify-center gap-2 text-sm font-medium px-3 py-2 rounded-lg transition-colors ${
            saveState === 'saved'
              ? 'bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 cursor-default'
              : saveState === 'error'
              ? 'bg-red-500/10 border border-red-500/30 text-red-300 hover:bg-red-500/15'
              : 'bg-indigo-500 hover:bg-indigo-600 text-white disabled:opacity-50'
          }`}
        >
          {saveState === 'saving' && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
          {saveState === 'saved' && <Check className="w-3.5 h-3.5" />}
          {(saveState === 'idle' || saveState === 'error') && <Save className="w-3.5 h-3.5" />}
          {saveState === 'saving' && 'Sauvegarde…'}
          {saveState === 'saved' && 'Sauvegardée dans le DAM'}
          {saveState === 'idle' && 'Sauvegarder dans le DAM'}
          {saveState === 'error' && 'Réessayer la sauvegarde'}
        </button>

        <div className="flex gap-2">
          <a
            href={url}
            download
            className="flex-1 flex items-center justify-center gap-2 bg-white/5 hover:bg-white/10 border border-white/10 text-white text-sm font-medium px-3 py-2 rounded-lg transition-colors"
            title="Télécharger la vidéo MP4"
          >
            <Download className="w-3.5 h-3.5" />
            MP4
          </a>
          <button
            type="button"
            onClick={handleDownloadHtmlZip}
            disabled={zipState === 'building' || !preview}
            className="flex-1 flex items-center justify-center gap-2 bg-white/5 hover:bg-white/10 disabled:opacity-40 disabled:cursor-not-allowed border border-white/10 text-white text-sm font-medium px-3 py-2 rounded-lg transition-colors"
            title={
              preview
                ? 'Télécharger le template HTML/CSS/JS comme ZIP (prêt à ouvrir dans un navigateur)'
                : 'Aperçu live indisponible — ZIP HTML désactivé'
            }
          >
            {zipState === 'building' ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <FileCode2 className="w-3.5 h-3.5" />
            )}
            {zipState === 'building' ? 'ZIP…' : 'HTML (.zip)'}
          </button>
          <button
            onClick={onRegenerate}
            className="flex items-center justify-center gap-2 bg-white/5 hover:bg-white/10 border border-white/10 text-white text-sm font-medium px-3 py-2 rounded-lg transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Refaire
          </button>
        </div>
      </div>
    </div>
  )
}
