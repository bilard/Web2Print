import { AlignLeft, AlignCenter, AlignRight, Italic } from 'lucide-react'
import { FONT_OPTIONS, type ElementStyle } from './RetailPromoCard'

interface Props {
  style: ElementStyle
  onChange: (patch: Partial<ElementStyle>) => void
}

const inputCls = 'w-full rounded border border-white/10 bg-well px-2 py-1 text-sm text-white outline-none focus:border-[#6366f1] [&>option]:bg-neutral-900'
const WEIGHTS = [400, 500, 600, 700, 800, 900]
const TRANSFORMS: Array<{ v: NonNullable<ElementStyle['textTransform']>; label: string }> = [
  { v: 'none', label: 'Aucune' }, { v: 'uppercase', label: 'MAJUSCULES' },
  { v: 'lowercase', label: 'minuscules' }, { v: 'capitalize', label: 'Initiales' },
]
const ALIGNS: Array<{ v: NonNullable<ElementStyle['textAlign']>; Icon: typeof AlignLeft }> = [
  { v: 'left', Icon: AlignLeft }, { v: 'center', Icon: AlignCenter }, { v: 'right', Icon: AlignRight },
]

/** Caractéristiques typographiques d'un sous-élément texte. */
export function PromoTypographySection({ style, onChange }: Props) {
  return (
    <div className="grid grid-cols-2 gap-2.5">
      <label className="col-span-2 flex flex-col gap-1 text-[11px] uppercase tracking-wide text-white/40">Police
        <select value={style.fontFamily ?? ''} onChange={(e) => onChange({ fontFamily: e.target.value || undefined })} className={inputCls}>
          <option value="">Hériter</option>
          {FONT_OPTIONS.map((f) => <option key={f} value={f}>{f}</option>)}
        </select>
      </label>

      <label className="flex flex-col gap-1 text-[11px] uppercase tracking-wide text-white/40">Taille (px)
        <input type="number" min={6} max={300} value={style.fontSize ?? ''} placeholder="auto"
          onChange={(e) => onChange({ fontSize: e.target.value ? Number(e.target.value) : undefined })}
          className={inputCls + ' placeholder:text-white/25'} />
      </label>

      <label className="flex flex-col gap-1 text-[11px] uppercase tracking-wide text-white/40">Graisse
        <select value={style.fontWeight ?? ''} onChange={(e) => onChange({ fontWeight: e.target.value ? Number(e.target.value) : undefined })} className={inputCls}>
          <option value="">Auto</option>
          {WEIGHTS.map((w) => <option key={w} value={w}>{w}</option>)}
        </select>
      </label>

      <div className="flex flex-col gap-1 text-[11px] uppercase tracking-wide text-white/40">Style
        <button type="button" onClick={() => onChange({ fontStyle: style.fontStyle === 'italic' ? 'normal' : 'italic' })}
          className={`flex items-center justify-center gap-1.5 rounded border border-white/10 px-2 py-1 text-sm ${style.fontStyle === 'italic' ? 'bg-[#6366f1] text-[#fff]' : 'bg-well text-white/70 hover:bg-white/10'}`}>
          <Italic className="h-3.5 w-3.5" /> Italique
        </button>
      </div>

      <div className="flex flex-col gap-1 text-[11px] uppercase tracking-wide text-white/40">Alignement
        <div className="flex gap-1">
          {ALIGNS.map(({ v, Icon }) => (
            <button key={v} type="button" onClick={() => onChange({ textAlign: v })}
              className={`flex flex-1 items-center justify-center rounded border border-white/10 py-1 ${style.textAlign === v ? 'bg-[#6366f1] text-[#fff]' : 'bg-well text-white/70 hover:bg-white/10'}`}>
              <Icon className="h-3.5 w-3.5" />
            </button>
          ))}
        </div>
      </div>

      <label className="flex flex-col gap-1 text-[11px] uppercase tracking-wide text-white/40">Interligne
        <input type="number" min={0.5} max={3} step={0.05} value={style.lineHeight ?? ''} placeholder="auto"
          onChange={(e) => onChange({ lineHeight: e.target.value ? Number(e.target.value) : undefined })}
          className={inputCls + ' placeholder:text-white/25'} />
      </label>

      <label className="flex flex-col gap-1 text-[11px] uppercase tracking-wide text-white/40">Espacement (em)
        <input type="number" min={-0.1} max={1} step={0.01} value={style.letterSpacing ?? ''} placeholder="auto"
          onChange={(e) => onChange({ letterSpacing: e.target.value !== '' ? Number(e.target.value) : undefined })}
          className={inputCls + ' placeholder:text-white/25'} />
      </label>

      <label className="col-span-2 flex flex-col gap-1 text-[11px] uppercase tracking-wide text-white/40">Casse
        <select value={style.textTransform ?? 'none'} onChange={(e) => onChange({ textTransform: e.target.value as ElementStyle['textTransform'] })} className={inputCls}>
          {TRANSFORMS.map((t) => <option key={t.v} value={t.v}>{t.label}</option>)}
        </select>
      </label>
    </div>
  )
}
