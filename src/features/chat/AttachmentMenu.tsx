import { useEffect, useRef } from 'react'
import { Paperclip, Camera } from 'lucide-react'

interface AttachmentMenuProps {
  open: boolean
  onClose: () => void
  onPickFiles: () => void
  onScreenshot: () => void
}

export function AttachmentMenu({ open, onClose, onPickFiles, onScreenshot }: AttachmentMenuProps) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('mousedown', handleClick)
    document.addEventListener('keydown', handleKey)
    return () => {
      document.removeEventListener('mousedown', handleClick)
      document.removeEventListener('keydown', handleKey)
    }
  }, [open, onClose])

  if (!open) return null

  return (
    <div
      ref={ref}
      className="absolute bottom-full left-0 mb-2 w-[280px] bg-[#1c1c1c] border border-white/[0.1] rounded-xl shadow-2xl shadow-black/50 overflow-hidden py-1.5 z-50"
    >
      <button
        type="button"
        onClick={() => {
          onClose()
          onPickFiles()
        }}
        className="w-full flex items-center gap-3 px-3 py-2 text-[13px] text-white/85 hover:bg-white/[0.04] hover:text-white transition-colors"
      >
        <Paperclip className="w-4 h-4 text-white/60 shrink-0" />
        <span>Ajouter des fichiers ou des photos</span>
      </button>
      <button
        type="button"
        onClick={() => {
          onClose()
          onScreenshot()
        }}
        className="w-full flex items-center gap-3 px-3 py-2 text-[13px] text-white/85 hover:bg-white/[0.04] hover:text-white transition-colors"
      >
        <Camera className="w-4 h-4 text-white/60 shrink-0" />
        <span>Prendre une capture d&apos;écran</span>
      </button>
    </div>
  )
}
