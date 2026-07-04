// src/features/catalog/components/steps/CardStyleCard.tsx
// Carte « Style des fiches » : réglages COSMÉTIQUES bornés (typo/police par champ,
// couleurs & dégradés des objets, taille de l'image, visibilité) appliqués par
// variables CSS par-dessus le template fluide — impossible de casser la mise en
// page. Aperçu live à droite (vrai moteur de rendu, données du 1er produit).
import { Brush, RotateCcw } from 'lucide-react'
import type { PromoFields } from '@/features/retail-promo/promoTypes'
import { DEFAULT_CARD_STYLE, type CatalogCardStyle, type CatalogPlan } from '../../catalogTypes'
import { CardStylePreview } from './CardStylePreview'
import { CardStyleTypo } from './CardStyleTypo'
import { CardStyleColors } from './CardStyleColors'

interface CardStyleCardProps {
  plan: CatalogPlan
  setPlan: (plan: CatalogPlan) => void
  sampleFields?: PromoFields | null
}

const VISIBILITY: { key: keyof Pick<CatalogCardStyle, 'showPromo' | 'showSticker' | 'showKicker' | 'showDesc' | 'showRef' | 'showUnit' | 'showVedette' | 'showDetails'>; label: string }[] = [
  { key: 'showPromo', label: 'Cartouche promo' },
  { key: 'showSticker', label: 'Sticker remise' },
  { key: 'showKicker', label: 'Sous-famille' },
  { key: 'showDesc', label: 'Description' },
  { key: 'showRef', label: 'Référence' },
  { key: 'showUnit', label: 'Unité' },
  { key: 'showVedette', label: 'Ruban vedette' },
  { key: 'showDetails', label: 'Détails' },
]

export function CardStyleCard({ plan, setPlan, sampleFields }: CardStyleCardProps) {
  const style: CatalogCardStyle = { ...DEFAULT_CARD_STYLE, ...plan.cardStyle }
  const patch = (p: Partial<CatalogCardStyle>) => setPlan({ ...plan, cardStyle: { ...style, ...p } })

  return (
    <section className="rounded-lg border border-border bg-surface p-4 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-white">
          <Brush className="w-4 h-4 text-indigo-400" /> Style des fiches
          <span className="text-xs font-normal text-muted-foreground">— cosmétique seulement, la mise en page fluide est préservée</span>
        </h3>
        <button type="button" onClick={() => setPlan({ ...plan, cardStyle: { ...DEFAULT_CARD_STYLE } })}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs text-muted-foreground hover:text-white hover:bg-surface-2"
          title="Revenir au style par défaut">
          <RotateCcw className="w-3.5 h-3.5" /> Réinitialiser
        </button>
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_auto] items-start">
        <div className="space-y-4 min-w-0">
          <CardStyleTypo style={style} patch={patch} />
          <CardStyleColors style={style} theme={plan.theme} patch={patch} />
          <div>
            <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Éléments affichés</div>
            <div className="flex flex-wrap gap-x-4 gap-y-2 items-center">
              {VISIBILITY.map(({ key, label }) => (
                <label key={key} className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer select-none">
                  <input type="checkbox" checked={style[key]} onChange={(e) => patch({ [key]: e.target.checked } as Partial<CatalogCardStyle>)}
                    className="accent-indigo-600" />
                  {label}
                </label>
              ))}
              <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                Texte du ruban
                <input value={style.vedetteLabel} onChange={(e) => patch({ vedetteLabel: e.target.value })} placeholder="Vedette"
                  className="w-28 px-2 py-1 rounded-md bg-surface-2 text-xs text-white outline-none focus:ring-1 focus:ring-indigo-600" />
              </label>
              <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer select-none">
                <input type="checkbox" checked={style.freeLayout} onChange={(e) => patch({ freeLayout: e.target.checked })} className="accent-indigo-600" />
                Disposition libre (glisser les objets)
              </label>
              {style.freeLayout && (
                <button type="button" onClick={() => patch({ layout: {} })}
                  className="text-xs text-muted-foreground hover:text-white underline">Réinitialiser les positions</button>
              )}
            </div>
          </div>
        </div>

        <CardStylePreview theme={plan.theme} cardStyle={style} fields={sampleFields}
          editable onLayoutChange={(id, box) => patch({ layout: { ...style.layout, [id]: box } })} />
      </div>
    </section>
  )
}
