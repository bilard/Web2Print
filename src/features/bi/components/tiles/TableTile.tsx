// Table détaillée. ⚠ Le débordement scrolle DANS la tuile (cf. TileFrame) : la page ne
// défile jamais horizontalement. Pas de conteneur défilant ni de hauteur forcée ici — l'en-
// tête `sticky` reste lisible pendant que `TileFrame` fait défiler le corps.
import { formatMeasure } from '../../engine/formatValue'
import { biLabel } from '../biLabel'
import { intlLocale, useTranslation } from '@/lib/i18n'
import type { AggregateResult } from '../../engine/aggregate'

export function TableTile({ result }: { result: AggregateResult }) {
  const { t, locale } = useTranslation()
  const columnLabel = (c: (typeof result.columns)[number]) => biLabel(c, t)

  return (
    <table className="w-full text-[11px] tabular-nums">
      <thead className="sticky top-0 bg-surface">
        <tr className="text-white/40 text-left">
          {result.columns.map((c) => (
            <th key={c.key} className="font-medium py-1 pr-3 whitespace-nowrap">
              {columnLabel(c)}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {result.rows.map((r, i) => (
          <tr key={i} className="border-t border-white/[0.04] hover:bg-white/[0.03]">
            {result.columns.map((c) => (
              <td key={c.key} className={`py-1 pr-3 ${c.role === 'measure' ? 'text-white/80 text-right' : 'text-white/60'}`}>
                {c.role === 'measure'
                  ? formatMeasure(r[c.key] as number | null, c.format, intlLocale(locale))
                  : (r[c.key] ?? '—')}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  )
}
