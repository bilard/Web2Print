import { useState, useEffect, useCallback } from 'react'
import { Sparkles, Loader2, AlertCircle, Plus, Check, ImageIcon, X, Square } from 'lucide-react'
import { globalFabricCanvas } from '@/features/editor/CanvasContainer'
import { useNanoBanaStore } from '@/stores/nanobana.store'
import { useImageGeneration } from './useImageGeneration'
import type { GalleryImage, GenerationRequest } from './types'

const ASPECT_RATIOS: { value: GenerationRequest['aspectRatio']; label: string }[] = [
  { value: '1:1', label: '1:1' },
  { value: '16:9', label: '16:9' },
  { value: '9:16', label: '9:16' },
  { value: '4:3', label: '4:3' },
  { value: '3:4', label: '3:4' },
]

const QUICK_PROMPTS = [
  'Abstract gradient background',
  'Minimal geometric pattern',
  'Watercolor texture',
  'Nature landscape photo',
  'Product mockup on white',
  'Dark moody atmosphere',
]

/** Info about any selected block (image or other shape) */
interface SelectedBlockInfo {
  /** Type of the Fabric object */
  objectType: string
  name: string
  displayWidth: number
  displayHeight: number
  /** Only set for images — base64 source for image-to-image editing */
  dataUrl?: string
  base64?: string
  mimeType?: string
}

function getSelectedBlock(): SelectedBlockInfo | null {
  try {
    const canvas = globalFabricCanvas
    if (!canvas) { console.log('[GenerateTab] no canvas'); return null }
    const obj = canvas.getActiveObject()
    if (!obj) { console.log('[GenerateTab] no active object'); return null }
    // Skip page background, grid, and multi-selection
    if (obj.data?.isGrid || obj.data?.isPageBg) return null
    if (obj.type === 'activeselection') return null

    const objType = obj.type ?? 'object'
    const name = (obj.data?.name as string) ?? objType
    const displayWidth = obj.getScaledWidth()
    const displayHeight = obj.getScaledHeight()

    const info: SelectedBlockInfo = { objectType: objType, name, displayWidth, displayHeight }

    // If it's an image, also extract base64 for image-to-image editing
    if (objType === 'image') {
      try {
        const dataUrl = obj.toDataURL({ format: 'png', multiplier: 1 })
        info.dataUrl = dataUrl
        info.base64 = dataUrl.replace(/^data:image\/\w+;base64,/, '')
        info.mimeType = 'image/png'
      } catch (e) {
        console.warn('[GenerateTab] toDataURL failed:', e)
      }
    }

    console.log('[GenerateTab] detected block:', objType, displayWidth, 'x', displayHeight)
    return info
  } catch (e) {
    console.error('[GenerateTab] getSelectedBlock error:', e)
    return null
  }
}

interface Props {
  onAddToCanvas?: (image: GalleryImage) => void
  onReplaceSelected?: (image: GalleryImage) => void
}

