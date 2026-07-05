// src/features/catalog/components/steps/CardLayoutGallery.tsx
// Galerie des MISES EN PAGE de fiche (structure SEULE) : templates prédéfinis
// avec croquis des DEUX variantes (verticale · pleine largeur). Appliquer
// remplace layout + layoutWide — couleurs, typo et formes sont conservées.
// Pour des identités visuelles complètes : galerie « Designs de fiche ».
import { type CSSProperties } from 'react'
import { toast } from 'sonner'
import { CARD_LAYOUT_TEMPLATES, type CardLayoutTemplate } from '../../cardLayoutTemplates'
import type { CardBox, CardObjectId, CatalogCardStyle } from '../../catalogTypes'
import { FREE_DEFAULT_LAYOUT, FREE_WIDE_LAYOUT } from '../pages/freeLayout'

interface Props {
  patch: (p: Partial<CatalogCardStyle>) => void
}

/** Croquis d'une variante du template : boîtes effectives (repli + overrides) en miniature. */
function LayoutMock({ tpl, wide }: { tpl: CardLayoutTemplate; wide: boolean }) {
  const W = wide ? 78 : 46, H = wide ? 34 : 62
  const base = wide ? FREE_WIDE_LAYOUT : FREE_DEFAULT_LAYOUT
  const eff = (id: CardObjectId): CardBox => ({ ...base[id], ...(tpl[wide ? 'layoutWide' : 'layout'][id] ?? {}) })
  const pos = (b: CardBox, h: number, w?: string): CSSProperties => ({
    position: 'absolute', height: h,
    width: w ?? `${b.w ?? 30}%`,
    ...((b.ax ?? 'l') === 'r' ? { right: `${b.x}%` } : { left: (b.ax === 'c' ? '50%' : `${b.x}%`) }),
    ...((b.ay ?? 't') === 'b' ? { bottom: `${b.y}%` } : { top: `${b.y}%` }),
    ...(b.ax === 'c' ? { transform: 'translateX(-50%)' } : {}),
  })
  const img = eff('image')
  const bars: { id: CardObjectId; h: number }[] = [
    { id: 'brand', h: 2 }, { id: 'name', h: 3 }, { id: 'description', h: 5 }, { id: 'details', h: 7 }, { id: 'ref', h: 2 },
  ]
  return (
    <span className="relative inline-block rounded-[3px] border border-white/15 bg-well" style={{ width: W, height: H }}>
      <span className="absolute inset-x-0 top-0 rounded-t-[3px] bg-white/20" style={{ height: 4 }} />
      <span className="rounded-[2px] border border-indigo-400/50 bg-indigo-400/20"
        style={{ ...pos(img, 0), height: `${img.h ?? 40}%` }} />
      {bars.map(({ id, h }) => <span key={id} className="rounded-[1px] bg-white/30" style={pos(eff(id), h)} />)}
      <span className="rounded-[2px] bg-indigo-400" style={pos(eff('price'), 7, '32%')} />
    </span>
  )
}

export function CardLayoutGallery({ patch }: Props) {
  return (
    <div className="flex flex-col gap-1.5">
      {CARD_LAYOUT_TEMPLATES.map((t) => (
        <button key={t.name} type="button" title={t.desc}
          onClick={() => { patch({ layout: { ...t.layout }, layoutWide: { ...t.layoutWide } }); toast.success(`Mise en page « ${t.name} » appliquée`) }}
          className="flex items-center gap-2.5 p-2 rounded-md border border-border bg-surface-2 hover:border-indigo-500 text-left">
          <LayoutMock tpl={t} wide={false} />
          <LayoutMock tpl={t} wide />
          <span className="text-[11px] text-white/70 leading-tight flex-1 min-w-0">{t.name}</span>
        </button>
      ))}
    </div>
  )
}
