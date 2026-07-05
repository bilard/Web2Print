// src/features/catalog/components/steps/CardStyleTypo.tsx
// Sous-panneau « typo » du style de fiches : échelle ET police pour CHAQUE champ
// texte mappé (nom, description, prix, marque, référence, unité, cartouche promo).
// « Police du thème » = hérite des polices du plan (titres ou texte selon le champ).
// Widgets du kit : SliderField (échelle) + <select> stylé inputCls (police).
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { FontSelectOptions } from '@/features/fonts/FontSelectOptions'
import { SliderField, inputCls } from '@/components/shared/panel'
import { CARD_OBJECT_IDS, type CardObjectId, type CatalogCardStyle } from '../../catalogTypes'
import { freeLayoutBox, visualPos } from '../pages/freeLayout'

interface CardStyleTypoProps {
  style: CatalogCardStyle
  patch: (p: Partial<CatalogCardStyle>) => void
  /** Objet sélectionné dans l'aperçu (disposition libre) — surligne + focus la ligne correspondante. */
  selected?: CardObjectId | null
}

type ScaleKey = 'nameScale' | 'descScale' | 'priceScale' | 'brandScale' | 'refScale' | 'unitScale' | 'promoScale' | 'stickerScale' | 'vedetteScale' | 'detailsScale'
type FontKey = 'nameFont' | 'descFont' | 'priceFont' | 'brandFont' | 'refFont' | 'unitFont' | 'promoFont' | 'stickerFont' | 'vedetteFont' | 'detailsFont'

const FIELDS: { scale: ScaleKey; font: FontKey; label: string; obj: CardObjectId }[] = [
  { scale: 'nameScale', font: 'nameFont', label: 'Nom', obj: 'name' },
  { scale: 'descScale', font: 'descFont', label: 'Description', obj: 'description' },
  { scale: 'priceScale', font: 'priceFont', label: 'Prix', obj: 'price' },
  { scale: 'brandScale', font: 'brandFont', label: 'Marque', obj: 'brand' },
  { scale: 'refScale', font: 'refFont', label: 'Référence', obj: 'ref' },
  { scale: 'unitScale', font: 'unitFont', label: 'Unité', obj: 'unit' },
  { scale: 'promoScale', font: 'promoFont', label: 'Cartouche promo', obj: 'promo' },
  { scale: 'stickerScale', font: 'stickerFont', label: 'Sticker remise', obj: 'sticker' },
  { scale: 'vedetteScale', font: 'vedetteFont', label: 'Ruban vedette', obj: 'vedette' },
  { scale: 'detailsScale', font: 'detailsFont', label: 'Détails', obj: 'details' },
]

/** Nom d'affichage de chaque bloc (options du sélecteur de liaison). */
const OBJ_LABEL: Record<CardObjectId, string> = {
  promo: 'Cartouche promo', vedette: 'Ruban vedette', kicker: 'Sous-famille', image: 'Image',
  sticker: 'Sticker remise', brand: 'Marque', name: 'Nom', description: 'Description',
  ref: 'Référence', unit: 'Unité', details: 'Détails', price: 'Prix',
}

/** Objet de l'overlay « disposition libre » → champ d'échelle correspondant (image/kicker n'ont pas de curseur typo). */
const OBJ_TO_SCALE: Partial<Record<CardObjectId, ScaleKey>> = {
  name: 'nameScale', description: 'descScale', price: 'priceScale', brand: 'brandScale',
  ref: 'refScale', unit: 'unitScale', promo: 'promoScale', sticker: 'stickerScale',
  vedette: 'vedetteScale', details: 'detailsScale',
}

