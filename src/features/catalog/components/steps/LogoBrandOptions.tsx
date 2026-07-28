// Panneau « Logo de marque » — identité GLOBALE du catalogue : visible sur
// toutes les pages du panneau « Fond de page », puisque le logo se pose à la
// fois sur la couverture et dans le bandeau de chaque page produit.
// Le NOM est la source par défaut (rendu typographique, exact à l'impression) ;
// l'emblème (fichier joint ou généré) vient s'ajouter à sa gauche.
import { useRef } from 'react'
import { Loader2, Paperclip, Sparkles, X } from 'lucide-react'
import { useCatalogStore } from '@/stores/catalog.store'
import type { CatalogPageStyle, CatalogPlan } from '../../catalogTypes'
import { useCoverImage } from '../../useCoverImage'
import { OptSection, OptSlider, OptToggle, optFieldClass } from './PageOptionControls'

interface Props {
  plan: CatalogPlan
  setPlan: (plan: CatalogPlan) => void
  style: CatalogPageStyle
  patchStyle: (p: Partial<CatalogPageStyle>) => void
}

/** Brief d'EMBLÈME (jamais de lettrage : le nom reste typographique). */
function emblemPrompt(name: string, accent: string): string {
  return `Minimal flat vector brand emblem for a professional retail tools catalogue named "${name}". `
    + `Simple geometric symbol only, NO text, NO letters, NO words. `
    + `Solid ${accent} accent with dark neutral tones, plain pure white background, crisp edges, no gradient, no photorealism, centered, generous margins.`
}

export function LogoBrandOptions({ plan, setPlan, style, patchStyle }: Props) {
  const logoUrl = useCatalogStore((s) => s.logoUrl)
  const setLogoUrl = useCatalogStore((s) => s.setLogoUrl)
  const { generating, generateCover, uploadImage } = useCoverImage()
  const fileRef = useRef<HTMLInputElement | null>(null)
  const name = plan.brandName ?? ''

  return (
    <OptSection title="Logo de marque">
      <input value={name} onChange={(e) => setPlan({ ...plan, brandName: e.target.value })}
        placeholder="Nom de la marque (ex. Distriland)" className={optFieldClass} />
      <p className="text-[10px] text-white/40 leading-snug">
        Le nom est composé avec la police de titre du thème — net à l'impression.
        L'emblème ci-dessous s'ajoute à sa gauche ; videz le nom si votre visuel contient déjà le lettrage.
      </p>
      <div className="flex items-center gap-2 flex-wrap">
        <button type="button" onClick={() => fileRef.current?.click()} disabled={generating}
          title="Charger votre logo (PNG/SVG)"
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border border-border bg-well text-xs text-white hover:border-indigo-500 disabled:opacity-50">
          <Paperclip className="w-3.5 h-3.5" /> Charger
        </button>
        <input ref={fileRef} type="file" accept="image/*" className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) void uploadImage(f, 'logo'); e.target.value = '' }} />
        <button type="button" disabled={generating || !name.trim()}
          onClick={() => void generateCover(emblemPrompt(name.trim(), plan.theme.accent), 'logo')}
          title={name.trim() ? 'Génère un emblème (symbole sans lettrage) accordé à votre accent' : 'Renseignez d’abord le nom de la marque'}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-[#fff] text-xs font-medium">
          {generating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />} Emblème IA
        </button>
        {logoUrl && (
          <>
            <img src={logoUrl} alt="Logo" className="w-9 h-9 object-contain rounded-md border border-border bg-[#fff]" />
            <button type="button" onClick={() => setLogoUrl(null)} title="Retirer l'emblème (le nom reste)"
              className="p-1.5 rounded-md text-white/40 hover:text-white hover:bg-well">
              <X className="w-3.5 h-3.5" />
            </button>
          </>
        )}
      </div>
      <OptToggle label="Sur la couverture" checked={style.showCoverLogo !== false} onChange={(v) => patchStyle({ showCoverLogo: v })} />
      <OptToggle label="Dans le bandeau des pages" checked={style.showHeaderLogo !== false} onChange={(v) => patchStyle({ showHeaderLogo: v })} />
      <OptSlider label="Taille" value={style.logoScale ?? 1} min={0.4} max={2} step={0.05} onChange={(v) => patchStyle({ logoScale: v })} />
    </OptSection>
  )
}
