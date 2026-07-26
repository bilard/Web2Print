// « Mes polices » : upload de fichiers .woff2/.woff/.ttf/.otf + ajout d'une
// famille GOOGLE FONTS par URL collée (specimen ou css2) ou nom. Liste avec
// suppression ; chaque chip s'affiche dans SA police (aperçu).
import { useRef, useState } from 'react'
import { Globe, Loader2, Plus, Upload, X } from 'lucide-react'
import { toast } from 'sonner'
import { useUserFonts } from './useUserFonts'

export function UserFontsPanel() {
  const { fonts, busy, upload, addGoogle, remove } = useUserFonts()
  const inputRef = useRef<HTMLInputElement>(null)
  const [gInput, setGInput] = useState('')

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

  const onAddGoogle = async () => {
    if (!gInput.trim()) return
    try {
      const family = await addGoogle(gInput)
      toast.success(`Police Google « ${family} » ajoutée`)
      setGInput('')
    } catch (e) {
      toast.error(String((e as Error).message))
    }
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

      {/* Ajout par URL Google Fonts (specimen/css2) ou nom de famille */}
      <div className="flex items-center gap-1.5">
        <input value={gInput} onChange={(e) => setGInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') void onAddGoogle() }}
          placeholder="URL Google Fonts (fonts.google.com/specimen/…) ou nom"
          className="flex-1 min-w-0 px-2.5 py-1.5 rounded-md bg-surface-2 text-xs text-white outline-none focus:ring-1 focus:ring-indigo-600" />
        <button type="button" disabled={busy || !gInput.trim()} onClick={() => void onAddGoogle()}
          className="flex items-center gap-1 px-2.5 py-1.5 rounded-md bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-xs text-[#fff]">
          <Plus className="w-3.5 h-3.5" /> Ajouter
        </button>
      </div>

      {fonts.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {fonts.map((f) => (
            <span key={f.id} className="flex items-center gap-1.5 pl-2.5 pr-1.5 py-1 rounded-md bg-surface-2 text-xs text-white">
              {f.kind === 'google' && <Globe className="w-3 h-3 text-muted-foreground" />}
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
