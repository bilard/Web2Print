// Bloc « Visuel IA » d'une couverture : prompt image + génération Nano Banana +
// vignette du résultat. PARTAGÉ entre le panneau « Fond de page » de l'Aperçu
// (PageOptionsCover) et la carte « Prompt global » de l'étape Prompt — le brief
// global écrit ce prompt via le plan IA, il doit pouvoir être lancé SUR PLACE
// (sans ce chemin, un brief « illustration de couverture » n'avait aucun effet
// visible tant qu'on n'ouvrait pas l'Aperçu).
import { Loader2, Wand2 } from 'lucide-react'
import { useCoverImage } from '../../useCoverImage'
import { optFieldClass } from './PageOptionControls'

interface Props {
  /** Cible du visuel généré : couverture ou 4e de couverture. */
  target: 'cover' | 'back'
  /** Prompt image (EN) — `plan.cover.imagePrompt` pour la couverture. */
  prompt: string
  onPrompt: (v: string) => void
  /** Visuel déjà généré (aperçu en vignette). */
  imageUrl: string | null
  rows?: number
}

export function CoverVisualField({ target, prompt, onPrompt, imageUrl, rows = 3 }: Props) {
  const { generating, generateCover } = useCoverImage()
  return (
    <>
      <textarea value={prompt} onChange={(e) => onPrompt(e.target.value)} rows={rows}
        placeholder="Prompt du visuel (EN)" className={`${optFieldClass} resize-none`} />
      <div className="flex items-center gap-2">
        <button type="button" disabled={generating} onClick={() => void generateCover(prompt, target)}
          className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-[#fff] text-xs font-medium">
          {generating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Wand2 className="w-3.5 h-3.5" />} Générer le visuel
        </button>
        {imageUrl && <img src={imageUrl} alt="Visuel" className="w-10 h-10 object-cover rounded-md border border-border" />}
      </div>
    </>
  )
}
