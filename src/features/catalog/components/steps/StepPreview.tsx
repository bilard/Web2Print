// src/features/catalog/components/steps/StepPreview.tsx
// Étape 4 du wizard « Catalogue studio » : aperçu page à page de la pagination live.
// Une seule page montée à la fois (perf sur 100+ pages) ; rail de vignettes LÉGÈRES
// (libellé seul, pas de CatalogPageView par vignette).
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { ArrowRight, ChevronLeft, ChevronRight } from 'lucide-react'
import { useCatalogStore } from '@/stores/catalog.store'
import { useCatalogPages } from '../../useCatalogPages'
import { CatalogPageView } from '../pages/CatalogPageView'
import { pagePx } from '../pages/catalogCss'
import type { CatalogPageDescriptor } from '../../catalogTypes'

function pageLabel(p: CatalogPageDescriptor): string {
  switch (p.kind) {
    case 'cover': return 'Couverture'
    case 'toc': return 'Sommaire'
    case 'opener': return `Ouverture ${p.label}`
    case 'products': return `Produits ${p.breadcrumb[p.breadcrumb.length - 1] ?? ''}`
    case 'back-cover': return '4e de couverture'
  }
}

export function StepPreview() {
  const setStep = useCatalogStore((s) => s.setStep)
  const { pages, ctx } = useCatalogPages()
  const [index, setIndex] = useState(0)
  const containerRef = useRef<HTMLDivElement>(null)
  const [avail, setAvail] = useState({ w: 0, h: 0 })

  const clampedIndex = pages.length === 0 ? 0 : Math.min(index, pages.length - 1)

  useEffect(() => {
    if (index > pages.length - 1) setIndex(Math.max(0, pages.length - 1))
  }, [pages.length, index])

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
      const target = e.target
      if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) return
      if (e.key === 'ArrowLeft') setIndex((i) => Math.max(0, i - 1))
      else if (e.key === 'ArrowRight') setIndex((i) => Math.min(pages.length - 1, i + 1))
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [pages.length])

  if (pages.length === 0 || !ctx) {
    return <div className="h-full flex items-center justify-center text-sm text-muted-foreground">Aucune page à prévisualiser — vérifiez la sélection et la structure.</div>
  }

  const currentPage = pages[clampedIndex]
  const { w, h } = pagePx(ctx.format)
  const k = avail.w > 0 && avail.h > 0 ? Math.min(avail.w / w, avail.h / h, 1) : 1

  return (
    <div className="h-full flex">
      <aside className="w-56 shrink-0 border-r border-border bg-surface overflow-y-auto p-2 space-y-1">
        {pages.map((p, i) => (
          <button
            key={i}
            onClick={() => setIndex(i)}
            className={`w-full text-left px-3 py-1.5 rounded-md text-xs truncate ${i === clampedIndex ? 'bg-indigo-600 text-[#fff]' : 'text-muted-foreground hover:bg-surface-2 hover:text-white'}`}
          >
            {p.pageNumber} · {pageLabel(p)}
          </button>
        ))}
      </aside>
      <div className="flex-1 min-w-0 flex flex-col">
        <div className="flex items-center justify-between px-4 py-2 border-b border-border shrink-0">
          <div className="flex items-center gap-2">
            <button onClick={() => setIndex((i) => Math.max(0, i - 1))} disabled={clampedIndex === 0}
              className="p-1.5 rounded-md hover:bg-surface-2 disabled:opacity-40 disabled:hover:bg-transparent" title="Page précédente">
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="text-xs text-muted-foreground tabular-nums">page {clampedIndex + 1} / {pages.length}</span>
            <button onClick={() => setIndex((i) => Math.min(pages.length - 1, i + 1))} disabled={clampedIndex === pages.length - 1}
              className="p-1.5 rounded-md hover:bg-surface-2 disabled:opacity-40 disabled:hover:bg-transparent" title="Page suivante">
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
          <button onClick={() => setStep('export')}
            className="flex items-center gap-2 px-4 py-2 rounded-md bg-indigo-600 hover:bg-indigo-500 text-[#fff] text-sm font-medium">
            Continuer → Export <ArrowRight className="w-4 h-4" />
          </button>
        </div>
        <div ref={containerRef} className="flex-1 min-h-0 overflow-hidden flex items-center justify-center bg-well">
          <div style={{ width: w * k, height: h * k, overflow: 'hidden' }}>
            <div style={{ width: w, height: h, transform: `scale(${k})`, transformOrigin: 'top left' }}>
              <CatalogPageView page={currentPage} ctx={ctx} />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
