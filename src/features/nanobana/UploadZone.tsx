import { useRef, useState } from 'react'
import { Upload, Loader2, Check } from 'lucide-react'
import { useNanoBanaStore } from '@/stores/nanobana.store'
import { useImageGallery } from './useImageGallery'

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1048576).toFixed(1)} MB`
}

export function UploadZone() {
  const inputRef = useRef<HTMLInputElement>(null)
  const { uploading, setUploading } = useNanoBanaStore()
  const { uploadToGallery } = useImageGallery()
  const [dragOver, setDragOver] = useState(false)
  const [results, setResults] = useState<{ name: string; saved: number; original: number }[]>([])

  const handleFiles = async (files: FileList | File[]) => {
    const imageFiles = Array.from(files).filter((f) => f.type.startsWith('image/'))
    if (imageFiles.length === 0) return

    setUploading(true)
    setResults([])
    const newResults: typeof results = []

    for (const file of imageFiles) {
      const img = await uploadToGallery(file)
      if (img) {
        newResults.push({
          name: img.name,
          saved: img.sizeBytes - img.compressedSizeBytes,
          original: img.sizeBytes,
        })
      }
    }

    setResults(newResults)
    setUploading(false)
  }

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    if (e.dataTransfer.files.length) handleFiles(e.dataTransfer.files)
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Drop zone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        onClick={() => inputRef.current?.click()}
        className={`flex flex-col items-center gap-2 p-6 border-2 border-dashed rounded-xl cursor-pointer transition-all ${
          dragOver
            ? 'border-indigo-500 bg-indigo-500/10'
            : 'border-white/10 hover:border-white/20 bg-white/5'
        }`}
      >
        {uploading ? (
          <Loader2 className="w-6 h-6 text-indigo-400 animate-spin" />
        ) : (
          <Upload className="w-6 h-6 text-white/40" />
        )}
        <p className="text-xs text-white/50 text-center">
          {uploading ? 'Upload en cours...' : 'Glisser ou cliquer pour ajouter'}
        </p>
        <p className="text-[10px] text-white/25">JPG, PNG, WebP, SVG</p>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => { if (e.target.files?.length) handleFiles(e.target.files); e.target.value = '' }}
      />

      {/* Upload results */}
      {results.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <p className="text-[10px] text-white/30 uppercase tracking-wider font-medium">
            {results.length} image{results.length > 1 ? 's' : ''} ajoutée{results.length > 1 ? 's' : ''}
          </p>
          {results.map((r, i) => (
            <div key={i} className="flex items-center gap-2 text-[10px] bg-white/5 rounded px-2 py-1.5">
              <Check className="w-3 h-3 text-green-400 shrink-0" />
              <span className="text-white/60 truncate flex-1">{r.name}</span>
              {r.saved > 0 && (
                <span className="text-green-400/70 shrink-0">-{formatBytes(r.saved)}</span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
