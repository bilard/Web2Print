// Pagination de la liste. Dans l'en-tête FIXE, pas en pied de liste : sur 3 000 fiches,
// un bouton « afficher plus » en bas oblige à scroller pour changer de page et empile
// les lignes en mémoire. Ici on remplace la fenêtre affichée, taille au choix.
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useTranslation, intlLocale } from '@/lib/i18n'

export const PAGE_SIZES = [40, 100, 250, 500] as const

const navBtn = 'p-1 rounded text-white/45 hover:text-white hover:bg-white/[0.08] disabled:opacity-25 disabled:hover:bg-transparent disabled:cursor-not-allowed transition-colors'

export function ExplorerPager({ total, page, pageSize, onPage, onPageSize }: {
  total: number
  /** Page courante, base 0. */
  page: number
  pageSize: number
  onPage: (p: number) => void
  onPageSize: (n: number) => void
}) {
  const { t, locale } = useTranslation()
  const pages = Math.max(1, Math.ceil(total / pageSize))
  const from = total === 0 ? 0 : page * pageSize + 1
  const to = Math.min(total, (page + 1) * pageSize)
  const n = (v: number) => v.toLocaleString(intlLocale(locale))

  return (
    <div className="flex items-center gap-1.5 shrink-0">
      <span className="text-[11px] tabular-nums text-white/45">
        {t('pwx.pager.range', { from: n(from), to: n(to), total: n(total) })}
      </span>
      <select value={pageSize} onChange={(e) => { onPageSize(Number(e.target.value)); onPage(0) }}
        title={t('pwx.pager.size')}
        className="bg-well text-white/60 text-[11px] rounded px-1.5 py-1 border border-white/10 focus:outline-none focus:border-white/25">
        {PAGE_SIZES.map((s) => <option key={s} value={s}>{t('pwx.pager.perPage', { count: s })}</option>)}
      </select>
      <div className="flex items-center gap-0.5">
        <button type="button" className={navBtn} disabled={page === 0}
          onClick={() => onPage(page - 1)} title={t('pwx.pager.prev')}>
          <ChevronLeft className="w-4 h-4" />
        </button>
        <span className="text-[11px] tabular-nums text-white/60 min-w-[52px] text-center">
          {n(page + 1)} <span className="text-white/25">/ {n(pages)}</span>
        </span>
        <button type="button" className={navBtn} disabled={page + 1 >= pages}
          onClick={() => onPage(page + 1)} title={t('pwx.pager.next')}>
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
}
