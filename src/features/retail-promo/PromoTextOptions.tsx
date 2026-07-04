import { AlignLeft, AlignCenter, AlignRight, AlignJustify, Italic, Link2 } from 'lucide-react'
import { ColorPicker } from '@/components/shared/ColorPicker'
import { useRetailPromoStore } from './retailPromo.store'
import { PropertySection as Section, NumField, SegButtons, inputCls } from '@/components/shared/panel'
import { PromoConditionalSection } from './PromoConditionalSection'
import type { PromoColorKey, ElementStyle } from './RetailPromoCard'
import { FontSelectOptions } from '@/features/fonts/FontSelectOptions'
import type { PromoFieldKey } from './promoTypes'

type Align = NonNullable<ElementStyle['textAlign']>
type Casse = NonNullable<ElementStyle['textTransform']>
const WEIGHTS = [400, 500, 600, 700, 800, 900]
// Champ source PromoFields alimentant chaque élément texte (pour le Connecteur).
const FIELD_OF: Partial<Record<PromoColorKey, PromoFieldKey>> = {
  name: 'name', category: 'category', brand: 'brand', description: 'description',
  priceNow: 'newPrice', priceWas: 'oldPrice', unitPrice: 'unitPrice',
}

/** OPTIONS DE TEXTE : police, paragraphe, transformation, connecteur. */
const PRICE_KEYS: PromoColorKey[] = ['priceNow', 'priceWas']

export function PromoTextOptions({ id }: { id: PromoColorKey }) {
  const { config, fieldMap, rawColumns, setElementStyle } = useRetailPromoStore()
  const st = config.styles?.[id] ?? {}
  const set = (patch: Partial<ElementStyle>) => setElementStyle(id, patch)
  const fieldKey = FIELD_OF[id]
  const boundCol = fieldKey ? fieldMap[fieldKey] : undefined
  const colLabel = boundCol ? (rawColumns.find((c) => c.key === boundCol)?.label || boundCol) : undefined

  return (
    <>
      {PRICE_KEYS.includes(id) && (
        <Section title="Format du prix">
          <label className="flex items-center gap-2 text-sm text-white/70">
            <input type="checkbox" checked={!!st.euroSep} onChange={(e) => set({ euroSep: e.target.checked })} className="accent-[#6366f1]" />
            € comme séparateur <span className="text-white/40">(327€78)</span>
          </label>
        </Section>
      )}
      <Section title="Police">
        <div className="grid grid-cols-2 gap-2.5">
          <label className="col-span-2 flex flex-col gap-1 text-[11px] uppercase tracking-wide text-white/40">Famille
            <select value={st.fontFamily ?? ''} onChange={(e) => set({ fontFamily: e.target.value || undefined })} className={inputCls}>
              <option value="">Hériter</option>
              <FontSelectOptions />
            </select>
          </label>
          <NumField label="Taille" unit="px" value={st.fontSize} min={6} max={400} onChange={(v) => set({ fontSize: v })} />
          <label className="flex flex-col gap-1 text-[11px] uppercase tracking-wide text-white/40">Graisse
            <select value={st.fontWeight ?? ''} onChange={(e) => set({ fontWeight: e.target.value ? Number(e.target.value) : undefined })} className={inputCls}>
              <option value="">Auto</option>
              {WEIGHTS.map((w) => <option key={w} value={w}>{w}</option>)}
            </select>
          </label>
          <div className="col-span-2 flex items-end gap-2">
            <button type="button" onClick={() => set({ fontStyle: st.fontStyle === 'italic' ? 'normal' : 'italic' })}
              className={`flex items-center justify-center gap-1.5 rounded border border-white/10 px-3 py-1 text-sm ${st.fontStyle === 'italic' ? 'bg-[#6366f1] text-[#fff]' : 'bg-well text-white/70 hover:bg-white/10'}`}>
              <Italic className="h-3.5 w-3.5" /> Italique
            </button>
            <div className="flex-1"><ColorPicker label="Couleur texte" value={st.fill ?? config.colors[id] ?? '#ffffff'} onChange={(c) => set({ fillType: 'solid', fill: c })} /></div>
          </div>
        </div>
      </Section>

      <Section title="Paragraphe">
        <div className="flex flex-col gap-2.5">
          <SegButtons<Align> value={st.textAlign} onChange={(a) => set({ textAlign: a })}
            options={[
              { v: 'left', node: <AlignLeft className="h-3.5 w-3.5" /> }, { v: 'center', node: <AlignCenter className="h-3.5 w-3.5" /> },
              { v: 'right', node: <AlignRight className="h-3.5 w-3.5" /> }, { v: 'justify', node: <AlignJustify className="h-3.5 w-3.5" /> },
            ]} />
          <div className="grid grid-cols-2 gap-2">
            <NumField label="Interligne" step={0.05} min={0.5} max={3} value={st.lineHeight} onChange={(v) => set({ lineHeight: v })} />
            <NumField label="Espacement" unit="em" step={0.01} min={-0.1} max={1} value={st.letterSpacing} onChange={(v) => set({ letterSpacing: v })} />
          </div>
        </div>
      </Section>

      <Section title="Transformation">
        <SegButtons<Casse> value={st.textTransform ?? 'none'} onChange={(c) => set({ textTransform: c })}
          options={[{ v: 'none', node: 'Aa' }, { v: 'uppercase', node: 'AA' }, { v: 'lowercase', node: 'aa' }, { v: 'capitalize', node: 'Aa.' }]} />
      </Section>

      <Section title="Connecteur" defaultOpen={false}>
        <div className="flex items-center gap-2 rounded bg-well px-3 py-2 text-sm">
          <Link2 className="h-4 w-4 text-[#818cf8]" />
          {colLabel
            ? <span className="text-white/80"><span className="text-[#818cf8]">▸</span> {colLabel}</span>
            : <span className="text-white/40">Texte fixe (non lié à une colonne)</span>}
        </div>
      </Section>

      <PromoConditionalSection id={id} />
    </>
  )
}
