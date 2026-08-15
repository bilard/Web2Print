// Le détail derrière un chiffre : les lignes qui le composent, telles que le moteur les
// retient.
//
// ⚠⚠ Le tiroir DIT toujours deux choses que rien d'autre à l'écran ne dit : les filtres qui
// s'appliquaient au moment du clic, et le décompte RÉEL quand l'échantillon est plafonné.
// Sans elles, on lit un extrait comme s'il était le tout.
import { X, Download } from 'lucide-react'
import { useTranslation } from '@/lib/i18n'
import { BiRowsTable } from './BiRowsTable'
import type { UnderlyingRows } from '../engine/underlyingRows'

export function DetailDrawer({ title, detail, filters, onClose, onExport }: {
  title: string
  detail: UnderlyingRows
  /** Filtres actifs, DÉJÀ décrits en clair (cf. `describeFilter`). */
  filters: string[]
  onClose: () => void
  onExport: () => void
}) {
  const { t } = useTranslation()
  return (
    <div className="fixed inset-0 z-[60] flex justify-end" role="dialog" aria-modal="true">
      <button type="button" aria-label={t('bi.detail.close')} onClick={onClose}
        className="absolute inset-0 bg-black/50" />
      <aside className="relative w-full max-w-3xl h-full bg-surface border-l border-white/10 flex flex-col shadow-2xl">
        <header className="flex items-start gap-3 px-4 py-3 border-b border-white/[0.06] shrink-0">
          <div className="flex-1 min-w-0">
            <h2 className="text-[13px] font-semibold text-white truncate">
              {t('bi.detail.title', { title })}
            </h2>
            <p className="text-[11px] text-white/45 mt-0.5 tabular-nums">
              {detail.truncated
                ? t('bi.detail.count', { shown: detail.rows.length, total: detail.total })
                : t('bi.detail.total', { total: detail.total })}
            </p>
          </div>
          <button type="button" onClick={onExport} disabled={detail.total === 0}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded text-[11px] text-white/70
              hover:text-white hover:bg-white/[0.06] disabled:opacity-40 disabled:hover:bg-transparent">
            <Download className="w-3.5 h-3.5" />{t('bi.detail.export')}
          </button>
          <button type="button" onClick={onClose} aria-label={t('bi.detail.close')}
            className="p-1.5 rounded text-white/50 hover:text-white hover:bg-white/[0.06]">
            <X className="w-4 h-4" />
          </button>
        </header>

        {/* ⚠ Les filtres VOYAGENT avec le détail : un extrait sans ses filtres se lit comme
            le tout, et le chiffre part faux dès qu'on le recopie ailleurs. */}
        <div className="px-4 py-2 border-b border-white/[0.05] shrink-0 flex flex-wrap gap-1.5 items-center">
          <span className="text-[10px] uppercase tracking-wide text-white/35">{t('bi.detail.filters')}</span>
          {filters.length === 0
            ? <span className="text-[11px] text-white/40">{t('bi.detail.noFilters')}</span>
            : filters.map((f) => (
              <span key={f} className="text-[11px] px-2 py-0.5 rounded bg-white/[0.06] text-white/70">{f}</span>
            ))}
        </div>

        <div className="flex-1 min-h-0 overflow-auto">
          <BiRowsTable detail={detail} />
        </div>
      </aside>
    </div>
  )
}
