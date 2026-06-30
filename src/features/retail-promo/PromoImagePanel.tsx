import { useRef, useState } from 'react'
import { ImagePlus, Upload, Image as StockIcon, Eraser, Loader2, Search } from 'lucide-react'
import { toast } from 'sonner'
import { useRemoveBg } from '@/features/nanobana/useRemoveBg'
import { useDamStore } from '@/stores/dam.store'
import { useDamSearch } from '@/features/dam/hooks/useDamSearch'

interface Props {
  /** Image produit actuellement affichée (résolue). */
  currentImage?: string
  /** Remplace l'image de la carte courante (data-URL / blob / URL stock). */
  onReplace: (url: string) => void
}

const blobToDataUrl = (b: Blob): Promise<string> =>
  new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.onerror = rej; r.readAsDataURL(b) })
const fileToDataUrl = (f: File): Promise<string> => blobToDataUrl(f)
// Remove.bg n'accepte une URL non publique (blob:) que via `image_file` → on convertit en data-URL.
const toDataUrl = async (url: string): Promise<string> =>
  url.startsWith('data:') ? url : blobToDataUrl(await (await fetch(url)).blob())

/** Panneau Images : aperçu produit, remplacement (upload / banque stock) et suppression du fond. */
export function PromoImagePanel({ currentImage, onReplace }: Props) {
  const [tab, setTab] = useState<'gallery' | 'upload' | 'stock'>('gallery')
  const fileRef = useRef<HTMLInputElement>(null)
  const { removeBg, loading: rbLoading, error: rbError } = useRemoveBg()
  const { query, setQuery, results, loading: stockLoading } = useDamStore()
  const { search } = useDamSearch()

  const onFile = async (f?: File | null) => {
    if (!f) return
    try { onReplace(await fileToDataUrl(f)); toast.success('Image remplacée') } catch { toast.error('Échec du chargement') }
  }
  const onRemoveBg = async () => {
    if (!currentImage) return
    try {
      const src = await toDataUrl(currentImage) // blob:/http → data-URL (sinon « Invalid image_url »)
      const out = await removeBg(src)
      // Le vrai motif (ex. « Insufficient credits ») est exposé via rbError, affiché sous le bouton.
      if (out) { onReplace(out); toast.success('Fond supprimé') }
    } catch { toast.error('Image illisible pour le détourage') }
  }

  return (
    <aside className="flex max-h-[42vh] w-56 shrink-0 flex-col rounded-xl border border-white/10 bg-surface">
      <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-white">Images</h3>
      </div>
      <div className="flex gap-1 px-3 pt-3 text-xs">
        {([['gallery', 'Galerie', ImagePlus], ['upload', 'Upload', Upload], ['stock', 'Stock', StockIcon]] as const).map(([t, label, Ic]) => (
          <button key={t} onClick={() => setTab(t)}
            className={`flex flex-1 items-center justify-center gap-1 rounded px-1.5 py-1.5 ${tab === t ? 'bg-[#6366f1] text-[#fff]' : 'bg-well text-white/60 hover:bg-white/10'}`}>
            <Ic className="h-3.5 w-3.5" /> {label}
          </button>
        ))}
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-3">
        {tab === 'gallery' && (
          <>
            <span className="text-[11px] font-semibold uppercase tracking-wide text-white/40">Image produit</span>
            <div className="overflow-hidden rounded-lg border border-white/10 bg-well">
              {currentImage
                ? <img src={currentImage} alt="produit" className="h-32 w-full object-contain" />
                : <div className="flex h-32 items-center justify-center text-xs text-white/30">Aucune image</div>}
            </div>
            <button onClick={() => void onRemoveBg()} disabled={!currentImage || rbLoading}
              className="flex items-center justify-center gap-2 rounded-lg border border-white/10 bg-white/[0.06] px-3 py-2 text-sm font-medium text-white hover:bg-white/10 disabled:opacity-40">
              {rbLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Eraser className="h-4 w-4" />} Supprimer le fond
            </button>
            {rbError && <p className="text-[11px] leading-snug text-red-400">{rbError === 'Insufficient credits' ? 'Crédits Remove.bg épuisés (0 crédit). Rechargez votre compte Remove.bg.' : rbError}</p>}
          </>
        )}

        {tab === 'upload' && (
          <button onClick={() => fileRef.current?.click()}
            className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-white/15 bg-well px-3 py-6 text-sm text-white/60 hover:border-[#6366f1] hover:text-white">
            <Upload className="h-5 w-5" /> Choisir un fichier
            <span className="text-[11px] text-white/30">Remplace l'image de cette carte</span>
          </button>
        )}

        {tab === 'stock' && (
          <>
            <form onSubmit={(e) => { e.preventDefault(); void search() }} className="flex items-center gap-2 rounded border border-white/10 bg-well px-2 py-1">
              <Search className="h-3.5 w-3.5 text-white/30" />
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Pexels / Unsplash…" className="w-full bg-transparent text-sm text-white outline-none placeholder:text-white/25" />
            </form>
            {stockLoading && <div className="flex justify-center py-3"><Loader2 className="h-4 w-4 animate-spin text-white/40" /></div>}
            <div className="grid grid-cols-2 gap-1.5">
              {results.map((im) => (
                <button key={im.id} onClick={() => { onReplace(im.previewUrl); toast.success('Image appliquée') }}
                  className="overflow-hidden rounded border border-white/10 hover:border-[#6366f1]">
                  <img src={im.thumbnailUrl} alt="" className="h-16 w-full object-cover" loading="lazy" />
                </button>
              ))}
            </div>
          </>
        )}
        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => void onFile(e.target.files?.[0])} />
      </div>
    </aside>
  )
}
