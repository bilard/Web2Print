// src/features/catalog/components/steps/CardStylePreview.tsx
// Aperçu de la fiche : UNE SEULE réplique RÉALISTE de la cellule imprimée (mêmes
// px + même --cat-fit, zoomée pour l'édition) + overlay de disposition libre
// (drag/resize, aimant, liaisons) et palette d'ancrage liquide.
import { useRef, type CSSProperties } from 'react'
import { AlignStartVertical, AlignCenterVertical, AlignEndVertical, AlignStartHorizontal, AlignCenterHorizontal, AlignEndHorizontal } from 'lucide-react'
import type { PromoFields } from '@/features/retail-promo/promoTypes'
import type { CardBox, CardObjectId, CatalogCardStyle, CatalogTheme } from '../../catalogTypes'
import { CATALOG_CSS, cardStyleVars, themeVars } from '../pages/catalogCss'
import { freeLayoutBox, isWideCard } from '../pages/freeLayout'
import { ProductCell } from '../pages/ProductCell'
import { CardLayoutOverlay } from './CardLayoutOverlay'

const SAMPLE_FIELDS: PromoFields = {
  name: 'Table de jardin ALTO 792', image: null, brand: 'Jardipro', ref: '246674928', ean: '',
  oldPrice: 327.78, newPrice: 236, currency: 'EUR', unit: 'La pièce',
  description: 'Aluminium - 4 personnes - Noir mat - Garantie 2 ans', category: '', unitPrice: '',
  promoLabel: 'Prix choc', mechanism: 'remise', remisePct: 28, remiseMontant: null,
  lotQty: null, lotOffert: null, lotPrice: null, validFrom: null, validTo: null, mentions: '', enseigne: '', badges: [],
}

// Détails d'exemple : l'aperçu montre TOUJOURS la zone « Détails » (repli si aucun
// champ libre défini), pour qu'on puisse la voir/la positionner en disposition libre.
const SAMPLE_DETAILS = ['Avantages : Léger · Pliable · Résistant UV', 'Garantie : 2 ans', 'Matière : Aluminium']

interface Props {
  theme: CatalogTheme
  cardStyle: CatalogCardStyle
  /** Fiche exemple (1er produit sélectionné) — repli sur une fiche factice. */
  fields?: PromoFields | null
  /** Lignes du bloc « Détails » (champs libres) — pour que l'aperçu montre la même zone que le catalogue. */
  details?: string[]
  /** Cellule imprimée (px + facteur --cat-fit) — la carte de l'aperçu EST cette cellule. */
  cell: { w: number; h: number; fit: number }
  /** Disposition éditée : pleine largeur (repli 2 colonnes + layoutWide) ou verticale.
   *  Absent = déduit de la forme de la cellule (même bascule que le rendu des pages). */
  wide?: boolean
  /** Variante affichée : vedette (ruban + cadre) ou standard. */
  featuredVariant?: boolean
  /** Monte l'overlay de drag/resize (disposition libre) quand vrai. */
  editable?: boolean
  onLayoutChange?: (id: CardObjectId, box: CardBox) => void
  /** Objet sélectionné dans l'overlay (disposition libre) — remonté au parent pour le panneau de style. */
  onSelect?: (id: CardObjectId | null) => void
  /** Objet sélectionné (contrôlé par le parent) — active la palette d'ancrage liquide. */
  selected?: CardObjectId | null
}

/** Palette d'ANCRAGE LIQUIDE (façon InDesign) : colle le bloc sélectionné au bord
 *  choisi de la fiche — l'ancrage tient sur toutes les tailles de carte. */
