import { useRef, useState } from 'react'
import { FileUp, FileText, X, Loader2, FolderUp } from 'lucide-react'
import { ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage'
import { storage } from '@/lib/firebase/config'
import { toast } from 'sonner'
import { extractBrandColorsFromFile } from '@/features/briefs/ai/extractBrandColors'
import type { ClientFormField } from '@/features/taxonomy/types'

interface BrandKitFile {
  url: string
  filename: string
  contentType: string
  size: number
  relativePath?: string
}

interface BrandKitValue {
  // Compat ancien format mono-fichier
  url?: string
  filename?: string
  contentType?: string
  size?: number
  // Nouveau : liste de fichiers
  files?: BrandKitFile[]
}

interface Props {
  field: ClientFormField
  value: BrandKitValue | undefined
  onChange: (value: BrandKitValue | undefined) => void
  disabled?: boolean
  briefId?: string
  /** Callback pour mettre à jour d'autres champs (ex: primaryColor) */
  onSiblingChange?: (key: string, value: unknown) => void
}

const MAX_BYTES_PER_FILE = 25 * 1024 * 1024 // 25 MB
const MAX_FILES = 100

export function BrandKitUploadField({ field, value, onChange, disabled, briefId, onSiblingChange }: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const folderInputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)

  const existingFiles: BrandKitFile[] =
    value?.files ??
    (value?.url
      ? [{
          url: value.url,
          filename: value.filename || 'fichier',
          contentType: value.contentType || '',
          size: value.size || 0,
        }]
      : [])

  const handleFiles = async (fileList: FileList) => {
    if (!briefId) {
      toast.error('Brief non sauvegardé')
      return
    }
    const files = Array.from(fileList).slice(0, MAX_FILES)
    if (files.length === 0) return

    setUploading(true)
    setProgress({ done: 0, total: files.length })
    const uploaded: BrandKitFile[] = [...existingFiles]
    let colorSourceFile: File | null = null

    try {
      for (let i = 0; i < files.length; i++) {
        const f = files[i]
        if (f.size > MAX_BYTES_PER_FILE) {
          toast.warning(`${f.name} ignoré (>25 Mo)`)
          setProgress({ done: i + 1, total: files.length })
          continue
        }
        // @ts-expect-error webkitRelativePath existe sur les fichiers d'un dossier
        const rel: string = f.webkitRelativePath || f.name
        const safe = rel.replace(/[^a-zA-Z0-9._/-]+/g, '_')
        const path = `briefs/${briefId}/brandkit/${Date.now()}_${safe}`
        const ref = storageRef(storage, path)
        await uploadBytes(ref, f, { contentType: f.type || 'application/octet-stream' })
        const url = await getDownloadURL(ref)
        uploaded.push({
          url,
          filename: f.name,
          contentType: f.type,
          size: f.size,
          relativePath: rel,
        })
        // Pour l'extraction couleurs : prend le premier PDF, sinon première image
        if (!colorSourceFile && f.type === 'application/pdf') colorSourceFile = f
        else if (!colorSourceFile && f.type.startsWith('image/')) colorSourceFile = f
        setProgress({ done: i + 1, total: files.length })
      }

      onChange({ files: uploaded })
      toast.success(`${uploaded.length - existingFiles.length} fichier(s) importé(s)`)

      if (onSiblingChange && colorSourceFile) {
        toast.message('Analyse des couleurs en cours…')
        const colors = await extractBrandColorsFromFile(colorSourceFile, colorSourceFile.type)
        if (colors.primary) onSiblingChange('primaryColor', colors.primary)
        if (colors.secondary) onSiblingChange('secondaryColor', colors.secondary)
        if (colors.primary || colors.secondary) {
          toast.success(
            `Couleurs détectées : ${[colors.primary, colors.secondary].filter(Boolean).join(' / ')}`,
          )
        }
      }
    } catch (err) {
      toast.error((err as Error).message || 'Échec de l\'upload')
    } finally {
      setUploading(false)
      setProgress(null)
    }
  }

  const removeFile = (idx: number) => {
    const next = existingFiles.filter((_, i) => i !== idx)
    onChange(next.length ? { files: next } : undefined)
  }

  const removeAll = () => onChange(undefined)

  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-[12px] text-white/70">
        {field.label}
        {field.required && <span className="text-red-400 ml-1">*</span>}
      </label>

      {existingFiles.length > 0 && (
        <div className="flex flex-col gap-1 mb-1">
          {existingFiles.map((f, idx) => (
            <div
              key={`${f.url}_${idx}`}
              className="flex items-center gap-3 bg-[#0f0f0f] border border-white/[0.08] rounded-md px-3 py-1.5"
            >
              <FileText className="w-4 h-4 text-indigo-400 shrink-0" />
              <a
                href={f.url}
                target="_blank"
                rel="noreferrer"
                className="flex-1 truncate text-[12px] text-white hover:text-indigo-300"
                title={f.relativePath || f.filename}
              >
                {f.relativePath || f.filename}
              </a>
              <span className="text-[11px] text-white/40 shrink-0">
                {(f.size / 1024 / 1024).toFixed(2)} Mo
              </span>
              <button
                type="button"
                onClick={() => removeFile(idx)}
                disabled={disabled}
                className="text-white/40 hover:text-red-400"
                aria-label="Retirer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          ))}
          {existingFiles.length > 1 && (
            <button
              type="button"
              onClick={removeAll}
              className="text-[11px] text-white/40 hover:text-red-400 self-end"
            >
              Tout retirer
            </button>
          )}
        </div>
      )}

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={disabled || uploading}
          className="flex-1 flex items-center justify-center gap-2 bg-[#0f0f0f] border border-dashed border-white/[0.12] hover:border-indigo-500/60 rounded-md px-3 py-3 text-[12px] text-white/60 hover:text-white disabled:opacity-50"
        >
          {uploading ? <Loader2 className="w-4 h-4 animate-spin text-indigo-400" /> : <FileUp className="w-4 h-4 text-indigo-400" />}
          Fichiers
        </button>
        <button
          type="button"
          onClick={() => folderInputRef.current?.click()}
          disabled={disabled || uploading}
          className="flex-1 flex items-center justify-center gap-2 bg-[#0f0f0f] border border-dashed border-white/[0.12] hover:border-indigo-500/60 rounded-md px-3 py-3 text-[12px] text-white/60 hover:text-white disabled:opacity-50"
        >
          {uploading ? <Loader2 className="w-4 h-4 animate-spin text-indigo-400" /> : <FolderUp className="w-4 h-4 text-indigo-400" />}
          Dossier complet
        </button>
      </div>

      {progress && (
        <div className="text-[11px] text-white/50">
          Upload {progress.done}/{progress.total}…
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={(e) => {
          if (e.target.files) handleFiles(e.target.files)
          e.target.value = ''
        }}
      />
      <input
        ref={folderInputRef}
        type="file"
        multiple
        // @ts-expect-error attributs non standards mais supportés par Chrome/Edge/Firefox/Safari
        webkitdirectory=""
        directory=""
        className="hidden"
        onChange={(e) => {
          if (e.target.files) handleFiles(e.target.files)
          e.target.value = ''
        }}
      />
      {field.helpText && <p className="text-[11px] text-white/40">{field.helpText}</p>}
    </div>
  )
}