export function CardStyleTypo({ style, patch, selected }: CardStyleTypoProps) {
  const inputRefs = useRef<Partial<Record<ScaleKey, HTMLInputElement | null>>>({})
  const activeScale = selected != null ? OBJ_TO_SCALE[selected] : undefined

  useEffect(() => {
    if (!activeScale) return
    const el = inputRefs.current[activeScale]
    el?.scrollIntoView({ block: 'center', behavior: 'smooth' })
    el?.focus()
  }, [selected])

  // Liaison entre blocs (disposition libre) : le bloc est SOUDÉ à droite de sa
  // cible et la suit partout. Éditable ici pour VOIR tous les liens d'un coup.
  const setLink = (obj: CardObjectId, target: string) => {
    const base = freeLayoutBox(obj, style)
    const layout = { ...style.layout }
    if (target) {
      // Si la cible (ou sa chaîne) est déjà liée à ce bloc, lier = INVERSER la
      // liaison : on coupe le lien qui reboucle (un cycle rendrait les positions
      // instables — chaque bloc se souderait à droite de l'autre).
      const seen = new Set<CardObjectId>()
      let cur: CardObjectId | null | undefined = target as CardObjectId
      while (cur && !seen.has(cur)) {
        seen.add(cur)
        const b = freeLayoutBox(cur, style)
        if (b.link === obj) {
          // link:null (persistant après stripUndefined) : masque un lien PAR DÉFAUT.
          layout[cur] = { ...b, link: null, lx: 0, ly: 0, ...(visualPos(cur) ?? {}) }
          break
        }
        cur = b.link
      }
      layout[obj] = { ...base, link: target as CardObjectId, lx: 0, ly: 0 } // soudure fraîche
    } else {
      layout[obj] = { ...base, link: null, lx: 0, ly: 0, ...(visualPos(obj) ?? {}) } // délié SANS saut
    }
    patch({ layout })
  }

  // ── Visualisation des liaisons : une COULEUR par groupe (cible + suiveurs
  // teintés pareil) et des connecteurs FLÉCHÉS façon UML dans la marge gauche.
  const LINK_COLORS = ['#6366f1', '#06b6d4', '#f59e0b', '#ec4899', '#22c55e', '#eab308']
  const links = FIELDS
    .map((f) => ({ from: f.obj, to: freeLayoutBox(f.obj, style).link }))
    .filter((l): l is { from: CardObjectId; to: CardObjectId } => !!l.to)
  const groupColor = new Map<CardObjectId, string>()
  for (const l of links) if (!groupColor.has(l.to)) groupColor.set(l.to, LINK_COLORS[groupColor.size % LINK_COLORS.length])
  const rowColor = (obj: CardObjectId): string | undefined =>
    groupColor.get(obj) ?? groupColor.get(links.find((l) => l.from === obj)?.to as CardObjectId)

  const wrapRef = useRef<HTMLDivElement | null>(null)
  const rowRefs = useRef<Partial<Record<CardObjectId, HTMLDivElement | null>>>({})
  const [arrows, setArrows] = useState<{ d: string; head: string; color: string }[]>([])
  const linksKey = links.map((l) => `${l.from}>${l.to}`).join(',')
  useLayoutEffect(() => {
    const wrap = wrapRef.current
    if (!wrap || links.length === 0) { setArrows((a) => (a.length ? [] : a)); return }
    const wt = wrap.getBoundingClientRect().top
    const next = links.flatMap((l) => {
      const a = rowRefs.current[l.from], b = rowRefs.current[l.to]
      if (!a || !b) return []
      const y1 = a.getBoundingClientRect().top - wt + 14 // départ : le suiveur
      const y2 = b.getBoundingClientRect().top - wt + 14 // arrivée : la CIBLE (pointe de flèche)
      // Connecteur ORTHOGONAL (angles droits, façon UML) : sortie à gauche,
      // segment vertical, entrée horizontale dans la cible.
      return [{
        d: `M 14 ${y1} L 4 ${y1} L 4 ${y2} L 7 ${y2}`,
        head: `M 13 ${y2} L 6 ${y2 - 3.5} L 6 ${y2 + 3.5} Z`,
        color: groupColor.get(l.to)!,
      }]
    })
    setArrows((prev) => (JSON.stringify(prev) === JSON.stringify(next) ? prev : next))
  }, [linksKey, style])

  return (
    <div ref={wrapRef} className="relative pl-4">
      {/* Connecteurs de liaison (suiveur → cible), façon diagramme UML. */}
      {arrows.length > 0 && (
        <svg className="absolute left-0 top-0 h-full w-4 pointer-events-none overflow-visible">
          {arrows.map((a, i) => (
            <g key={i}>
              <path d={a.d} fill="none" stroke={a.color} strokeWidth={1.5} />
              <path d={a.head} fill={a.color} />
            </g>
          ))}
        </svg>
      )}
      <div className="grid grid-cols-1 gap-y-3">
        {FIELDS.map(({ scale, font, label, obj }) => {
          const link = freeLayoutBox(obj, style).link
          const color = rowColor(obj)
          return (
            <div key={scale} ref={(el) => { rowRefs.current[obj] = el }}
              className={`space-y-1 ${scale === activeScale ? 'ring-2 ring-indigo-500 rounded-md' : ''}`}
              style={color ? { boxShadow: `inset 3px 0 0 ${color}`, borderRadius: 6, paddingLeft: 6 } : undefined}>
              <SliderField label={label} value={style[scale]} onChange={(v) => patch({ [scale]: v } as Partial<CatalogCardStyle>)}
                min={0.7} max={10} step={0.05} unit="×" inputRef={(el) => { inputRefs.current[scale] = el }} />
              <select value={style[font]} onChange={(e) => patch({ [font]: e.target.value } as Partial<CatalogCardStyle>)}
                className={inputCls}>
                <option value="">Police du thème</option>
                <FontSelectOptions />
              </select>
              <label className="flex items-center gap-1.5 text-[10px]"
                style={{ color: link && color ? color : 'rgba(255,255,255,.3)' }}
                title="Liaison : ce bloc est soudé à DROITE du bloc choisi et le suit partout">
                🔗
                <select value={link ?? ''} onChange={(e) => setLink(obj, e.target.value)}
                  className={`${inputCls} !py-0.5 !text-[10px]`}
                  style={link && color ? { color, borderColor: color } : undefined}>
                  <option value="">Non lié</option>
                  {CARD_OBJECT_IDS.filter((t) => t !== obj).map((t) => (
                    <option key={t} value={t}>Lié à : {OBJ_LABEL[t]}</option>
                  ))}
                </select>
              </label>
            </div>
          )
        })}
      </div>
    </div>
  )
}
