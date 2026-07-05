// src/features/catalog/components/steps/CardDesignGallery.tsx
// Galerie des DESIGNS de fiche : identités visuelles complètes (polices,
// couleurs, formes, fond, structure) — vignette-mock colorée fidèle au design.
// + « Mes modèles » : le style complet courant enregistré sous un nom
// (users/{uid}/catalogCardPresets), réutilisable sur tous les catalogues.
import { useEffect, useState, type CSSProperties } from 'react'
import { Save, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { CARD_DESIGNS, type CardDesign } from '../../cardDesigns'
import { deleteCardPreset, listCardPresets, saveCardPreset, type UserCardPreset } from '../../cardPresetsApi'
import { DEFAULT_CARD_STYLE, type CardBox, type CardObjectId, type CatalogCardStyle } from '../../catalogTypes'
import { FREE_DEFAULT_LAYOUT } from '../pages/freeLayout'

interface Props {
  style: CatalogCardStyle
  /** Applique un design (ou un modèle enregistré) : style COMPLET, tel quel. */
  applyFull: (cs: CatalogCardStyle) => void
}

/** L'« accent hérité du thème » des vignettes ('' = hérite) — représenté en indigo. */
const INHERIT = '#6366f1'
const PRICE_R = { tag: 2, rounded: 5, pill: 99, square: 0 } as const
const STICKER_R = { round: 99, rounded: 4, square: 1 } as const

/** Vignette-mock COLORÉE d'un design : fond, cartouche, image, textes, badges réels. */
function DesignMock({ d }: { d: CardDesign }) {
  const s: CatalogCardStyle = { ...DEFAULT_CARD_STYLE, ...d.style }
  const eff = (id: CardObjectId): CardBox => ({ ...FREE_DEFAULT_LAYOUT[id], ...(s.layout[id] ?? {}) })
  const pos = (b: CardBox, h: number, w?: string): CSSProperties => ({
    position: 'absolute', height: h, width: w ?? `${b.w ?? 30}%`,
    ...((b.ax ?? 'l') === 'r' ? { right: `${b.x}%` } : { left: b.ax === 'c' ? '50%' : `${b.x}%` }),
    ...((b.ay ?? 't') === 'b' ? { bottom: `${b.y}%` } : { top: `${b.y}%` }),
    ...(b.ax === 'c' ? { transform: 'translateX(-50%)' } : {}),
  })
  const img = eff('image'), sticker = eff('sticker')
  return (
    <span className="relative inline-block overflow-hidden border border-white/15 shrink-0"
      style={{ width: 58, height: 78, background: s.cellBg || '#fff', borderRadius: Math.min(6, s.radius) }}>
      <span className="absolute inset-x-0 top-0" style={{ height: 6, background: s.promoBg || INHERIT }} />
      <span style={{ ...pos(img, 0), height: `${img.h ?? 40}%`, background: 'linear-gradient(180deg,#eef1f4,#dde3e9)', borderRadius: 2 }} />
      <span style={{ ...pos(sticker, 8, '18%'), borderRadius: STICKER_R[s.stickerShape], background: s.stickerBg || INHERIT, transform: `rotate(${s.stickerRotate}deg)` }} />
      <span style={{ ...pos(eff('name'), 4), background: s.nameColor || '#334155', borderRadius: 1 }} />
      <span style={{ ...pos(eff('description'), 6), background: 'rgba(100,116,139,.45)', borderRadius: 1 }} />
      <span style={{ ...pos(eff('details'), 8), background: 'rgba(100,116,139,.2)', borderRadius: 1 }} />
      <span style={{ ...pos(eff('price'), 9, '34%'), borderRadius: PRICE_R[s.priceShape], background: s.priceBg || INHERIT, transform: `rotate(${s.priceRotate}deg)` }} />
    </span>
  )
}

export function CardDesignGallery({ style, applyFull }: Props) {
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
      <div className="grid grid-cols-2 gap-1.5">
        {CARD_DESIGNS.map((d) => (
          <button key={d.name} type="button" title={d.desc}
            onClick={() => { applyFull({ ...DEFAULT_CARD_STYLE, ...d.style }); toast.success(`Design « ${d.name} » appliqué`) }}
            className="flex flex-col items-center gap-1.5 p-2 rounded-md border border-border bg-surface-2 hover:border-indigo-500">
            <DesignMock d={d} />
            <span className="text-[10px] text-white/70 leading-tight text-center">{d.name}</span>
          </button>
        ))}
      </div>
      {mine.length > 0 && (
        <div className="space-y-1">
          <span className="text-[10px] font-semibold text-white/40 uppercase tracking-wider">Mes modèles</span>
          {mine.map((p) => (
            <div key={p.id} className="flex items-center gap-1">
              <button type="button" onClick={() => { applyFull({ ...DEFAULT_CARD_STYLE, ...p.cardStyle }); toast.success(`Modèle « ${p.name} » appliqué`) }}
                title="Appliquer ce modèle (design complet : mise en page, couleurs, typo, formes)"
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
          title="Enregistrer la fiche ACTUELLE (design complet) comme modèle réutilisable"
          className="flex items-center gap-1 px-2 py-1.5 rounded-md bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-[#fff] text-[11px] font-medium">
          <Save className="w-3.5 h-3.5" /> Enregistrer
        </button>
      </div>
    </div>
  )
}
