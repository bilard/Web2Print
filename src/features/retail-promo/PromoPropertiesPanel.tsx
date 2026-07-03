import { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import { ColorPicker } from '@/components/shared/ColorPicker'
import { useRetailPromoStore } from './retailPromo.store'
import { Section, inputCls } from './promoPanelUi'
import { PromoShapeOptions } from './PromoShapeOptions'
import { PromoTextOptions } from './PromoTextOptions'
import { STYLE_KEYS, type PromoColorKey } from './RetailPromoCard'
import { FontSelectOptions } from '@/features/fonts/FontSelectOptions'
import { UserFontsPanel } from '@/features/fonts/UserFontsPanel'

const KEY_LABELS: Record<string, string> = {
  category: 'Catégorie', name: 'Nom', brand: 'Marque', description: 'Description',
  priceLabel: 'Libellé prix', priceWas: 'Prix barré', unitPrice: 'Prix unitaire', priceNow: 'Prix promo', footer: 'Pied de page',
  header: 'Bandeau en-tête', image: 'Cadre photo', badge: 'Badge remise', price: 'Bandeau prix',
}

/** Panneau de propriétés (droite) : onglets Forme/Texte, toutes les caractéristiques de l'élément. */
export function PromoPropertiesPanel() {
  const { config, selectedKey, setConfig, setSelectedKey } = useRetailPromoStore()
  const isText = selectedKey ? (STYLE_KEYS as string[]).includes(selectedKey) : false
  const [tab, setTab] = useState<'shape' | 'text'>('text')
  useEffect(() => { setTab(isText ? 'text' : 'shape') }, [selectedKey, isText])

  return (
    <aside className="sticky top-2 flex max-h-[calc(100vh-96px)] w-96 shrink-0 flex-col self-start rounded-xl border border-white/10 bg-surface">
      <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-white">Propriétés</h3>
        {selectedKey && <button onClick={() => setSelectedKey(null)} className="text-white/40 hover:text-white" title="Désélectionner"><X className="h-4 w-4" /></button>}
      </div>

      {!selectedKey ? (
        <div className="flex flex-col gap-3 px-4 py-3">
          <p className="text-xs leading-relaxed text-white/40">Cliquez un élément de la carte (texte ou bloc) pour régler ses caractéristiques ; glissez les poignées pour redimensionner.</p>
          <Section title="Habillage global">
            <div className="flex flex-col gap-3">
              <ColorPicker label="Accent (badge / prix)" value={config.accent} onChange={(accent) => setConfig({ accent })} />
              <ColorPicker label="Fond en-tête / pied" value={config.headerBg} onChange={(headerBg) => setConfig({ headerBg })} />
              <label className="flex flex-col gap-1 text-[11px] uppercase tracking-wide text-white/40">Police titres
                <select value={config.fontHeading} onChange={(e) => setConfig({ fontHeading: e.target.value })} className={inputCls}><FontSelectOptions /></select>
              </label>
              <label className="flex flex-col gap-1 text-[11px] uppercase tracking-wide text-white/40">Police prix
                <select value={config.fontPrice} onChange={(e) => setConfig({ fontPrice: e.target.value })} className={inputCls}><FontSelectOptions /></select>
              </label>
              <UserFontsPanel />
            </div>
          </Section>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="px-4 py-2.5 text-xs text-white/50">Élément : <span className="font-semibold text-[#818cf8]">{KEY_LABELS[selectedKey] ?? selectedKey}</span></div>
          {isText && (
            <div className="flex border-b border-white/10 px-2 text-xs font-semibold uppercase tracking-wide">
              {(['shape', 'text'] as const).map((t) => (
                <button key={t} onClick={() => setTab(t)}
                  className={`flex-1 border-b-2 px-2 py-2 ${tab === t ? 'border-[#6366f1] text-[#818cf8]' : 'border-transparent text-white/40 hover:text-white/70'}`}>
                  {t === 'shape' ? 'Options de forme' : 'Options de texte'}
                </button>
              ))}
            </div>
          )}
          <div className="min-h-0 flex-1 overflow-y-auto px-4">
            {tab === 'text' && isText
              ? <PromoTextOptions id={selectedKey as PromoColorKey} />
              : <PromoShapeOptions id={selectedKey} />}
          </div>
        </div>
      )}
    </aside>
  )
}
