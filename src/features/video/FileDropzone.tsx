import { useRef, useState } from 'react'
import { FilePlus2, X, AlertTriangle } from 'lucide-react'

export const MAX_FILES = 3
export const MAX_FILE_SIZE = 5 * 1024 * 1024

interface Props {
  files: File[]
  onChange: (files: File[]) => void
  disabled?: boolean
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}

export function FileDropzone({ files, onChange, disabled }: Props) {
  const inputRef = useRef<HTMLInputElement | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const addFiles = (incoming: FileList | File[]) => {
    setError(null)
    const next: File[] = [...files]
    for (const f of Array.from(incoming)) {
      if (next.length >= MAX_FILES) {
        setError(`Maximum ${MAX_FILES} fichiers`)
        break
      }
      if (f.size > MAX_FILE_SIZE) {
        setError(`"${f.name}" dépasse 5 MB`)
        continue
      }
      if (next.some((x) => x.name === f.name && x.size === f.size)) continue
      next.push(f)
    }
    onChange(next)
  }

  const handleRemove = (idx: number) => {
    const next = files.slice()
    next.splice(idx, 1)
    onChange(next)
  }

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setDragOver(false)
    if (disabled) return
    if (e.dataTransfer.files?.length) addFiles(e.dataTransfer.files)
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <label className="block text-xs font-semibold text-white/40 uppercase tracking-wider">
          Fichiers de support
        </label>
        <span className="text-[10px] text-white/30">Optionnel</span>
      </div>

      <div
        onClick={() => !disabled && inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault()
          if (!disabled) setDragOver(true)
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        className={`relative border-2 border-dashed rounded-xl px-4 py-6 text-center cursor-pointer transition-colors ${
          disabled
            ? 'border-white/5 opacity-50 cursor-not-allowed'
            : dragOver
            ? 'border-indigo-400/60 bg-indigo-500/5'
            : 'border-white/10 hover:border-white/20 bg-white/3'
        }`}
      >
        <input
          ref={inputRef}
          type="file"
          multiple
          className="hidden"
          disabled={disabled}
          onChange={(e) => {
            if (e.target.files?.length) addFiles(e.target.files)
            e.target.value = ''
          }}
        />
        <FilePlus2 className="w-5 h-5 mx-auto text-white/50 mb-1.5" />
        <p className="text-xs text-white/70">Dépose des fichiers ici ou clique pour parcourir</p>
        <p className="text-[10px] text-white/40 mt-0.5">
          Max {MAX_FILES} fichiers · 5 MB par fichier
        </p>
      </div>

      {files.length > 0 && (
        <ul className="mt-2 space-y-1">
          {files.map((f, i) => (
            <li
              key={`${f.name}-${i}`}
              className="flex items-center gap-2 bg-white/5 border border-white/10 rounded-lg px-2.5 py-1.5"
            >
              <span className="text-xs text-white/80 truncate flex-1">{f.name}</span>
              <span className="text-[10px] text-white/40 font-mono tabular-nums shrink-0">
                {formatBytes(f.size)}
              </span>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  handleRemove(i)
                }}
                disabled={disabled}
                className="text-white/30 hover:text-white/70 disabled:opacity-40"
                aria-label="Retirer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {error && (
        <div className="mt-2 flex items-center gap-1.5 text-[11px] text-amber-300/90">
          <AlertTriangle className="w-3.5 h-3.5" />
          {error}
        </div>
      )}
    </div>
  )
}
