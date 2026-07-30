// Page réelle en grand depuis le chemin de fer : rendu CatalogPageView à
// l'échelle, navigation ←/→, ouverture directe dans l'étape Aperçu.
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, ExternalLink, X } from 'lucide-react'
import type { CatalogPageDescriptor } from '../../catalogTypes'
import type { CatalogRenderCtx } from '../pages/catalogCss'
import { pagePx } from '../pages/catalogCss'
import { CatalogPageView } from '../pages/CatalogPageView'
import { t } from '@/lib/i18n'

interface Props {
  pages: CatalogPageDescriptor[]
  index: number
  ctx: CatalogRenderCtx
  onIndex: (i: number) => void
  onClose: () => void
  onOpenPreview: (i: number) => void
}

function pageInfo(page: CatalogPageDescriptor): string {
  switch (page.kind) {
    case 'cover': return 'Couverture'
    case 'toc': return `Sommaire · ${page.entries.length} entrées`
    case 'opener': return `Ouverture ${page.label} · ${page.productCount} produits`
    case 'products': return `${page.breadcrumb.join(' › ')} · ${page.slots.length} fiche${page.slots.length > 1 ? 's' : ''} · grille ${page.grid}${page.slots.some((s) => s.featured) ? ' · ★ vedette' : ''}`
    case 'back-cover': return '4e de couverture'
  }
}

export function FlatplanLightbox({ pages, index, ctx, onIndex, onClose, onOpenPreview }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [avail, setAvail] = useState({ w: 0, h: 0 })
  const page = pages[index]

  useLayoutEffect(() => {
    const el = containerRef.current
    if (!el) return
    const update = () => setAvail({ w: el.clientWidth, h: el.clientHeight })
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      else if (e.key === 'ArrowLeft') onIndex(Math.max(0, index - 1))
      else if (e.key === 'ArrowRight') onIndex(Math.min(pages.length - 1, index + 1))
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [index, pages.length, onClose, onIndex])

  if (!page) return null
  const { w, h } = pagePx(ctx.format)
  const k = avail.w > 0 && avail.h > 0 ? Math.min((avail.w - 32) / w, (avail.h - 32) / h, 1.5) : 0.5

  return (
    <div className="fixed inset-0 z-50 bg-black/80 flex flex-col" onClick={onClose}>
      <div className="flex items-center gap-3 px-4 py-2 shrink-0" onClick={(e) => e.stopPropagation()}>
        <span className="text-sm text-[#fff] font-semibold tabular-nums">Page {page.pageNumber} / {pages.length}</span>
        <span className="text-xs text-[#fff]/70 truncate">{pageInfo(page)}</span>
        <span className="flex-1" />
        <button onClick={() => onOpenPreview(index)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-indigo-600 hover:bg-indigo-500 text-[#fff] text-xs font-medium">
          <ExternalLink className="w-3.5 h-3.5" /> Ouvrir dans l'aperçu
        </button>
        <button onClick={onClose} className="p-1.5 rounded-md text-[#fff]/80 hover:bg-[#fff]/10" title={t('cat.close.esc')}>
          <X className="w-5 h-5" />
        </button>
      </div>
      <div ref={containerRef} className="flex-1 min-h-0 flex items-center justify-center relative">
        <button onClick={(e) => { e.stopPropagation(); onIndex(Math.max(0, index - 1)) }} disabled={index === 0}
          className="absolute left-3 p-2 rounded-full bg-[#fff]/10 text-[#fff] hover:bg-[#fff]/20 disabled:opacity-30" title={t('cat.page.prev')}>
          <ChevronLeft className="w-6 h-6" />
        </button>
        <div style={{ width: w * k, height: h * k, overflow: 'hidden' }} onClick={(e) => e.stopPropagation()} className="shadow-2xl">
          <div style={{ width: w, height: h, transform: `scale(${k})`, transformOrigin: 'top left' }}>
            <CatalogPageView page={page} ctx={ctx} />
          </div>
        </div>
        <button onClick={(e) => { e.stopPropagation(); onIndex(Math.min(pages.length - 1, index + 1)) }} disabled={index === pages.length - 1}
          className="absolute right-3 p-2 rounded-full bg-[#fff]/10 text-[#fff] hover:bg-[#fff]/20 disabled:opacity-30" title="Page suivante">
          <ChevronRight className="w-6 h-6" />
        </button>
      </div>
    </div>
  )
}
