// src/features/catalog/components/steps/CardStyleCard.tsx
// Panneau « Style des fiches » (aside droit, comme « Fond de page ») : réglages
// COSMÉTIQUES bornés (typo/police par champ, couleurs & dégradés des objets,
// taille de l'image, visibilité) appliqués par variables CSS par-dessus le
// template fluide — impossible de casser la mise en page. L'aperçu live est
// rendu au centre par StepPrompt (CardStylePreview), pas ici.
import { Brush, RotateCcw } from 'lucide-react'
import { PropertySection } from '@/components/shared/panel'
import { DEFAULT_CARD_STYLE, type CardObjectId, type CatalogCardStyle, type CatalogPlan } from '../../catalogTypes'
import { measureAutoLayout } from '../pages/freeLayout'
import { CardStyleTypo } from './CardStyleTypo'
import { CardStyleColors } from './CardStyleColors'

interface CardStyleCardProps {
  plan: CatalogPlan
  setPlan: (plan: CatalogPlan) => void
  /** Objet sélectionné dans l'aperçu (disposition libre) — surligne + focus le curseur typo correspondant. */
  selectedObject?: CardObjectId | null
}

const VISIBILITY: { key: keyof Pick<CatalogCardStyle, 'showPromo' | 'showSticker' | 'showKicker' | 'showDesc' | 'showRef' | 'showUnit' | 'showVedette' | 'showDetails'>; label: string }[] = [
  { key: 'showPromo', label: 'Cartouche promo' },
  { key: 'showSticker', label: 'Sticker remise' },
  { key: 'showKicker', label: 'Sous-famille' },
  { key: 'showDesc', label: 'Description' },
  { key: 'showRef', label: 'Référence' },
  { key: 'showUnit', label: 'Unité' },
  { key: 'showVedette', label: 'Ruban vedette' },
  { key: 'showDetails', label: 'Détails' },
]

export function CardStyleCard({ plan, setPlan, selectedObject }: CardStyleCardProps) {
  const style: CatalogCardStyle = { ...DEFAULT_CARD_STYLE, ...plan.cardStyle }
  const patch = (p: Partial<CatalogCardStyle>) => setPlan({ ...plan, cardStyle: { ...style, ...p } })

  // Cocher « libre » AMORCE depuis le rendu auto : au moment du clic la carte du
  // preview est encore en auto → on fige ses positions dans `layout` pour que la
  // disposition libre reparte À L'IDENTIQUE (sauf si l'utilisateur avait déjà placé
  // des objets). Décocher = simple retour à l'auto.
  const toggleFree = (checked: boolean) => {
    if (!checked) { patch({ freeLayout: false }); return }
    const hasLayout = Object.keys(style.layout ?? {}).length > 0
    const card = document.querySelector<HTMLElement>('.cat-style-card-host > .cat-cell')
    const seeded = !hasLayout && card ? measureAutoLayout(card) : null
    patch(seeded && Object.keys(seeded).length ? { freeLayout: true, layout: seeded } : { freeLayout: true })
  }

  return (
    <div className="p-3 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-white">
          <Brush className="w-4 h-4 text-indigo-400" /> Style des fiches
        </h3>
        <button type="button" onClick={() => setPlan({ ...plan, cardStyle: { ...DEFAULT_CARD_STYLE } })}
          className="p-1.5 rounded-md text-white/40 hover:text-white hover:bg-well"
          title="Revenir au style par défaut">
          <RotateCcw className="w-3.5 h-3.5" />
        </button>
      </div>
      <p className="text-[11px] text-white/40 leading-relaxed -mt-2">
        Cosmétique seulement, la mise en page fluide est préservée.
      </p>

      {/* Mode de mise en page — en TÊTE car c'est un choix structurant (auto vs placement manuel). */}
      <div className="rounded-lg border border-indigo-500/30 bg-indigo-500/5 p-2.5 space-y-1.5">
        <label className="flex items-center gap-2 text-xs font-medium text-white cursor-pointer select-none">
          <input type="checkbox" checked={style.freeLayout} onChange={(e) => toggleFree(e.target.checked)} className="accent-indigo-600" />
          Disposition libre (glisser les objets)
        </label>
        <p className="text-[10px] text-white/40 leading-snug">
          {style.freeLayout
            ? 'Vous placez chaque objet à la main (positions fixes) — surveillez les chevauchements sur les cartes courtes des grilles denses.'
            : 'Mise en page automatique (recommandée) : chaque carte s\'adapte à sa taille et à son contenu, sans chevauchement ni débordement.'}
        </p>
        {style.freeLayout && (
          <button type="button" onClick={() => patch({ layout: {} })}
            className="text-[11px] text-indigo-300 hover:text-white underline text-left">Réinitialiser les positions</button>
        )}
      </div>

      <PropertySection title="Texte : taille & police" help="Un réglage par champ texte (nom, prix, description...).">
        <CardStyleTypo style={style} patch={patch} selected={selectedObject} />
      </PropertySection>

      <PropertySection title="Couleurs des objets" help="2e case = dégradé (✕ pour revenir à l'uni).">
        <CardStyleColors style={style} theme={plan.theme} patch={patch} />
      </PropertySection>

      <PropertySection title="Image">
        <label className="text-xs text-white/40 space-y-1 block">
          <span className="flex justify-between">Largeur (cartes horizontales)<b className="text-white tabular-nums">{style.imageShare}%</b></span>
          <input type="range" min={25} max={55} step={1} value={style.imageShare}
            onChange={(e) => patch({ imageShare: Number(e.target.value) })} className="w-full accent-indigo-600" />
        </label>
        <label className="text-xs text-white/40 space-y-1 block">
          <span className="flex justify-between">Marge du visuel<b className="text-white tabular-nums">{style.imagePad}px</b></span>
          <input type="range" min={0} max={30} step={1} value={style.imagePad}
            onChange={(e) => patch({ imagePad: Number(e.target.value) })} className="w-full accent-indigo-600" />
        </label>
      </PropertySection>

      <PropertySection title="Éléments affichés">
        <div className="flex flex-col gap-2">
          {VISIBILITY.map(({ key, label }) => (
            <label key={key} className="flex items-center gap-1.5 text-xs text-white/40 cursor-pointer select-none">
              <input type="checkbox" checked={style[key]} onChange={(e) => patch({ [key]: e.target.checked } as Partial<CatalogCardStyle>)}
                className="accent-indigo-600" />
              {label}
            </label>
          ))}
          <label className="flex items-center gap-1.5 text-xs text-white/40">
            Texte du ruban
            <input value={style.vedetteLabel} onChange={(e) => patch({ vedetteLabel: e.target.value })} placeholder="Vedette"
              className="w-28 px-2 py-1 rounded-md bg-well text-xs text-white outline-none border border-white/10 focus:border-[#6366f1]" />
          </label>
        </div>
      </PropertySection>
    </div>
  )
}
