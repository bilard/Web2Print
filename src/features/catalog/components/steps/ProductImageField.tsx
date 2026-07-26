// Vignette d'un champ IMAGE du panneau d'édition produit : l'image est résolue
// comme sur les fiches (Drive/DAM → blob, URL externe → proxy) et cliquable —
// elle ouvre le lien stocké en cellule (webViewLink Drive = l'asset dans le DAM).
import { ExternalLink, ImageOff, Loader2 } from 'lucide-react'
import { useResolvedImage } from '../../useResolvedImage'

/** Une valeur de cellule est « image » si c'est une URL http(s) sur une colonne
 *  image/visuel/photo, ou une URL Drive/googleusercontent quelconque. */
export function isImageValue(colKey: string, colLabel: string, value: string): boolean {
  if (!/^https?:\/\//i.test(value)) return false
  if (/image|visuel|photo/i.test(colKey) || /image|visuel|photo/i.test(colLabel)) return true
  return /drive\.google\.com|googleusercontent\.com/i.test(value) || /\.(png|jpe?g|webp|gif|svg)(\?|$)/i.test(value)
}

export function ProductImageField({ url }: { url: string }) {
  const { src, resolving } = useResolvedImage(url)
  return (
    <div className="flex items-center gap-3 p-2 rounded-md bg-surface-2">
      <a href={url} target="_blank" rel="noreferrer" title="Ouvrir l'asset dans le DAM (Google Drive)"
        className="shrink-0 w-20 h-20 rounded-md border border-border bg-[#fff] flex items-center justify-center overflow-hidden">
        {resolving ? (
          <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
        ) : src ? (
          <img src={src} alt="" className="max-w-full max-h-full object-contain" />
        ) : (
          <ImageOff className="w-5 h-5 text-muted-foreground" />
        )}
      </a>
      <a href={url} target="_blank" rel="noreferrer"
        className="flex items-center gap-1.5 text-[11px] text-indigo-300 hover:text-indigo-200 hover:underline min-w-0">
        <ExternalLink className="w-3.5 h-3.5 shrink-0" />
        <span className="truncate">Ouvrir l'asset (DAM / Drive)</span>
      </a>
    </div>
  )
}
