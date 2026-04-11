import { useRef, useState } from 'react'
import { ImageUp, Loader2 } from 'lucide-react'
import { ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage'
import { storage } from '@/lib/firebase/config'
import { toast } from 'sonner'
import type { ClientFormField } from '@/features/taxonomy/types'

interface Props {
  field: ClientFormField
  value: string | undefined
  onChange: (value: string) => void
  disabled?: boolean
  briefId?: string
}

const MAX_BYTES = 10 * 1024 * 1024 // 10 Mo

export function LogoUploadField({ field, value, onChange, disabled, briefId }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)

  const handleFile = async (file: File) => {
    if (!briefId) {
      toast.error('Brief non sauvegardé')
      return
    }
    if (file.size > MAX_BYTES) {
      toast.error('Fichier trop volumineux (>10 Mo)')
      return
    }
    if (!file.type.startsWith('image/')) {
      toast.error('Veuillez sélectionner une image')
      return
    }
    setUploading(true)
    try {
      const safe = file.name.replace(/[^a-zA-Z0-9._-]+/g, '_')
      const path = `briefs/${briefId}/logo/${Date.now()}_${safe}`
      const ref = storageRef(storage, path)
      await uploadBytes(ref, file, { contentType: file.type })
      const url = await getDownloadURL(ref)
      onChange(url)
      toast.success('Logo importé')
    } catch (err) {
      toast.error((err as Error).message || "Échec de l'upload")
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-[12px] text-white/70">
        {field.label}
        {field.required && <span className="text-red-400 ml-1">*</span>}
      </label>
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={disabled || uploading}
          title="Importer un logo local"
          className="w-16 h-16 rounded-md bg-[#0f0f0f] border border-white/[0.08] hover:border-indigo-500/60 flex items-center justify-center overflow-hidden disabled:opacity-50 transition-colors"
        >
          {uploading ? (
            <Loader2 className="w-5 h-5 text-indigo-400 animate-spin" />
          ) : value ? (
            <img src={value} alt="logo" className="w-full h-full object-contain" />
          ) : (
            <ImageUp className="w-5 h-5 text-white/30" />
          )}
        </button>
        <input
          type="url"
          value={value ?? ''}
          onChange={(e) => onChange(e.target.value)}
          placeholder="https://..."
          disabled={disabled}
          className="flex-1 bg-[#0f0f0f] border border-white/[0.08] rounded-md px-3 py-2 text-[13px] text-white placeholder:text-white/25 focus:outline-none focus:border-indigo-500/60 disabled:opacity-50"
        />
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) handleFile(f)
            e.target.value = ''
          }}
        />
      </div>
      {field.helpText && (
        <p className="text-[11px] text-white/40">{field.helpText}</p>
      )}
    </div>
  )
}
