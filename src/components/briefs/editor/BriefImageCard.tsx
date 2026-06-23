import { RefreshCw, ImageIcon, Loader2 } from 'lucide-react'
import { useState } from 'react'
import { CloseButton } from '@/components/shared/CloseButton'

interface Props {
  label: string
  imageUrl?: string
  loading?: boolean
  onRegenerate: () => void
}

export function BriefImageCard({ label, imageUrl, loading, onRegenerate }: Props) {
  const [isFullscreen, setIsFullscreen] = useState(false)

  return (
    <>
      <div className="bg-surface-2 border border-white/[0.06] rounded-md overflow-hidden flex flex-col">
        <div
          className="aspect-square bg-background flex items-center justify-center relative cursor-zoom-in"
          onDoubleClick={() => imageUrl && setIsFullscreen(true)}
          title={imageUrl ? 'Double-clic pour agrandir' : undefined}
        >
          {imageUrl ? (
            <img src={imageUrl} alt={label} className="w-full h-full object-cover" />
          ) : (
            <ImageIcon className="w-6 h-6 text-white/20" />
          )}
          {loading && (
            <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
              <Loader2 className="w-5 h-5 text-white/80 animate-spin" />
            </div>
          )}
        </div>
        <div className="px-3 py-2 flex items-center justify-between gap-2">
          <span className="text-[11px] text-white/70 truncate flex-1">{label}</span>
          <button
            onClick={onRegenerate}
            disabled={loading}
            className="text-white/40 hover:text-white disabled:opacity-30"
            aria-label="Régénérer"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Modal fullscreen */}
      {isFullscreen && imageUrl && (
        <div
          className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4 backdrop-blur-sm"
          onClick={() => setIsFullscreen(false)}
        >
          <div className="relative max-w-[90vw] max-h-[90vh]" onClick={(e) => e.stopPropagation()}>
            <img
              src={imageUrl}
              alt={label}
              className="max-w-full max-h-full object-contain"
            />
            <CloseButton
              onClick={() => setIsFullscreen(false)}
              title="Fermer"
              className="absolute top-4 right-4"
            />
            <div className="absolute bottom-4 left-4 bg-black/50 rounded px-3 py-2">
              <p className="text-[#fff] text-sm">{label}</p>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
