import { useState, type ReactNode } from 'react'
import { ChevronRight, X } from 'lucide-react'
import { ColorPicker } from '@/components/shared/ColorPicker'
import { GradientPicker, DEFAULT_GRADIENT } from '@/components/shared/GradientPicker'
import { useRetailPromoStore } from './retailPromo.store'
import { PromoTypographySection } from './PromoTypographySection'
import { FONT_OPTIONS, STYLE_KEYS, type PromoColorKey, type PromoBlockId, type BlockFill } from './RetailPromoCard'

const KEY_LABELS: Record<string, string> = {
  category: 'Catégorie', name: 'Nom', brand: 'Marque', description: 'Description',
  priceLabel: 'Libellé prix', priceWas: 'Prix barré', unitPrice: 'Prix unitaire',
  priceNow: 'Prix promo', footer: 'Pied de page',
  header: 'Bandeau en-tête', image: 'Cadre photo', badge: 'Badge remise', price: 'Bandeau prix',
}
/** Couleur de fond par défaut d'un bloc déco (pour initialiser le picker). */
function decoFallback(id: PromoBlockId, accent: string, headerBg: string): string {
  if (id === 'image') return '#f1f5f9'
  if (id === 'header') return headerBg
  return accent
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
  const { config, selectedKey, setConfig, setSelectedKey, setElementStyle, setBlockFill } = useRetailPromoStore()
  const textKey = selectedKey && (STYLE_KEYS as string[]).includes(selectedKey) ? (selectedKey as PromoColorKey) : null
  const decoId = selectedKey && !textKey ? selectedKey : null
  const st = textKey ? config.styles?.[textKey] ?? {} : {}
  const fillType = st.fillType ?? (st.gradient ? 'gradient' : 'solid')
  const bf: Partial<BlockFill> = decoId ? config.blockFills?.[decoId] ?? {} : {}
  const decoFill = bf.fillType ?? (bf.gradient ? 'gradient' : 'solid')

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
          <p className="text-xs leading-relaxed text-white/40">Cliquez un élément de la carte (texte ou bloc) pour régler typographie, couleur, dégradé et taille (poignées de resize).</p>
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
          <div className="py-2.5 text-xs text-white/50">Élément : <span className="font-semibold text-[#818cf8]">{KEY_LABELS[selectedKey] ?? selectedKey}</span></div>
          <p className="-mt-1 pb-2 text-[11px] text-white/30">Glissez les poignées pour redimensionner.</p>
          {textKey ? (
            <>
              <Section title="Typographie">
                <PromoTypographySection style={st} onChange={(patch) => setElementStyle(textKey, patch)} />
              </Section>
              <Section title="Remplissage">
                <div className="flex flex-col gap-3">
                  <div className="flex gap-1">
                    {(['solid', 'gradient'] as const).map((t) => (
                      <button key={t} onClick={() => setElementStyle(textKey, { fillType: t, ...(t === 'gradient' && !st.gradient ? { gradient: DEFAULT_GRADIENT } : null) })}
                        className={`flex-1 rounded border border-white/10 py-1 text-xs ${fillType === t ? 'bg-[#6366f1] text-[#fff]' : 'bg-well text-white/70 hover:bg-white/10'}`}>
                        {t === 'solid' ? 'Couleur unie' : 'Dégradé'}
                      </button>
                    ))}
                  </div>
                  {fillType === 'gradient' ? (
                    <>
                      <GradientPicker value={st.gradient ?? DEFAULT_GRADIENT} onChange={(gradient) => setElementStyle(textKey, { fillType: 'gradient', gradient })} />
                      <p className="text-[11px] leading-snug text-amber-400/80">⚠ Le dégradé sur texte s'affiche à l'aperçu et à l'export HTML. À l'export PNG, il est aplati en couleur unie (1ʳᵉ teinte).</p>
                    </>
                  ) : (
                    <ColorPicker value={st.fill ?? config.colors[textKey] ?? '#ffffff'} onChange={(fill) => setElementStyle(textKey, { fillType: 'solid', fill })} />
                  )}
                </div>
              </Section>
            </>
          ) : decoId && (
            <Section title="Fond du bloc">
              <div className="flex flex-col gap-3">
                <div className="flex gap-1">
                  {(['solid', 'gradient'] as const).map((t) => (
                    <button key={t} onClick={() => setBlockFill(decoId, { fillType: t, ...(t === 'gradient' && !bf.gradient ? { gradient: DEFAULT_GRADIENT } : null) })}
                      className={`flex-1 rounded border border-white/10 py-1 text-xs ${decoFill === t ? 'bg-[#6366f1] text-[#fff]' : 'bg-well text-white/70 hover:bg-white/10'}`}>
                      {t === 'solid' ? 'Couleur unie' : 'Dégradé'}
                    </button>
                  ))}
                </div>
                {decoFill === 'gradient' ? (
                  <GradientPicker value={bf.gradient ?? DEFAULT_GRADIENT} onChange={(gradient) => setBlockFill(decoId, { fillType: 'gradient', gradient })} />
                ) : (
                  <ColorPicker value={bf.fill ?? decoFallback(decoId, config.accent, config.headerBg)} onChange={(fill) => setBlockFill(decoId, { fillType: 'solid', fill })} />
                )}
              </div>
            </Section>
          )}
        </div>
      )}
    </aside>
  )
}
