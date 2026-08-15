// Les LIGNES d'une source, telles quelles. Partagé par le tiroir de détail d'une tuile et
// par la vue « Données » du rail.
//
// ⚠ Un seul rendu pour les deux : deux tables écrites séparément finiraient par diverger sur
// une valeur absente, un accord ou une barre — et l'on douterait de savoir laquelle dit vrai.
import { useMemo } from 'react'
import { useTranslation } from '@/lib/i18n'
import { biLabel } from './biLabel'
import { barScale, barGeometry } from '../engine/tableView'
import { barColor } from './fieldColors'
import type { UnderlyingRows } from '../engine/underlyingRows'

export function BiRowsTable({ detail }: { detail: UnderlyingRows }) {
  const { t } = useTranslation()
  // ⚠ Échelle calculée sur les lignes MONTRÉES : l'échantillon est plafonné, et une échelle
  // tirée d'ailleurs ferait des barres sans rapport avec ce qui est sous les yeux.
  const scales = useMemo(
    () => new Map(detail.columns.map((c) => [c.key, barScale(detail.rows, c.key)])),
    [detail])

  if (detail.total === 0) {
    return <p className="p-6 text-[12px] text-white/40">{t('bi.detail.empty')}</p>
  }

  return (
    /* ⚠ `min-w-full` et non `w-full` : à quinze colonnes, `w-full` les COMPRIME jusqu'à
       l'illisible au lieu de laisser le cadre défiler. */
    <table className="min-w-full text-[11px] tabular-nums">
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
                        background: `${barColor(c.format, bar.negative)}${bar.negative ? '33' : '3d'}`,
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
  )
}
