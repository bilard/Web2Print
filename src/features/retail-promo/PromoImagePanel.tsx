import { useRef, useState } from 'react'
import { ImagePlus, Upload, Eraser, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { useRemoveBg } from '@/features/nanobana/useRemoveBg'

interface Props {
  /** Image produit actuellement affichée (résolue). */
  currentImage?: string
  /** Remplace l'image de la carte courante (data-URL / blob). */
  onReplace: (url: string) => void
}

const fileToDataUrl = (f: File): Promise<string> =>
  new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.onerror = rej; r.readAsDataURL(f) })

/** Panneau Images : aperçu de l'image produit, remplacement (upload) et suppression du fond. */
export function PromoImagePanel({ currentImage, onReplace }: Props) {
  const [tab, setTab] = useState<'gallery' | 'upload'>('gallery')
  const fileRef = useRef<HTMLInputElement>(null)
  const { removeBg, loading } = useRemoveBg()

  const onFile = async (f?: File | null) => {
    if (!f) return
    try { onReplace(await fileToDataUrl(f)); toast.success('Image remplacée') }
    catch { toast.error('Échec du chargement') }
  }
  const onRemoveBg = async () => {
    if (!currentImage) return
    const out = await removeBg(currentImage)
    if (out) { onReplace(out); toast.success('Fond supprimé') }
    else toast.error('Échec — vérifiez la clé Remove.bg (Paramètres > Connecteurs)')
  }

  return (
    <aside className="flex w-56 shrink-0 flex-col rounded-xl border border-white/10 bg-surface">
      <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-white">Images</h3>
      </div>
      <div className="flex gap-1 px-3 pt-3 text-xs">
        {([['gallery', 'Galerie', ImagePlus], ['upload', 'Upload', Upload]] as const).map(([t, label, Ic]) => (
          <button key={t} onClick={() => setTab(t)}
            className={`flex flex-1 items-center justify-center gap-1.5 rounded px-2 py-1.5 ${tab === t ? 'bg-[#6366f1] text-[#fff]' : 'bg-well text-white/60 hover:bg-white/10'}`}>
            <Ic className="h-3.5 w-3.5" /> {label}
          </button>
        ))}
      </div>

      <div className="flex flex-col gap-3 p-3">
        {tab === 'gallery' ? (
          <>
            <span className="text-[11px] font-semibold uppercase tracking-wide text-white/40">Image produit</span>
            <div className="relative overflow-hidden rounded-lg border border-white/10 bg-well">
              {currentImage
                ? <img src={currentImage} alt="produit" className="h-32 w-full object-contain" />
                : <div className="flex h-32 items-center justify-center text-xs text-white/30">Aucune image</div>}
            </div>
            <button onClick={() => void onRemoveBg()} disabled={!currentImage || loading}
              className="flex items-center justify-center gap-2 rounded-lg border border-white/10 bg-white/[0.06] px-3 py-2 text-sm font-medium text-white hover:bg-white/10 disabled:opacity-40">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Eraser className="h-4 w-4" />} Supprimer le fond
            </button>
          </>
        ) : (
          <button onClick={() => fileRef.current?.click()}
            className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-white/15 bg-well px-3 py-6 text-sm text-white/60 hover:border-[#6366f1] hover:text-white">
            <Upload className="h-5 w-5" /> Choisir un fichier
            <span className="text-[11px] text-white/30">Remplace l'image de cette carte</span>
          </button>
        )}
        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => void onFile(e.target.files?.[0])} />
      </div>
    </aside>
  )
}
