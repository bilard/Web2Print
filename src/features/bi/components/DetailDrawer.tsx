// Le détail derrière un chiffre : les lignes qui le composent, telles que le moteur les
// retient.
//
// ⚠⚠ Le tiroir DIT toujours deux choses que rien d'autre à l'écran ne dit : les filtres qui
// s'appliquaient au moment du clic, et le décompte RÉEL quand l'échantillon est plafonné.
// Sans elles, on lit un extrait comme s'il était le tout.
import { useMemo } from 'react'
import { X, Download } from 'lucide-react'
import { useTranslation } from '@/lib/i18n'
import { biLabel } from './biLabel'
import { barScale, barGeometry } from '../engine/tableView'
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
  // Échelle par colonne : les colonnes numériques du détail se lisent aussi d'un coup d'œil.
  // ⚠ Calculée sur les lignes MONTRÉES — l'échantillon est plafonné, et une échelle tirée
  // d'ailleurs ferait des barres sans rapport avec ce qui est sous les yeux.
  const scales = useMemo(
    () => new Map(detail.columns.map((c) => [c.key, barScale(detail.rows, c.key)])),
    [detail])

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
          {detail.total === 0
            ? <p className="p-6 text-[12px] text-white/40">{t('bi.detail.empty')}</p>
            : (
              <table className="w-full text-[11px] tabular-nums">
                <thead className="sticky top-0 bg-surface-2 z-10">
                  <tr>
                    {detail.columns.map((c) => (
                      <th key={c.key} className="text-left font-medium text-white/45 px-3 py-2 whitespace-nowrap">
                        {biLabel(c, t)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {detail.rows.map((r, i) => (
                    <tr key={i} className="border-t border-white/[0.04] hover:bg-white/[0.03]">
                      {detail.columns.map((c) => {
                        const v = r[c.key]
                        const scale = scales.get(c.key) ?? null
                        const bar = typeof v === 'number' && scale ? barGeometry(v, scale) : null
                        return (
                          <td key={c.key}
                            className={`relative px-3 py-1.5 text-white/80 max-w-[280px] truncate ${
                              typeof v === 'number' ? 'text-right tabular-nums' : ''
                            }`}
                            title={v == null ? undefined : String(v)}>
                            {bar && bar.width > 0 && (
                              <span aria-hidden="true"
                                className="absolute inset-y-[3px] rounded-sm pointer-events-none"
                                style={{
                                  left: `${bar.left}%`, width: `${bar.width}%`,
                                  background: `#6366f1${bar.negative ? '26' : '3d'}`,
                                }} />
                            )}
                            {/* ⚠ Une valeur absente reste un TIRET : « 0 » se lirait comme une mesure. */}
                            <span className="relative">{v == null ? '—' : String(v)}</span>
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
        </div>
      </aside>
    </div>
  )
}