function AnchorPalette({ selected, style, wide, onLayoutChange }: {
  selected: CardObjectId | null | undefined
  style: CatalogCardStyle
  /** La carte d'aperçu est LARGE (repli 2 colonnes) — même base que le rendu. */
  wide: boolean
  onLayoutChange: (id: CardObjectId, box: CardBox) => void
}) {
  const apply = (patch: (b: CardBox) => CardBox) => {
    if (!selected) return
    onLayoutChange(selected, patch(freeLayoutBox(selected, style, wide)))
  }
  const box = selected ? freeLayoutBox(selected, style, wide) : null
  const BTNS: { icon: typeof AlignStartVertical; title: string; active: boolean; go: () => void }[] = [
    { icon: AlignStartVertical, title: 'Aimanter au bord GAUCHE', active: (box?.ax ?? 'l') === 'l', go: () => apply((b) => ({ ...b, ax: 'l', x: 2 })) },
    { icon: AlignCenterVertical, title: 'Centrer horizontalement', active: box?.ax === 'c', go: () => apply((b) => ({ ...b, ax: 'c', x: 50 })) },
    { icon: AlignEndVertical, title: 'Aimanter au bord DROIT', active: box?.ax === 'r', go: () => apply((b) => ({ ...b, ax: 'r', x: 2 })) },
    { icon: AlignStartHorizontal, title: 'Aimanter en HAUT', active: (box?.ay ?? 't') === 't', go: () => apply((b) => ({ ...b, ay: 't', y: 2 })) },
    { icon: AlignCenterHorizontal, title: 'Centrer verticalement', active: box?.ay === 'c', go: () => apply((b) => ({ ...b, ay: 'c', y: 50 })) },
    { icon: AlignEndHorizontal, title: 'Aimanter en BAS de la fiche', active: box?.ay === 'b', go: () => apply((b) => ({ ...b, ay: 'b', y: 2 })) },
  ]
  return (
    <div className="flex flex-col gap-1 shrink-0 self-start sticky top-2" title={selected ? undefined : 'Sélectionnez un bloc dans l\'aperçu'}>
      {BTNS.map(({ icon: Icon, title, active, go }, i) => (
        <button key={title} type="button" onClick={go} disabled={!selected} title={title}
          className={`p-1.5 rounded-md border ${i === 3 ? 'mt-2' : ''} ${
            active && selected ? 'bg-indigo-600 border-indigo-500 text-[#fff]' : 'bg-surface-2 border-border text-muted-foreground hover:text-white'
          } disabled:opacity-30 disabled:cursor-not-allowed`}>
          <Icon className="w-3.5 h-3.5" />
        </button>
      ))}
    </div>
  )
}

export function CardStylePreview({ theme, cardStyle, fields, details, cell, wide: wideProp, featuredVariant = true, editable, onLayoutChange, onSelect, selected }: Props) {
  const f = fields ?? SAMPLE_FIELDS
  const d = details && details.length ? details : SAMPLE_DETAILS
  const cardRef = useRef<HTMLDivElement | null>(null)
  // La cellule d'aperçu a la forme de la cellule IMPRIMÉE → même bascule 2 colonnes
  // que le rendu des pages (l'édition reste WYSIWYG sur les catalogues larges).
  const wide = wideProp ?? isWideCard(cell.w, cell.h)
  const overlay = editable && onLayoutChange
    ? <CardLayoutOverlay cardRef={cardRef} style={cardStyle} wide={wide} onChange={onLayoutChange} onSelect={onSelect} />
    : null
  const K = Math.max(1, Math.round((480 / cell.w) * 100) / 100)
  const pageStyle = { ...themeVars(theme), ...cardStyleVars(cardStyle, theme), ['--cat-fit']: String(Math.round(cell.fit * 100) / 100), width: cell.w * K + 32, background: 'var(--cat-bg)' } as CSSProperties
  return (
    <div className="flex items-start gap-2">
      {/* Palette d'ancrage liquide (menu de gauche) — agit sur le bloc sélectionné. */}
      {editable && onLayoutChange && (
        <AnchorPalette selected={selected} style={cardStyle} wide={wide} onLayoutChange={onLayoutChange} />
      )}
      <div className="cat-page rounded-lg overflow-hidden shrink-0 border border-border relative shadow-2xl" style={pageStyle}>
        <style>{CATALOG_CSS}</style>
        <div style={{ padding: 16 }}>
          {/* Conteneur qui réserve la place ZOOMÉE ; la carte interne est à la taille cellule exacte puis scale(K). */}
          <div style={{ width: cell.w * K, height: cell.h * K, position: 'relative' }}>
            <div ref={cardRef} className="cat-style-card-host" style={{ width: cell.w, height: cell.h, transform: `scale(${K})`, transformOrigin: 'top left', display: 'grid', position: 'relative' }}>
              <ProductCell fields={f} featured={featuredVariant} kicker="Sous-famille" details={d} cardStyle={cardStyle} wide={wide} />
            </div>
            {/* Overlay HORS de la carte scalée : ses positions sont en % (invariantes au
                zoom) mais ses pastilles/poignées sont en px — dedans, elles seraient ×K. */}
            {overlay}
          </div>
        </div>
      </div>
    </div>
  )
}
