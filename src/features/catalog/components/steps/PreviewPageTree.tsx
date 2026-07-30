// Rail de l'aperçu en ARBRE : couverture/sommaire/4e à la racine, chaque univers
// (ouverture) repliable avec ses pages produits en dessous (famille + nb fiches,
// ★ si la page porte une vedette).
import { useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import type { CatalogPageDescriptor } from '../../catalogTypes'
import { t } from '@/lib/i18n'

interface Props {
  pages: CatalogPageDescriptor[]
  current: number
  onSelect: (index: number) => void
}

type Entry =
  | { kind: 'root'; idx: number }
  | { kind: 'univers'; openerIdx: number; children: number[] }

function buildEntries(pages: CatalogPageDescriptor[]): Entry[] {
  const entries: Entry[] = []
  pages.forEach((p, i) => {
    if (p.kind === 'opener') entries.push({ kind: 'univers', openerIdx: i, children: [] })
    else if (p.kind === 'products') {
      const last = entries[entries.length - 1]
      if (last?.kind === 'univers') last.children.push(i)
      else entries.push({ kind: 'root', idx: i })
    } else entries.push({ kind: 'root', idx: i })
  })
  return entries
}

function rootLabel(p: CatalogPageDescriptor): string {
  switch (p.kind) {
    case 'cover': return t('cat.page.kind.cover')
    case 'toc': return t('cat.page.kind.toc')
    case 'back-cover': return t('cat.page.kind.backCover')
    case 'opener': return t('cat.rail.opener', { label: p.label })
    case 'products': return t('cat.rail.products')
  }
}

export function PreviewPageTree({ pages, current, onSelect }: Props) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const entries = buildEntries(pages)

  const pageBtn = (idx: number, label: string, opts?: { indent?: boolean; strong?: boolean; star?: boolean }) => {
    const active = idx === current
    return (
      <button key={idx} onClick={() => onSelect(idx)}
        className={`w-full flex items-baseline gap-1.5 text-left px-2 py-1.5 rounded-md text-xs min-w-0 ${
          active ? 'bg-indigo-600 text-[#fff]'
            : opts?.strong ? 'text-white hover:bg-surface-2'
            : 'text-muted-foreground hover:bg-surface-2 hover:text-white'
        } ${opts?.strong ? 'font-semibold' : ''}`}>
        <span className={`shrink-0 tabular-nums ${active ? '' : 'opacity-50'}`}>{pages[idx].pageNumber}</span>
        <span className="truncate">{label}</span>
        {opts?.star && <span className={`shrink-0 ${active ? '' : 'text-indigo-400'}`}>★</span>}
      </button>
    )
  }

  return (
    <div className="p-2 space-y-0.5">
      {entries.map((e) => {
        if (e.kind === 'root') return pageBtn(e.idx, rootLabel(pages[e.idx]))
        const opener = pages[e.openerIdx]
        if (opener.kind !== 'opener') return null
        const isCollapsed = collapsed.has(opener.nodeId)
        return (
          <div key={opener.nodeId} className="pt-1">
            <div className="flex items-center gap-0.5">
              <button
                onClick={() => setCollapsed((s) => {
                  const next = new Set(s)
                  if (next.has(opener.nodeId)) next.delete(opener.nodeId)
                  else next.add(opener.nodeId)
                  return next
                })}
                title={t(isCollapsed ? 'ui.expand' : 'ui.collapse')}
                className="p-0.5 rounded text-muted-foreground hover:text-white shrink-0">
                {isCollapsed ? <ChevronRight className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
              </button>
              <div className="flex-1 min-w-0">
                {pageBtn(e.openerIdx, t('cat.rail.pages', { label: opener.label, count: e.children.length }), { strong: true })}
              </div>
            </div>
            {!isCollapsed && (
              <div className="ml-4 border-l border-border pl-1.5 space-y-0.5">
                {e.children.map((idx) => {
                  const p = pages[idx]
                  if (p.kind !== 'products') return null
                  const famille = p.breadcrumb[p.breadcrumb.length - 1] ?? opener.label
                  // ⚠️ Deux clés, jamais un « s » recollé : la règle de pluriel du
                  // français ne survit pas à la traduction (cf. i18n.test.ts).
                  return pageBtn(idx, p.slots.length > 1
                    ? t('cat.rail.cards.many', { label: famille, count: p.slots.length })
                    : t('cat.rail.cards.one', { label: famille, count: p.slots.length }),
                    { star: p.slots.some((s) => s.featured) })
                })}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
