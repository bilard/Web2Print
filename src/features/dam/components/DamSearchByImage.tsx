import { useCallback, useRef } from 'react'
import { Camera, Loader2 } from 'lucide-react'
import { useDamSearchByImage } from '../hooks/useDamSearchByImage'

export function DamSearchByImage() {
  const { searchByImage, uploading } = useDamSearchByImage()
  const inputRef = useRef<HTMLInputElement>(null)

  const handleClick = useCallback(() => inputRef.current?.click(), [])

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      if (file) searchByImage(file)
      e.target.value = ''
    },
    [searchByImage]
  )

  return (
    <>
      <input ref={inputRef} type="file" accept="image/*" onChange={handleChange} className="hidden" />
      <button
        onClick={handleClick}
        disabled={uploading}
        className="flex items-center justify-center gap-2 h-12 border border-dashed border-indigo-500/30 rounded-lg text-indigo-400 text-[10px] hover:border-indigo-500/60 hover:bg-indigo-500/5 transition disabled:opacity-50"
      >
        {uploading ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          <Camera className="w-4 h-4" />
        )}
        <span>Chercher par image</span>
      </button>
    </>
  )
}
