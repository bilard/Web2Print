import { Check, FileDown, Zap } from 'lucide-react'
import type { EnrichedProduct } from '@/features/excel/ai-enrichment/types'
import { displayDocumentName } from '@/features/excel/ai-enrichment/documentUtils'

interface Props {
  product: EnrichedProduct
}

const ADVANTAGE_COLORS = [
  { border: 'border-amber-500/20', bg: 'bg-amber-500/[0.06]', text: 'text-amber-400/70' },
  { border: 'border-teal-500/20', bg: 'bg-teal-500/[0.06]', text: 'text-teal-400/70' },
  { border: 'border-violet-500/20', bg: 'bg-violet-500/[0.06]', text: 'text-violet-400/70' },
]

const SPEC_COLORS = [
  { border: 'border-indigo-500/30', bg: 'bg-indigo-500/[0.07]', text: 'text-indigo-400/80' },
  { border: 'border-emerald-500/30', bg: 'bg-emerald-500/[0.07]', text: 'text-emerald-400/80' },
  { border: 'border-amber-500/30', bg: 'bg-amber-500/[0.07]', text: 'text-amber-400/80' },
  { border: 'border-rose-500/30', bg: 'bg-rose-500/[0.07]', text: 'text-rose-400/80' },
  { border: 'border-cyan-500/30', bg: 'bg-cyan-500/[0.07]', text: 'text-cyan-400/80' },
]

function groupBy<T extends { group?: string }>(items: T[]): Array<{ group: string | undefined; items: T[] }> {
  const order: Array<string | undefined> = []
  const map = new Map<string | undefined, T[]>()
  for (const it of items) {
    const k = it.group || undefined
    if (!map.has(k)) { order.push(k); map.set(k, []) }
    map.get(k)!.push(it)
  }
  return order.map((g) => ({ group: g, items: map.get(g)! }))
}

export function ProductEnrichedView({ product }: Props) {
  const advGroups = groupBy(product.advantages)
  const specGroups = groupBy(product.specifications)
  const hasVariantProps = product.variants.some((v) => Object.keys(v.properties).length > 0)

  return (
    <div className="space-y-4">
      {product.description && (
        <section className="px-4 py-3 rounded-lg border border-white/[0.06] bg-white/[0.02]">
          <p className="text-[10px] font-semibold text-white/30 uppercase tracking-wider mb-2">Description</p>
          <p className="text-[12.5px] text-white/75 leading-relaxed whitespace-pre-line">{product.description}</p>
        </section>
      )}

      {product.advantages.length > 0 && (
        <section className="space-y-2">
          <p className="text-[10px] font-semibold text-white/30 uppercase tracking-wider flex items-center gap-1.5">
            <Zap className="w-3 h-3 text-amber-400/60" />
            Avantages ({product.advantages.length})
          </p>
          {advGroups.map((g, gi) => {
            const c = g.group ? ADVANTAGE_COLORS[gi % ADVANTAGE_COLORS.length] : null
            return (
              <div key={gi} className={`rounded-lg ${c ? `border ${c.border}` : 'border border-white/[0.05]'} overflow-hidden`}>
                {g.group && c && (
                  <div className={`px-3 py-1.5 ${c.bg}`}>
                    <p className={`text-[10px] font-bold uppercase tracking-wider ${c.text}`}>{g.group}</p>
                  </div>
                )}
                <ul className={`space-y-1 ${g.group ? 'px-3 py-2' : 'px-3 py-2'}`}>
                  {g.items.map((a, i) => (
                    <li key={i} className="flex items-start gap-2 text-[12px] text-white/70 leading-relaxed">
                      <Check className="mt-[2px] w-3.5 h-3.5 text-emerald-400/70 shrink-0" />
                      <span>{a.text}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )
          })}
        </section>
      )}

      {product.specifications.length > 0 && (
        <section className="space-y-2">
          <p className="text-[10px] font-semibold text-white/30 uppercase tracking-wider">Spécifications</p>
          {specGroups.map((g, gi) => {
            const c = g.group ? SPEC_COLORS[gi % SPEC_COLORS.length] : null
            return (
              <div key={gi} className={`rounded-lg ${c ? `border ${c.border}` : 'border border-white/[0.05]'} overflow-hidden`}>
                {g.group && c && (
                  <div className={`px-3 py-1.5 ${c.bg}`}>
                    <p className={`text-[10px] font-bold uppercase tracking-wider ${c.text}`}>{g.group}</p>
                  </div>
                )}
                <div className="grid grid-cols-2 gap-x-6 gap-y-0.5 px-3 py-2">
                  {g.items.map((s, i) => (
                    <div key={i} className="flex items-baseline gap-2 py-0.5">
                      <span className="text-[11px] text-white/40 shrink-0">{s.name}</span>
                      <span className="text-[11px] text-white/75 font-medium text-right ml-auto">{s.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
        </section>
      )}

      {product.variants.length > 0 && hasVariantProps && (
        <section className="space-y-2">
          <p className="text-[10px] font-semibold text-white/30 uppercase tracking-wider">Variantes ({product.variants.length})</p>
          <div className="rounded-lg border border-white/[0.08] overflow-hidden">
            {product.variants.map((v, vi) => (
              <details key={vi} className="border-t border-white/[0.04] first:border-t-0">
                <summary className="cursor-pointer px-3 py-2 hover:bg-white/[0.03] flex items-center gap-3 text-[11px]">
                  <span className="font-semibold text-indigo-400/80 w-24 shrink-0">{v.reference}</span>
                  <span className="text-white/60 truncate flex-1" title={v.label}>{v.label}</span>
                  <span className="text-white/30 text-[10px]">{Object.keys(v.properties).length} caract.</span>
                </summary>
                <div className="grid grid-cols-2 gap-x-6 gap-y-0.5 px-4 py-2 bg-white/[0.02]">
                  {Object.entries(v.properties).map(([k, val]) => (
                    <div key={k} className="flex items-baseline gap-2 py-0.5">
                      <span className="text-[10px] text-white/40 shrink-0">{k}</span>
                      <span className="text-[10px] text-white/75 font-medium text-right ml-auto">{val}</span>
                    </div>
                  ))}
                </div>
              </details>
            ))}
          </div>
        </section>
      )}

      {product.documents.length > 0 && (
        <section className="space-y-2">
          <p className="text-[10px] font-semibold text-white/30 uppercase tracking-wider flex items-center gap-1.5">
            <FileDown className="w-3 h-3" />
            Documents ({product.documents.length})
          </p>
          <div className="flex flex-col gap-1">
            {product.documents.map((doc, i) => (
              <a key={i} href={doc.url} target="_blank" rel="noreferrer"
                title={doc.filename || doc.url}
                className="px-2.5 py-1.5 rounded-md bg-white/[0.03] border border-white/[0.06] hover:border-indigo-400/40 text-[11px] text-white/60 hover:text-white/90 truncate transition-colors">
                {displayDocumentName(doc)}
              </a>
            ))}
          </div>
        </section>
      )}

      {product.images.length > 0 && (
        <section className="space-y-2">
          <p className="text-[10px] font-semibold text-white/30 uppercase tracking-wider">Images ({product.images.length})</p>
          <div className="grid grid-cols-4 gap-2">
            {product.images.slice(0, 12).map((url, i) => (
              <a key={i} href={url} target="_blank" rel="noreferrer" className="aspect-square rounded border border-white/[0.06] overflow-hidden hover:border-indigo-400/40 transition-colors">
                <img src={url} alt={`product-${i}`} className="w-full h-full object-contain bg-white/[0.02]" loading="lazy" />
              </a>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
