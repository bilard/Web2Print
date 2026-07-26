// Panneau « Style des fiches » (aside droit, comme « Fond de page ») : réglages
// COSMÉTIQUES bornés (typo/police par champ, couleurs & dégradés des objets,
// taille de l'image, visibilité) appliqués par variables CSS par-dessus le
// template fluide — impossible de casser la mise en page. L'aperçu live est
// rendu au centre par StepPrompt (CardStylePreview), pas ici.
import { useEffect, useRef } from 'react'
import { Brush, RotateCcw, X } from 'lucide-react'
import { PropertySection } from '@/components/shared/panel'
import { ColorPicker } from '@/components/shared/ColorPicker'
import { DEFAULT_CARD_STYLE, type CardObjectId, type CatalogCardStyle, type CatalogPageStyle, type CatalogPlan } from '../../catalogTypes'
import { mergedPageStyle } from '../pages/catalogCss'
import { THEME_COLORS } from './PageOptionsTheme'
import { HeaderBandOptions } from './HeaderBandOptions'
import { CardObjectSettings } from './CardObjectSettings'
import { CardStyleTypo, OBJ_LABEL } from './CardStyleTypo'
import { CardStyleColors } from './CardStyleColors'
import { CardStyleVisibility } from './CardStyleVisibility'

interface CardStyleCardProps {
  plan: CatalogPlan
  setPlan: (plan: CatalogPlan) => void
  /** Objet sélectionné dans l'aperçu (disposition libre) — ses réglages sont REGROUPÉS en tête de panneau. */
  selectedObject?: CardObjectId | null
  /** Désélectionne l'objet (✕ du panneau « Bloc sélectionné »). */
  onClearSelection?: () => void
  /** Carte d'aperçu LARGE (repli 2 colonnes) — propagé au panneau typo (liaisons). */
  wide?: boolean
}

export function CardStyleCard({ plan, setPlan, selectedObject, onClearSelection, wide }: CardStyleCardProps) {
  const style: CatalogCardStyle = { ...DEFAULT_CARD_STYLE, ...plan.cardStyle }
  const patch = (p: Partial<CatalogCardStyle>) => setPlan({ ...plan, cardStyle: { ...style, ...p } })
  // Bandeau taxonomie (Univers › Famille) = élément de PAGE (pageStyle) — exposé
  // ici aussi pour tout régler sans changer d'onglet.
  const pageStyle = mergedPageStyle(plan.pageStyle)
  const patchPage = (p: Partial<CatalogPageStyle>) => setPlan({ ...plan, pageStyle: { ...pageStyle, ...p } })
  // Sélection d'un bloc → le panneau regroupé apparaît EN TÊTE : on y scrolle.
  const selRef = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    if (selectedObject) selRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' })
  }, [selectedObject])

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
        Glissez les objets dans l'aperçu — le résultat est identique dans le catalogue et à l'export.
      </p>

      {/* Disposition des objets (drag & drop, aimant, liaisons) — LE mode de rendu. */}
      <div className="rounded-lg border border-indigo-500/30 bg-indigo-500/5 p-2.5 space-y-1.5">
        <label className="flex items-center gap-2 text-[11px] text-white/70 cursor-pointer select-none">
          <input type="checkbox" checked={style.magnetFlow ?? true} onChange={(e) => patch({ magnetFlow: e.target.checked })} className="accent-indigo-600" />
          Aimanter les blocs texte (défaut)
        </label>
        <p className="text-[10px] text-white/40 leading-snug">
          Réglable BLOC PAR BLOC : sélectionnez un bloc texte dans l'aperçu puis
          cliquez sur sa pastille 🧲 (Aimanté = collé au bloc du dessus selon son
          contenu · Libre = reste exactement où vous le posez).
        </p>
        <button type="button" onClick={() => patch({ layout: {}, layoutWide: {} })}
          className="text-[11px] text-indigo-300 hover:text-white underline text-left">Réinitialiser les positions</button>
      </div>

      {/* BLOC SÉLECTIONNÉ : tous ses réglages regroupés (taille, police, rotation,
          couleurs, liaison, visibilité) — les listes complètes restent dessous. */}
      {selectedObject && (
        <div ref={selRef} className="rounded-lg border border-indigo-500 bg-indigo-500/10 p-2.5 space-y-2 scroll-mt-3">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[10px] font-semibold text-indigo-300 uppercase tracking-wider">
              Bloc sélectionné : {OBJ_LABEL[selectedObject]}
            </span>
            {onClearSelection && (
              <button type="button" onClick={onClearSelection} title="Désélectionner"
                className="p-1 rounded-md text-white/40 hover:text-white hover:bg-well">
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
          <CardObjectSettings obj={selectedObject} style={style} theme={plan.theme} patch={patch} wide={wide ?? false} />
        </div>
      )}

      {/* Couleurs GLOBALES du thème — mêmes pastilles que le panneau « Fond de
          page » de l'Aperçu, éditables dès cette étape sans changer d'onglet. */}
      <PropertySection title="Couleurs du thème" help="Globales (accent, fond, bandeau…) — synchronisées avec le panneau « Fond de page » de l'Aperçu.">
        <div className="flex flex-wrap gap-2">
          {THEME_COLORS.map(({ key, label }) => (
            <ColorPicker key={key} value={plan.theme[key]} label={label}
              onChange={(v) => setPlan({ ...plan, theme: { ...plan.theme, [key]: v } })} />
          ))}
        </div>
      </PropertySection>

      <PropertySection title="Texte : taille & police" help="Un réglage par champ texte (nom, prix, description...).">
        <label className="flex items-center gap-1.5 text-xs text-white/60 cursor-pointer select-none"
          title="Neutralise la hiérarchie automatique (fiches vedette / mise en avant prix magnifiées, ajustement par page) : tous les produits du catalogue partagent la même taille de texte">
          <input type="checkbox" checked={style.uniformTextScale ?? false}
            onChange={(e) => patch({ uniformTextScale: e.target.checked })} className="accent-indigo-600" />
          Taille identique sur toutes les fiches
        </label>
        <CardStyleTypo style={style} patch={patch} selected={selectedObject} wide={wide} />
      </PropertySection>

      <PropertySection title="Couleurs des objets" help="2e case = dégradé (✕ pour revenir à l'uni).">
        <CardStyleColors style={style} theme={plan.theme} patch={patch} selected={selectedObject} />
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

      <PropertySection title="Éléments affichés" help="Champs libres (TVA, entretien...) masquables un par un sous « Détails ».">
        <CardStyleVisibility style={style} patch={patch} />
      </PropertySection>

      <HeaderBandOptions style={pageStyle} patch={patchPage} theme={plan.theme}
        onHeaderBg={(v) => setPlan({ ...plan, theme: { ...plan.theme, headerBg: v } })}
        sections={plan.sections}
        onSectionColor={(nodeId, color) => setPlan({ ...plan, sections: plan.sections.map((s) => s.nodeId === nodeId ? { ...s, color } : s) })}
        hint="Bandeau des PAGES du catalogue (Univers › Famille) — le rendu se voit sur les pages produits (Aperçu/export), pas sur la fiche seule ci-contre." />
    </div>
  )
}
