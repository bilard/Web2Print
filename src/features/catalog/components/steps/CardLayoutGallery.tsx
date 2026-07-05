// src/features/catalog/components/steps/CardLayoutGallery.tsx
// Galerie des MISES EN PAGE de fiche : templates prédéfinis (structures
// complètement différentes, croquis des DEUX variantes verticale/pleine
// largeur) + « Mes modèles » (style complet enregistré par l'utilisateur).
import { useEffect, useState, type CSSProperties } from 'react'
import { Save, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { CARD_LAYOUT_TEMPLATES, type CardLayoutTemplate } from '../../cardLayoutTemplates'
import { deleteCardPreset, listCardPresets, saveCardPreset, type UserCardPreset } from '../../cardPresetsApi'
import type { CardBox, CardObjectId, CatalogCardStyle } from '../../catalogTypes'
import { FREE_DEFAULT_LAYOUT, FREE_WIDE_LAYOUT } from '../pages/freeLayout'

interface Props {
  style: CatalogCardStyle
  /** Template prédéfini = remplace layout + layoutWide (couleurs/typo/formes conservées). */
  patch: (p: Partial<CatalogCardStyle>) => void
  /** Modèle utilisateur = style COMPLET appliqué tel quel. */
  applyFull: (cs: CatalogCardStyle) => void
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

export function CardLayoutGallery({ style, patch, applyFull }: Props) {
  const [mine, setMine] = useState<UserCardPreset[]>([])
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  useEffect(() => { void listCardPresets().then(setMine).catch(() => undefined) }, [])

  const save = async () => {
    const n = name.trim()
    if (!n) { toast.error('Donnez un nom au modèle'); return }
    setBusy(true)
    try {
      await saveCardPreset(n, style)
      setMine(await listCardPresets())
      setName('')
      toast.success(`Modèle « ${n} » enregistré`)
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Enregistrement impossible') }
    finally { setBusy(false) }
  }

  return (
    <div className="space-y-3">
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
      {/* Mes modèles : style COMPLET (mise en page + couleurs + typo + formes). */}
      {mine.length > 0 && (
        <div className="space-y-1">
          <span className="text-[10px] font-semibold text-white/40 uppercase tracking-wider">Mes modèles</span>
          {mine.map((p) => (
            <div key={p.id} className="flex items-center gap-1">
              <button type="button" onClick={() => { applyFull(p.cardStyle); toast.success(`Modèle « ${p.name} » appliqué`) }}
                title="Appliquer ce modèle (style complet : mise en page, couleurs, typo, formes)"
                className="flex-1 px-2 py-1.5 rounded-md border border-border bg-surface-2 hover:border-indigo-500 text-left text-[11px] text-white/70 truncate">
                {p.name}
              </button>
              <button type="button" onClick={() => { void deleteCardPreset(p.id).then(() => setMine((m) => m.filter((x) => x.id !== p.id))) }}
                title="Supprimer ce modèle" className="p-1.5 rounded-md text-white/30 hover:text-red-400 hover:bg-well">
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
      <div className="flex items-center gap-1">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nom du modèle…"
          onKeyDown={(e) => { if (e.key === 'Enter') void save() }}
          className="flex-1 min-w-0 px-2 py-1.5 rounded-md bg-well text-[11px] text-white outline-none border border-white/10 focus:border-[#6366f1]" />
        <button type="button" onClick={() => void save()} disabled={busy}
          title="Enregistrer la fiche ACTUELLE (mise en page, couleurs, typo, formes) comme modèle réutilisable"
          className="flex items-center gap-1 px-2 py-1.5 rounded-md bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-[#fff] text-[11px] font-medium">
          <Save className="w-3.5 h-3.5" /> Enregistrer
        </button>
      </div>
    </div>
  )
}
