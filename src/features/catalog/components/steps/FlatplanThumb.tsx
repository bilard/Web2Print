// src/features/catalog/components/steps/FlatplanThumb.tsx
// Vignette SCHÉMATIQUE d'une page du chemin de fer : pas de rendu réel (perf sur
// 100+ pages) mais la vraie structure — grille et spans des slots issus du
// packing, vedette en accent, bandeau coloré par univers. Le clic ouvre la page
// réelle en grand (lightbox).
import { Star } from 'lucide-react'
import type { CatalogPageDescriptor } from '../../catalogTypes'
import { GRID_DIMS } from '../../catalogTypes'
import type { CatalogRenderCtx } from '../pages/catalogCss'

interface Props {
  page: CatalogPageDescriptor
  ctx: CatalogRenderCtx
  /** Couleur de l'univers (repère du chemin de fer). */
  color: string
  width: number
  dimmed: boolean
  onOpen: () => void
}

const KIND_LABELS: Record<CatalogPageDescriptor['kind'], string> = {
  'cover': 'Couverture', 'toc': 'Sommaire', 'opener': 'Ouverture', 'products': 'Produits', 'back-cover': '4e de couv.',
}

function ThumbBody({ page, ctx, color, width }: Omit<Props, 'dimmed' | 'onOpen'>) {
  const { theme } = ctx.plan
  const pad = Math.max(2, width * 0.03)
  if (page.kind === 'cover' || page.kind === 'back-cover') {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center text-center" style={{ background: theme.accent, padding: pad }}>
        <span className="font-bold text-[#fff] leading-tight" style={{ fontSize: Math.max(6, width * 0.07) }}>
          {page.kind === 'cover' ? ctx.plan.cover.title || ctx.catalogName : ctx.plan.backCover.title}
        </span>
      </div>
    )
  }
  if (page.kind === 'toc') {
    return (
      <div className="w-full h-full" style={{ background: theme.pageBg, padding: pad }}>
        <div style={{ background: theme.ink, height: width * 0.06, width: '55%', marginBottom: pad }} />
        {Array.from({ length: Math.min(10, page.entries.length || 8) }, (_, i) => (
          <div key={i} style={{ background: `${theme.ink}30`, height: Math.max(2, width * 0.025), width: `${88 - (i % 3) * 10}%`, marginBottom: Math.max(2, width * 0.02) }} />
        ))}
      </div>
    )
  }
  if (page.kind === 'opener') {
    return (
      <div className="w-full h-full flex flex-col justify-between" style={{ background: color, padding: pad }}>
        <span className="font-black text-[#fff] opacity-80 leading-none" style={{ fontSize: width * 0.28 }}>{String(page.index).padStart(2, '0')}</span>
        <div>
          <div className="font-bold text-[#fff] leading-tight break-words" style={{ fontSize: Math.max(6, width * 0.085) }}>{page.label}</div>
          <div className="text-[#fff] opacity-75" style={{ fontSize: Math.max(5, width * 0.055) }}>{page.productCount} produits</div>
        </div>
      </div>
    )
  }
  const [C, nominalR] = GRID_DIMS[page.grid]
  const R = page.rows ?? nominalR // pages étirées (« N produits/page » + grandes cartes)
  return (
    <div className="w-full h-full flex flex-col" style={{ background: theme.pageBg }}>
      {/* Taxonomie au bord extérieur, comme sur la vraie page (verso = gauche, recto = droite). */}
      <div className={`shrink-0 flex items-center overflow-hidden ${page.pageNumber % 2 === 1 ? 'justify-end' : ''}`}
        style={{ background: color, height: Math.max(6, width * 0.07), paddingInline: pad }}>
        <span className="text-[#fff] font-semibold truncate" style={{ fontSize: Math.max(5, width * 0.05) }}>{page.breadcrumb.join(' › ')}</span>
      </div>
      <div className="flex-1 grid min-h-0" style={{ gridTemplateColumns: `repeat(${C}, 1fr)`, gridTemplateRows: `repeat(${R}, 1fr)`, gap: 2, padding: pad }}>
        {page.slots.map((s) => (
          <div key={s.rowId} className="rounded-[2px] flex items-center justify-center"
            style={{
              gridColumn: `${s.col} / span ${s.colSpan}`, gridRow: `${s.row} / span ${s.rowSpan}`,
              background: s.featured ? theme.accent : `${theme.ink}14`,
              border: `1px solid ${s.featured ? theme.accent : `${theme.ink}22`}`,
            }}>
            {s.featured && <Star className="text-[#fff]" style={{ width: width * 0.09, height: width * 0.09 }} fill="currentColor" />}
          </div>
        ))}
      </div>
    </div>
  )
}

export function FlatplanThumb({ page, ctx, color, width, dimmed, onOpen }: Props) {
  const height = width * (ctx.format.heightMm / ctx.format.widthMm)
  const nbFiches = page.kind === 'products' ? page.slots.length : null
  return (
    <button onClick={onOpen} title={`Page ${page.pageNumber} — cliquer pour agrandir`}
      className={`group text-left transition-opacity ${dimmed ? 'opacity-25' : ''}`}>
      <div className="rounded-sm overflow-hidden border border-border shadow-sm group-hover:ring-2 group-hover:ring-indigo-500" style={{ width, height }}>
        <ThumbBody page={page} ctx={ctx} color={color} width={width} />
      </div>
      <div className="flex items-center gap-1 mt-1 min-w-0" style={{ width }}>
        <span className="text-[10px] font-semibold text-white tabular-nums shrink-0">{page.pageNumber}</span>
        <span className="text-[10px] text-muted-foreground truncate">
          {nbFiches != null ? `${nbFiches} fiche${nbFiches > 1 ? 's' : ''} · ${page.kind === 'products' ? `grille ${page.grid}` : ''}` : KIND_LABELS[page.kind]}
        </span>
      </div>
    </button>
  )
}
