// Liste « Éléments affichés » du panneau Style des fiches : TOUS les objets de
// la fiche (image, marque, nom, prix compris) + les champs libres (TVA,
// entretien…) masquables un par un sous « Détails ».
// La liste est ORDONNÉE COMME LA FICHE (tri par position verticale réelle) :
// glisser une ligne réordonne les blocs dans la fiche, cliquer son nom
// sélectionne le bloc (mêmes réglages que la sélection dans l'aperçu).
import { useMemo } from 'react'
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core'
import { SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy, arrayMove } from '@dnd-kit/sortable'
import { cardObjectOrder, reorderCardObjects } from '../pages/freeLayout'
import type { CardObjectId, CatalogCardStyle } from '../../catalogTypes'
import { DetailsFieldsPanel } from './DetailsFieldsPanel'
import { SortableVisibilityRow, VisibilityRow } from './VisibilityRow'
import { t } from '@/lib/i18n'

type ShowKey = keyof Pick<CatalogCardStyle,
  'showPromo' | 'showImage' | 'showSticker' | 'showKicker' | 'showBandRule' | 'showVedette' | 'showBrand' | 'showName'
  | 'showDesc' | 'showRef' | 'showUnit' | 'showPrice' | 'showWas' | 'showDetails'>

/** Objets de fiche déplaçables : une ligne triable chacun (l'ordre affiché vient
 *  de leur position réelle). `showWas` et `showBandRule` n'en sont pas : le prix
 *  barré vit DANS le bloc prix, le filet est un élément de PAGE. */
const OBJECTS: { key: ShowKey; obj: CardObjectId; label: string }[] = [
  { key: 'showPromo', obj: 'promo', label: 'Cartouche promo' },
  { key: 'showVedette', obj: 'vedette', label: 'Ruban vedette' },
  { key: 'showImage', obj: 'image', label: 'Image' },
  { key: 'showKicker', obj: 'kicker', label: 'Sous-famille' },
  { key: 'showSticker', obj: 'sticker', label: 'Sticker remise' },
  { key: 'showBrand', obj: 'brand', label: 'Marque' },
  { key: 'showName', obj: 'name', label: 'Nom' },
  { key: 'showDesc', obj: 'description', label: 'Description' },
  { key: 'showDetails', obj: 'details', label: 'Détails' },
  { key: 'showRef', obj: 'ref', label: 'Référence' },
  { key: 'showUnit', obj: 'unit', label: 'Unité' },
  { key: 'showPrice', obj: 'price', label: 'Prix' },
]

interface Props {
  style: CatalogCardStyle
  patch: (p: Partial<CatalogCardStyle>) => void
  /** Bloc sélectionné dans l'aperçu — la liste le met en évidence et le pilote. */
  selected?: CardObjectId | null
  onSelect?: (id: CardObjectId) => void
  /** Variante ÉDITÉE (pleine largeur) : le réordonnancement écrit dans SON jeu de positions. */
  wide?: boolean
}

export function CardStyleVisibility({ style, patch, selected, onSelect, wide = false }: Props) {
  // Souris/tactile + CLAVIER (poignée au focus : Espace saisit, ↑↓ déplacent,
  // Espace dépose) — le panneau reste pilotable sans souris.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )
  const byObj = useMemo(() => new Map(OBJECTS.map((o) => [o.obj, o])), [])
  const order = useMemo(() => cardObjectOrder(style, wide, OBJECTS.map((o) => o.obj)), [style, wide])

  const onDragEnd = (e: DragEndEvent) => {
    const { active, over } = e
    if (!over || active.id === over.id) return
    const from = order.indexOf(active.id as CardObjectId)
    const to = order.indexOf(over.id as CardObjectId)
    if (from < 0 || to < 0) return
    // Le tableau de CARACTÉRISTIQUES n'a pas de ligne propre (il est régi par
    // « Détails ») : il suit toujours immédiatement le bloc Détails.
    const moved = arrayMove(order, from, to).flatMap((id) => (id === 'details' ? ['details' as const, 'specs' as const] : [id]))
    const next = reorderCardObjects(style, wide, moved, active.id as CardObjectId)
    patch(wide ? { layoutWide: next.layoutWide } : { layout: next.layout })
  }

  return (
    <div className="flex flex-col gap-0.5">
      <p className="text-[10px] text-white/35 leading-snug mb-1">
        Ordre = position dans la fiche. Glissez ⠿ pour déplacer un bloc, cliquez son nom pour le régler.
      </p>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={order} strategy={verticalListSortingStrategy}>
          {order.map((obj) => {
            const item = byObj.get(obj)!
            return (
              <SortableVisibilityRow key={obj} id={obj} label={item.label} selected={selected === obj} onSelect={onSelect}
                checked={style[item.key] !== false}
                onCheck={(v) => patch({ [item.key]: v } as Partial<CatalogCardStyle>)} />
            )
          })}
        </SortableContext>
      </DndContext>
      {/* Élément de PAGE (pas un bloc de fiche) : hors du jeu déplaçable. */}
      <VisibilityRow id={null} label="Filet du bandeau de section" checked={style.showBandRule !== false}
        onCheck={(v) => patch({ showBandRule: v })} />
      {/* Sous-réglages HORS de la liste triable : imbriqués dans une ligne, leur
          hauteur (200 px pour les Détails) fausserait la géométrie du
          glisser-déposer — le bloc visé n'était jamais celui sous le curseur. */}
      {style.showPrice !== false && (
        <label className="flex items-center gap-1.5 mt-2 text-[11px] text-white/40 cursor-pointer select-none">
          <input type="checkbox" checked={style.showWas !== false} onChange={(e) => patch({ showWas: e.target.checked })}
            className="accent-indigo-600" />
          {t('cat.vis.strikePrice')} <span className="text-white/25">{t('cat.vis.strikePrice.note')}</span>
        </label>
      )}
      {style.showDetails !== false && (
        <div className="mt-2 pt-2 border-t border-white/10">
          <p className="text-[10px] font-semibold text-white/35 uppercase tracking-wider">{t('cat.vis.detailsContent')}</p>
          <DetailsFieldsPanel style={style} patch={patch} />
        </div>
      )}
      <label className="flex items-center gap-1.5 mt-1 text-xs text-white/40">
        Texte du ruban
        <input value={style.vedetteLabel} onChange={(e) => patch({ vedetteLabel: e.target.value })} placeholder="Vedette"
          className="w-28 px-2 py-1 rounded-md bg-well text-xs text-white outline-none border border-white/10 focus:border-[#6366f1]" />
      </label>
    </div>
  )
}
