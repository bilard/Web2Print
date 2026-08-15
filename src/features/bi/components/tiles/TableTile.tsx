// Table détaillée, avec des BARRES derrière les chiffres.
//
// ⚠ Le débordement scrolle DANS la tuile (cf. TileFrame) : la page ne défile jamais
// horizontalement. Pas de conteneur défilant ni de hauteur forcée ici — l'en-tête `sticky`
// reste lisible pendant que `TileFrame` fait défiler le corps.
//
// ⚠⚠ L'en-tête `sticky` DOIT être opaque et posé au-dessus : sur fond translucide, les
// premières lignes défilaient à travers lui et deux textes se superposaient — relevé à
// l'écran sur « Couverture et qualité, par concurrent ».
//
// ⚠⚠ La barre est un DÉCOR de lecture, jamais une donnée : elle se dessine derrière le
// chiffre, qui reste la seule valeur affichée. Un lecteur doit pouvoir ignorer la barre sans
// rien perdre.
import { useMemo } from 'react'
import { formatMeasure } from '../../engine/formatValue'
import { usefulColumns, barScale, barGeometry } from '../../engine/tableView'
import { barColor } from '../fieldColors'
import { biLabel } from '../biLabel'
import { intlLocale, useTranslation } from '@/lib/i18n'
import type { AggregateResult } from '../../engine/aggregate'

// ⚠ Pas d'`accent` ici : la teinte des barres vient de l'UNITÉ de chaque colonne, pas de
// l'identité de la tuile — une même grandeur se reconnaît d'une tuile à l'autre.
export function TableTile({ result }: { result: AggregateResult }) {
  const { t, locale } = useTranslation()

  // Colonnes réellement porteuses, et l'échelle de chacune : calculées une fois par
  // résultat, pas à chaque cellule.
  const { columns, scales } = useMemo(() => {
    const cols = usefulColumns(result.columns, result.rows)
    const s = new Map(cols
      .filter((c) => c.role === 'measure')
      .map((c) => [c.key, barScale(result.rows, c.key)]))
    return { columns: cols, scales: s }
  }, [result])

  return (
    <table className="w-full text-[11px] tabular-nums border-separate border-spacing-0">
      <thead className="sticky top-0 z-10 bg-surface">
        <tr className="text-white/40 text-left">
          {columns.map((c) => (
            <th key={c.key}
              className={`font-medium py-1.5 pr-3 whitespace-nowrap bg-surface border-b border-white/[0.08] ${
                c.role === 'measure' ? 'text-right' : ''
              }`}>
              {biLabel(c, t)}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {result.rows.map((row, i) => (
          <tr key={i} className="hover:bg-white/[0.03]">
            {columns.map((c) => {
              const raw = row[c.key]
              if (c.role !== 'measure') {
                return (
                  <td key={c.key} className="py-1 pr-3 text-white/60 border-t border-white/[0.04] max-w-[240px] truncate"
                    title={raw == null ? undefined : String(raw)}>
                    {raw ?? '—'}
                  </td>
                )
              }
              const scale = scales.get(c.key) ?? null
              const bar = typeof raw === 'number' && scale ? barGeometry(raw, scale) : null
              return (
                <td key={c.key} className="relative py-1 pr-3 text-right text-white/85 border-t border-white/[0.04]">
                  {bar && bar.width > 0 && (
                    <span aria-hidden="true"
                      className="absolute inset-y-[3px] rounded-sm pointer-events-none"
                      style={{
                        left: `${bar.left}%`, width: `${bar.width}%`,
                        // ⚠⚠ La teinte dit l'UNITÉ mesurée et le SIGNE — jamais si c'est bien
                        // ou mal : un décompte de ruptures est bon pour l'acheteur et mauvais
                        // pour le vendeur, et le module ne sait pas de quel côté on est.
                        background: `${barColor(c.format, bar.negative)}${bar.negative ? '33' : '3d'}`,
                      }} />
                  )}
                  <span className="relative">
                    {formatMeasure(raw as number | null, c.format, intlLocale(locale))}
                  </span>
                </td>
              )
            })}
          </tr>
        ))}
      </tbody>
    </table>
  )
}
