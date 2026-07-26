// Bouton compact « Détourer » (cellules image PIM…) : détoure la 1re image de la
// valeur via le moteur partagé (rembg/Remove.bg) et renvoie la valeur mise à jour
// (webViewLink du PNG détouré uploadé dans le DAM « Détourés »).
import { useState } from 'react'
import { Eraser, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { detourImageValue } from './detourImage'

interface Props {
  /** Valeur courante de la cellule (webViewLink Drive ou URL, multi-images acceptées). */
  value: string
  /** Nom de base du fichier détouré (ex. nom du produit). */
  baseName: string
  /** Reçoit la valeur mise à jour (référence remplacée par le PNG détouré). */
  onDone: (nextValue: string) => void
}

export function DetourImageButton({ value, baseName, onDone }: Props) {
  const [busy, setBusy] = useState(false)
  const run = async (e: React.MouseEvent) => {
    e.stopPropagation()
    if (busy) return
    setBusy(true)
    try {
      onDone(await detourImageValue(value, baseName))
      toast.success('Image détourée (PNG ajouté au DAM « Détourés »)')
    } catch (err) {
      toast.error(`Détourage : ${String((err as Error).message)}`)
    } finally {
      setBusy(false)
    }
  }
  return (
    <button type="button" onClick={(e) => void run(e)} disabled={busy}
      className="shrink-0 p-1 rounded text-white/40 hover:text-indigo-300 hover:bg-indigo-500/10 transition-colors disabled:opacity-60"
      title="Détourer l'image (fond supprimé → PNG dans le DAM)">
      {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Eraser className="h-3.5 w-3.5" />}
    </button>
  )
}
