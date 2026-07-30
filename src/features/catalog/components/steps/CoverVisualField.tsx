// Bloc « Visuel IA » d'une couverture : génération Nano Banana + vignette du
// résultat, avec ou sans champ de prompt. PARTAGÉ entre le panneau « Fond de
// page » de l'Aperçu (PageOptionsCover, champ éditable) et la carte « Prompt
// global » de l'étape Prompt (SANS champ : le Prompt global est déjà affiché
// juste au-dessus — l'afficher une seconde fois faisait deux zones jumelles
// où l'on ne savait plus laquelle commandait).
import { Loader2, Wand2 } from 'lucide-react'
import { useCoverImage } from '../../useCoverImage'
import { optFieldClass } from './PageOptionControls'
import { t } from '@/lib/i18n'

interface Props {
  /** Cible du visuel généré : couverture ou 4e de couverture. */
  target: 'cover' | 'back'
  /** Prompt envoyé TEL QUEL au générateur d'image. */
  prompt: string
  /** Absent = prompt non éditable ici (il est saisi ailleurs) : pas de champ. */
  onPrompt?: (v: string) => void
  /** Visuel déjà généré (aperçu en vignette). */
  imageUrl: string | null
  rows?: number
}

export function CoverVisualField({ target, prompt, onPrompt, imageUrl, rows = 3 }: Props) {
  const { generating, generateCover } = useCoverImage()
  return (
    <>
      {onPrompt && (
        <textarea value={prompt} onChange={(e) => onPrompt(e.target.value)} rows={rows}
          placeholder={t('cat.page.visualPrompt')} className={`${optFieldClass} resize-none`} />
      )}
      <div className="flex items-center gap-2">
        <button type="button" disabled={generating || !prompt.trim()} onClick={() => void generateCover(prompt, target)}
          className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-[#fff] text-xs font-medium">
          {generating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Wand2 className="w-3.5 h-3.5" />} {t('cat.page.generateVisual')}
        </button>
        {imageUrl && <img src={imageUrl} alt={t('cat.page.visualAlt')} className="w-10 h-10 object-cover rounded-md border border-border" />}
      </div>
    </>
  )
}
