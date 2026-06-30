import { useState, type ReactNode } from 'react'
import { ChevronRight, X } from 'lucide-react'
import { ColorPicker } from '@/components/shared/ColorPicker'
import { GradientPicker, DEFAULT_GRADIENT } from '@/components/shared/GradientPicker'
import { useRetailPromoStore } from './retailPromo.store'
import { PromoTypographySection } from './PromoTypographySection'
import { FONT_OPTIONS, type PromoColorKey } from './RetailPromoCard'

const KEY_LABELS: Record<PromoColorKey, string> = {
  category: 'Catégorie', name: 'Nom', brand: 'Marque', description: 'Description',
  priceLabel: 'Libellé prix', priceWas: 'Prix barré', unitPrice: 'Prix unitaire',
  priceNow: 'Prix promo', footer: 'Pied de page',
}
const selectCls = 'w-full rounded border border-white/10 bg-well px-2 py-1 text-sm text-white outline-none focus:border-[#6366f1] [&>option]:bg-neutral-900'

function Section({ title, children, defaultOpen = true }: { title: string; children: ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="border-b border-white/5">
      <button onClick={() => setOpen((o) => !o)} className="flex w-full items-center gap-2 py-2.5 text-xs font-semibold uppercase tracking-wide text-white/60 hover:text-white">
        <ChevronRight className={`h-3.5 w-3.5 transition-transform ${open ? 'rotate-90' : ''}`} /> {title}
      </button>
      {open && <div className="pb-3">{children}</div>}
    </div>
  )
}

/** Panneau de propriétés (droite) : caractéristiques typo/couleur/dégradé de l'élément sélectionné. */
export function PromoPropertiesPanel() {
  const { config, selectedKey, setConfig, setSelectedKey, setElementStyle } = useRetailPromoStore()
  const st = selectedKey ? config.styles?.[selectedKey] ?? {} : {}
  const fillType = st.fillType ?? (st.gradient ? 'gradient' : 'solid')

  return (
    <aside className="flex w-72 shrink-0 flex-col rounded-xl border border-white/10 bg-surface">
      <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-white">Propriétés</h3>
        {selectedKey && (
          <button onClick={() => setSelectedKey(null)} className="text-white/40 hover:text-white" title="Désélectionner"><X className="h-4 w-4" /></button>
        )}
      </div>

      {!selectedKey ? (
        <div className="flex flex-col gap-3 px-4 py-3">
          <p className="text-xs leading-relaxed text-white/40">Cliquez un texte de la carte pour en régler la typographie, la couleur et le dégradé.</p>
          <Section title="Habillage global">
            <div className="flex flex-col gap-3">
              <ColorPicker label="Accent (badge / prix)" value={config.accent} onChange={(accent) => setConfig({ accent })} />
              <ColorPicker label="Fond en-tête / pied" value={config.headerBg} onChange={(headerBg) => setConfig({ headerBg })} />
              <label className="flex flex-col gap-1 text-[11px] uppercase tracking-wide text-white/40">Police titres
                <select value={config.fontHeading} onChange={(e) => setConfig({ fontHeading: e.target.value })} className={selectCls}>
                  {FONT_OPTIONS.map((f) => <option key={f} value={f}>{f}</option>)}
                </select>
              </label>
              <label className="flex flex-col gap-1 text-[11px] uppercase tracking-wide text-white/40">Police prix
                <select value={config.fontPrice} onChange={(e) => setConfig({ fontPrice: e.target.value })} className={selectCls}>
                  {FONT_OPTIONS.map((f) => <option key={f} value={f}>{f}</option>)}
                </select>
              </label>
            </div>
          </Section>
        </div>
      ) : (
        <div className="flex flex-col px-4">
          <div className="py-2.5 text-xs text-white/50">Élément : <span className="font-semibold text-[#818cf8]">{KEY_LABELS[selectedKey]}</span></div>
          <Section title="Typographie">
            <PromoTypographySection style={st} onChange={(patch) => setElementStyle(selectedKey, patch)} />
          </Section>
          <Section title="Remplissage">
            <div className="flex flex-col gap-3">
              <div className="flex gap-1">
                {(['solid', 'gradient'] as const).map((t) => (
                  <button key={t} onClick={() => setElementStyle(selectedKey, { fillType: t, ...(t === 'gradient' && !st.gradient ? { gradient: DEFAULT_GRADIENT } : null) })}
                    className={`flex-1 rounded border border-white/10 py-1 text-xs ${fillType === t ? 'bg-[#6366f1] text-[#fff]' : 'bg-well text-white/70 hover:bg-white/10'}`}>
                    {t === 'solid' ? 'Couleur unie' : 'Dégradé'}
                  </button>
                ))}
              </div>
              {fillType === 'gradient' ? (
                <>
                  <GradientPicker value={st.gradient ?? DEFAULT_GRADIENT} onChange={(gradient) => setElementStyle(selectedKey, { fillType: 'gradient', gradient })} />
                  <p className="text-[11px] leading-snug text-amber-400/80">⚠ Le dégradé sur texte s'affiche à l'aperçu et à l'export HTML. À l'export PNG, il est aplati en couleur unie (1ʳᵉ teinte).</p>
                </>
              ) : (
                <ColorPicker value={st.fill ?? config.colors[selectedKey] ?? '#ffffff'} onChange={(fill) => setElementStyle(selectedKey, { fillType: 'solid', fill })} />
              )}
            </div>
          </Section>
        </div>
      )}
    </aside>
  )
}
