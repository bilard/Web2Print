import { Layers } from 'lucide-react'
import type { SlideSpec } from '@/features/briefs/types'

interface Props {
  slides: SlideSpec[]
}

const TYPE_LABEL: Record<SlideSpec['type'], string> = {
  cover: 'Couverture',
  context: 'Contexte',
  product_grid: 'Grille produits',
  product_focus: 'Focus produit',
  budget: 'Budget',
  cta: 'Appel à l’action',
}

function summary(slide: SlideSpec): string {
  switch (slide.type) {
    case 'cover':
      return slide.subtitle
    case 'context':
      return `${slide.bullets.length} points clés`
    case 'product_grid':
      return `${slide.productSkus.length} produits — ${slide.layout}`
    case 'product_focus':
      return slide.productSku
    case 'budget':
      return [slide.showItemized && 'détail', slide.showTotal && 'total'].filter(Boolean).join(' + ')
    case 'cta':
      return slide.message
  }
}

export function SlideList({ slides }: Props) {
  if (slides.length === 0) {
    return (
      <div className="text-[12px] text-white/40 text-center py-12 border border-dashed border-white/[0.08] rounded-md">
        Aucun deck généré. Cliquez sur « Générer le deck » pour démarrer.
      </div>
    )
  }
  return (
    <div className="flex flex-col gap-2">
      {slides.map((slide, idx) => (
        <div
          key={idx}
          className="bg-[#141414] border border-white/[0.06] rounded-md px-3 py-2 flex items-start gap-3"
        >
          <div className="w-6 h-6 rounded bg-white/[0.06] text-white/60 text-[11px] flex items-center justify-center shrink-0 mt-0.5">
            {idx + 1}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-0.5">
              <Layers className="w-3 h-3 text-indigo-400/70" />
              <span className="text-[10px] uppercase tracking-wide text-indigo-300/80">
                {TYPE_LABEL[slide.type]}
              </span>
            </div>
            <p className="text-[13px] text-white/90 truncate">{slide.title}</p>
            <p className="text-[11px] text-white/40 truncate">{summary(slide)}</p>
          </div>
        </div>
      ))}
    </div>
  )
}