export function GenerateTab({ onAddToCanvas, onReplaceSelected }: Props) {
  const [prompt, setPrompt] = useState('')
  const [aspectRatio, setAspectRatio] = useState<GenerationRequest['aspectRatio']>('1:1')
  const [lastGenerated, setLastGenerated] = useState<GalleryImage | null>(null)
  const [selectedBlock, setSelectedBlock] = useState<SelectedBlockInfo | null>(null)
  const [useSelected, setUseSelected] = useState(true)
  const { generating, generationError } = useNanoBanaStore()
  const { generateImage } = useImageGeneration()

  // Listen for canvas selection changes
  const refreshSelection = useCallback(() => {
    const block = getSelectedBlock()
    console.log('[GenerateTab] refreshSelection:', block?.objectType, block?.name, block?.displayWidth, block?.displayHeight)
    setSelectedBlock(block)
  }, [])

  // Re-check selection on mount and whenever canvas events fire
  useEffect(() => {
    // Retry a few times on mount in case canvas isn't ready yet
    refreshSelection()
    const t1 = setTimeout(refreshSelection, 50)
    const t2 = setTimeout(refreshSelection, 200)

    const canvas = globalFabricCanvas
    if (canvas) {
      canvas.on('selection:created', refreshSelection)
      canvas.on('selection:updated', refreshSelection)
      canvas.on('selection:cleared', refreshSelection)
    }
    return () => {
      clearTimeout(t1)
      clearTimeout(t2)
      if (canvas) {
        canvas.off('selection:created', refreshSelection)
        canvas.off('selection:updated', refreshSelection)
        canvas.off('selection:cleared', refreshSelection)
      }
    }
  }, [refreshSelection])

  const handleGenerate = async () => {
    if (!prompt.trim() || generating) return
    setLastGenerated(null)

    const request: GenerationRequest = { prompt: prompt.trim(), aspectRatio }

    // Pass target dimensions from the selected block
    if (useSelected && selectedBlock) {
      request.targetWidth = Math.round(selectedBlock.displayWidth)
      request.targetHeight = Math.round(selectedBlock.displayHeight)
      // If it's an image, also attach source for image-to-image editing
      if (selectedBlock.base64 && selectedBlock.mimeType) {
        request.sourceImageBase64 = selectedBlock.base64
        request.sourceImageMimeType = selectedBlock.mimeType
      }
    }

    const image = await generateImage(request)
    if (image) {
      setLastGenerated(image)
      setPrompt('')
      // Remplacer directement le bloc sélectionné
      if (hasBlock) {
        onReplaceSelected?.(image)
      }
    }
  }

  const isImageSelected = selectedBlock?.objectType === 'image'
  const hasBlock = useSelected && selectedBlock

  return (
    <div className="flex flex-col gap-3">
      {/* Selected block reference */}
      {selectedBlock && (
        <div className={`flex items-center gap-2.5 p-2 rounded-lg border transition-all ${
          useSelected
            ? 'bg-indigo-500/10 border-indigo-500/30'
            : 'bg-white/5 border-white/10 opacity-60'
        }`}>
          {selectedBlock.dataUrl ? (
            <img
              src={selectedBlock.dataUrl}
              alt=""
              className="w-10 h-10 rounded object-cover border border-white/10"
            />
          ) : (
            <div className="w-10 h-10 rounded bg-white/10 border border-white/10 flex items-center justify-center">
              <Square className="w-5 h-5 text-white/30" />
            </div>
          )}
          <div className="flex-1 min-w-0">
            <p className="text-[10px] text-white/50 truncate">{selectedBlock.name}</p>
            <p className="text-[10px] text-indigo-400/70">
              {useSelected
                ? `${Math.round(selectedBlock.displayWidth)} × ${Math.round(selectedBlock.displayHeight)} px`
                : 'Non utilisé'}
            </p>
          </div>
          <button
            onClick={() => setUseSelected(!useSelected)}
            title={useSelected ? 'Désactiver' : 'Activer comme cible'}
            className={`w-6 h-6 rounded flex items-center justify-center transition-all ${
              useSelected
                ? 'bg-indigo-500/20 text-indigo-400 hover:bg-red-500/20 hover:text-red-400'
                : 'bg-white/10 text-white/30 hover:bg-indigo-500/20 hover:text-indigo-400'
            }`}
          >
            {useSelected ? <X className="w-3 h-3" /> : <ImageIcon className="w-3 h-3" />}
          </button>
        </div>
      )}

      {/* Prompt input */}
      <div className="flex flex-col gap-2">
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleGenerate() } }}
          placeholder={hasBlock ? (isImageSelected ? 'Décrivez la modification...' : 'Décrivez l\'image à générer...') : 'Décrivez l\'image à générer...'}
          rows={3}
          className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder:text-white/25 focus:outline-none focus:border-indigo-500/50 resize-none"
        />

        {/* Aspect ratio — hidden when a block is selected (dimensions come from the block) */}
        {!hasBlock && (
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] text-white/30 shrink-0">Ratio :</span>
            {ASPECT_RATIOS.map(({ value, label }) => (
              <button
                key={value}
                onClick={() => setAspectRatio(value)}
                className={`text-[10px] px-2 py-1 rounded transition-all ${
                  aspectRatio === value
                    ? 'bg-indigo-500/20 text-indigo-400 border border-indigo-500/30'
                    : 'bg-white/5 text-white/40 border border-transparent hover:bg-white/10'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        )}

        {/* Generate button */}
        <button
          onClick={handleGenerate}
          disabled={!prompt.trim() || generating}
          className="w-full flex items-center justify-center gap-2 bg-indigo-500 hover:bg-indigo-600 disabled:bg-white/10 disabled:text-white/30 text-white font-medium text-sm py-2.5 rounded-xl transition-colors"
        >
          {generating ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Sparkles className="w-4 h-4" />
          )}
          {generating
            ? (hasBlock ? 'Génération...' : 'Génération...')
            : (hasBlock ? (isImageSelected ? 'Modifier l\'image' : 'Générer dans le bloc') : 'Générer')}
        </button>
      </div>

      {/* Generated preview */}
      {lastGenerated && (
        <div className="flex flex-col gap-2">
          <div className="relative bg-white/5 border border-indigo-500/30 rounded-lg overflow-hidden">
            <img
              src={lastGenerated.thumbnailUrl}
              alt={lastGenerated.name}
              className="w-full aspect-square object-cover"
            />
            <span className="absolute top-1.5 left-1.5 text-[8px] bg-indigo-500/80 text-white px-1.5 py-0.5 rounded font-medium">
              AI
            </span>
          </div>
          <div className="flex gap-2">
            {selectedBlock && (
              <button
                onClick={() => onReplaceSelected?.(lastGenerated)}
                className="flex-1 flex items-center justify-center gap-1.5 bg-indigo-500 hover:bg-indigo-600 text-white text-xs font-medium py-2 rounded-lg transition-colors"
              >
                <ImageIcon className="w-3.5 h-3.5" />
                Remplacer
              </button>
            )}
            <button
              onClick={() => onAddToCanvas?.(lastGenerated)}
              className={`flex-1 flex items-center justify-center gap-1.5 text-xs font-medium py-2 rounded-lg transition-colors ${
                selectedBlock
                  ? 'bg-white/10 hover:bg-white/15 text-white/70'
                  : 'bg-indigo-500 hover:bg-indigo-600 text-white'
              }`}
            >
              <Plus className="w-3.5 h-3.5" />
              Ajouter
            </button>
          </div>
          <div className="flex items-center gap-1.5 justify-center">
            <Check className="w-3 h-3 text-green-400" />
            <p className="text-[10px] text-green-400/70">Sauvée dans la galerie</p>
          </div>
        </div>
      )}

      {/* Error */}
      {generationError && (
        <div className="flex items-start gap-2 bg-red-500/10 border border-red-500/20 rounded-lg p-2.5">
          <AlertCircle className="w-3.5 h-3.5 text-red-400 shrink-0 mt-0.5" />
          <p className="text-[10px] text-red-400/80 leading-relaxed">{generationError}</p>
        </div>
      )}

      {/* Quick prompts */}
      <div className="flex flex-col gap-1.5">
        <p className="text-[10px] text-white/30 uppercase tracking-wider font-medium">
          {hasBlock && isImageSelected ? 'Suggestions d\'édition' : 'Suggestions'}
        </p>
        <div className="flex flex-wrap gap-1">
          {(hasBlock && isImageSelected ? EDIT_PROMPTS : QUICK_PROMPTS).map((qp) => (
            <button
              key={qp}
              onClick={() => setPrompt(qp)}
              className="text-[10px] bg-white/5 hover:bg-white/10 border border-white/10 text-white/50 hover:text-white/70 px-2 py-1 rounded-md transition-all"
            >
              {qp}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

const EDIT_PROMPTS = [
  'Remove the background',
  'Make it brighter and more vibrant',
  'Convert to watercolor style',
  'Add a soft shadow',
  'Change colors to blue tones',
  'Make it look vintage',
]
