import { useState } from 'react'
import { RotateCcw, Maximize2, Save, Check, Loader2, Palette, FileCode2 } from 'lucide-react'
import { toast } from 'sonner'
import { saveHtmlZip } from './saveHtmlZip'
import { HyperframesPlayer } from './HyperframesPlayer'
import { downloadHtmlZip, buildHtmlZipBlob } from './exportHtmlZip'
import { useAuthStore } from '@/stores/auth.store'
import type { AspectFormat } from './types'
import type { StyleConfig } from './promptToStyleConfig'
import type { Composition } from './promptToComposition'

interface Props {
  animationId: string
  aspect: AspectFormat
  /** Mode standalone : composition multi-scènes Gemini. */
  composition?: Composition
  /** Mode canvas : SVG capturé. */
  svg?: string
  styleConfig?: StyleConfig
  width?: number
  height?: number
  caption?: string
  brand?: string
  prompt?: string
  initialSaved?: boolean
  onRegenerate: () => void
}

type SaveState = 'idle' | 'saving' | 'saved' | 'error'
type ZipState = 'idle' | 'building' | 'done' | 'error'

const ASPECT_LABEL: Record<AspectFormat, string> = {
  portrait: '9:16',
  square: '1:1',
  landscape: '16:9',
}

/** Construit les `variables` HyperFrames à partir des props, en miroir de ce
 *  que HyperframesPlayer envoie à l'iframe. Centralise le contrat composition
 *  vs design-reveal pour éviter la divergence entre download et upload DAM. */
function buildVariables(props: Props): { isMultiScene: boolean; variables: Record<string, unknown> } {
  if (props.composition) {
    return {
      isMultiScene: true,
      variables: {
        composition: props.composition,
        brand: props.brand,
        prompt: props.prompt,
      },
    }
  }
  return {
    isMultiScene: false,
    variables: {
      svg: props.svg ?? '',
      brand: props.brand,
      caption: props.caption,
      prompt: props.prompt,
      styleConfig: props.styleConfig,
      svgUrl: '',
    },
  }
}

export function VideoResult(props: Props) {
  const {
    animationId,
    aspect,
    composition,
    svg,
    styleConfig,
    width,
    height,
    caption,
    brand,
    prompt,
    initialSaved = false,
    onRegenerate,
  } = props
  const user = useAuthStore((s) => s.user)
  const [saveState, setSaveState] = useState<SaveState>(initialSaved ? 'saved' : 'idle')
  const [zipState, setZipState] = useState<ZipState>('idle')

  const handleDownloadHtmlZip = async () => {
    const { isMultiScene, variables } = buildVariables(props)
    setZipState('building')
    try {
      await downloadHtmlZip({
        aspect,
        isMultiScene,
        variables,
        width,
        height,
        filename: `hyperframes-${animationId}`,
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
      const { isMultiScene, variables } = buildVariables(props)
      const blob = await buildHtmlZipBlob({ aspect, isMultiScene, variables, width, height })
      await saveHtmlZip({
        animationId,
        blob,
        aspect,
        composition,
        styleConfig,
        caption,
        brand,
        prompt,
        width,
        height,
        ownerId: user.uid,
      })
      setSaveState('saved')
      toast.success('Animation ajoutée au DAM')
    } catch (e) {
      setSaveState('error')
      const msg = e instanceof Error ? e.message : String(e)
      console.error('saveHtmlZip failed:', e)
      toast.error(`Sauvegarde échouée : ${msg}`)
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <HyperframesPlayer
        aspect={aspect}
        svg={svg}
        composition={composition}
        brand={brand}
        caption={caption}
        prompt={prompt}
        styleConfig={styleConfig}
        width={width}
        height={height}
        autoPlay
        maxHeight="55vh"
      />

      <div className="flex items-center gap-3 text-[11px] text-white/50 font-mono tabular-nums">
        <span className="flex items-center gap-1.5"><FileCode2 className="w-3 h-3" />HTML/CSS/JS</span>
        <span className="flex items-center gap-1.5"><Maximize2 className="w-3 h-3" />{ASPECT_LABEL[aspect]}</span>
        {width && height && (
          <>
            <span className="text-white/30">·</span>
            <span>{width}×{height}</span>
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
          onClick={handleDownloadHtmlZip}
          disabled={zipState === 'building'}
          className="flex items-center justify-center gap-2 bg-indigo-500 hover:bg-indigo-600 disabled:opacity-50 text-white text-sm font-medium px-3 py-2 rounded-lg transition-colors"
        >
          {zipState === 'building' ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <FileCode2 className="w-3.5 h-3.5" />
          )}
          {zipState === 'building' ? 'Construction du ZIP…' : 'Télécharger HTML (.zip)'}
        </button>

        <div className="flex gap-2">
          <button
            onClick={handleSave}
            disabled={saveState === 'saving' || saveState === 'saved'}
            className={`flex-1 flex items-center justify-center gap-2 text-sm font-medium px-3 py-2 rounded-lg transition-colors border ${
              saveState === 'saved'
                ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300 cursor-default'
                : saveState === 'error'
                ? 'bg-red-500/10 border-red-500/30 text-red-300 hover:bg-red-500/15'
                : 'bg-white/5 hover:bg-white/10 border-white/10 text-white disabled:opacity-50'
            }`}
            title="Sauvegarde le ZIP dans le DAM (Firebase Storage)"
          >
            {saveState === 'saving' && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            {saveState === 'saved' && <Check className="w-3.5 h-3.5" />}
            {(saveState === 'idle' || saveState === 'error') && <Save className="w-3.5 h-3.5" />}
            {saveState === 'saving' && 'Sauvegarde…'}
            {saveState === 'saved' && 'Sauvegardée dans le DAM'}
            {saveState === 'idle' && 'Sauvegarder dans le DAM'}
            {saveState === 'error' && 'Réessayer la sauvegarde'}
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
