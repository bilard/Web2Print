import { FabricImage } from 'fabric'
import { Crop } from 'lucide-react'
import {
  enterCropMode,
  fitFrameToContent,
  fillFrameProportionally,
  useCroppingImage,
} from '@/features/editor/useImageMask'

interface Props {
  image: FabricImage
}

export function ImageMaskSection({ image }: Props) {
  const cropping = useCroppingImage()
  const isThisCropping = cropping === image

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-semibold text-white/40 uppercase tracking-wider">
          Cadrage
        </span>
      </div>

      <button
        type="button"
        onClick={() => enterCropMode(image)}
        disabled={isThisCropping}
        className="flex items-center justify-center gap-2 w-full py-2 text-xs bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed rounded-md text-white transition-colors"
      >
        <Crop className="w-3.5 h-3.5" />
        {isThisCropping ? 'Mode crop actif' : 'Recadrer la photo'}
      </button>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => fitFrameToContent(image)}
          className="flex-1 py-1.5 text-[10px] bg-white/5 hover:bg-white/10 border border-white/10 hover:border-white/30 rounded-md text-white/40 hover:text-white transition-colors"
        >
          Ajuster cadre
        </button>
        <button
          type="button"
          onClick={() => fillFrameProportionally(image)}
          className="flex-1 py-1.5 text-[10px] bg-white/5 hover:bg-white/10 border border-white/10 hover:border-white/30 rounded-md text-white/40 hover:text-white transition-colors"
        >
          Remplir cadre
        </button>
      </div>

      <p className="text-[10px] text-white/30 leading-relaxed">
        Cliquez sur <span className="text-white/60">Recadrer</span> pour ajuster le cadre et
        repositionner l'image. Validez avec <span className="text-white/60">Entrée</span> ou{' '}
        <span className="text-white/60">Échap</span> pour annuler.
      </p>
    </div>
  )
}
