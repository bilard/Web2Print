// src/features/fonts/UserFontsPanel.tsx
// « Mes polices » : upload de fichiers .woff2/.woff/.ttf/.otf vers l'espace du
// user + liste avec suppression. Chaque chip s'affiche dans SA police (aperçu).
import { useRef } from 'react'
import { Loader2, Upload, X } from 'lucide-react'
import { toast } from 'sonner'
import { useUserFonts } from './useUserFonts'

export function UserFontsPanel() {
  const { fonts, busy, upload, remove } = useUserFonts()
  const inputRef = useRef<HTMLInputElement>(null)

  const onFiles = async (files: FileList | null) => {
    if (!files?.length) return
    for (const file of Array.from(files)) {
      try {
        await upload(file)
        toast.success(`Police « ${file.name} » chargée`)
      } catch (e) {
        toast.error(String((e as Error).message))
      }
    }
    if (inputRef.current) inputRef.current.value = ''
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Mes polices</span>
        <button type="button" disabled={busy} onClick={() => inputRef.current?.click()}
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-surface-2 hover:bg-well disabled:opacity-50 text-xs text-white">
          {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />} Charger (.woff2, .ttf…)
        </button>
        <input ref={inputRef} type="file" accept=".woff2,.woff,.ttf,.otf" multiple className="hidden"
          onChange={(e) => void onFiles(e.target.files)} />
      </div>
      {fonts.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {fonts.map((f) => (
            <span key={f.id} className="flex items-center gap-1.5 pl-2.5 pr-1.5 py-1 rounded-md bg-surface-2 text-xs text-white">
              <span style={{ fontFamily: `'${f.family}', sans-serif` }}>{f.family}</span>
              <button type="button" onClick={() => void remove(f).then(() => toast.success('Police supprimée'))}
                className="text-muted-foreground hover:text-red-400" title="Supprimer">
                <X className="w-3 h-3" />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
