// Tableau croisé : une dimension en ligne, une en colonne, une mesure dans les cellules.
// ⚠ Le débordement scrolle DANS la tuile (cf. TileFrame) : pas de conteneur défilant ni de
// hauteur forcée ici, l'en-tête `sticky` reste lisible pendant le défilement.
import { toPivot } from '../../engine/pivot'
import { formatMeasure } from '../../engine/formatValue'
import { biLabel } from '../biLabel'
import { intlLocale, useTranslation } from '@/lib/i18n'
import type { AggregateResult } from '../../engine/aggregate'

export function PivotTile({ result, columnDim, showTotals: showTotalsOption }: {
  result: AggregateResult
  columnDim?: string
  showTotals?: boolean
}) {
  const { t, locale } = useTranslation()
  const dims = result.columns.filter((c) => c.role === 'dimension')
  const measure = result.columns.find((c) => c.role === 'measure')
  // Deux dimensions sont nécessaires : sans elles, un croisement n'a pas de sens. On le DIT.
  if (dims.length < 2 || !measure) {
    return <p className="text-[11px] text-white/40">{t('bi.pivot.needsTwoDimensions')}</p>
  }
  // ⚠ Seules DEUX dimensions se croisent (ligne × colonne) : à 3 dimensions ou plus, les
  // suivantes sont ignorées ici et `toPivot` fusionne silencieusement les lignes qui
  // partagent la même paire (ligne, colonne) — dernière valeur gagnante. Un tableau croisé
  // n'admet que deux axes ; au-delà, il faudrait choisir explicitement (filtre ou 3e axe
  // dédié), hors périmètre de cette tâche.
  // ⚠ `dims.some(...)` seul ne suffit pas : `pivotColumn` pourrait désigner la PREMIÈRE
  // dimension (même axe en ligne et en colonne), et `rowCol` serait alors introuvable — le
  // composant tombait sur un `undefined.key`. On se replie sur la seconde dimension.
  const valid = columnDim && columnDim !== dims[0].key && dims.some((d) => d.key === columnDim)
  const colDim = valid ? columnDim : dims[1].key
  const rowCol = dims.find((d) => d.key !== colDim)!
  const p = toPivot(result, rowCol.key, colDim, measure.key)
  // ⚠⚠ Une mesure non agrégeable (complétude, médiane) ne se somme PAS entre groupes :
  // additionner des pourcentages afficherait « Total 312 % ». Aucun total alors — ni en
  // ligne, ni en colonne, ni général. `showTotals: false` les retire aussi explicitement.
  const showTotals = measure.aggregable !== false && showTotalsOption !== false
  const fmt = (v: number | null) => formatMeasure(v, measure.format, intlLocale(locale))
  const rowLabel = biLabel(rowCol, t)

  return (
    <table className="w-full text-[11px] tabular-nums">
      <thead className="sticky top-0 bg-surface">
        <tr className="text-white/40">
          <th className="text-left font-medium py-1 pr-3">{rowLabel}</th>
          {p.columns.map((c) => (
            <th key={String(c)} className="text-right font-medium py-1 pr-3 whitespace-nowrap">{c ?? '—'}</th>
          ))}
          {showTotals && (
            <th className="text-right font-semibold py-1 text-white/60">{t('bi.pivot.total')}</th>
          )}
        </tr>
      </thead>
      <tbody>
        {p.rows.map((r) => (
          <tr key={String(r.key)} className="border-t border-white/[0.04] hover:bg-white/[0.03]">
            <td className="py-1 pr-3 text-white/60">{r.key ?? '—'}</td>
            {r.cells.map((v, i) => (
              <td key={i} className="py-1 pr-3 text-right text-white/80">{fmt(v)}</td>
            ))}
            {showTotals && <td className="py-1 text-right font-semibold text-white">{fmt(r.total)}</td>}
          </tr>
        ))}
        {showTotals && (
          <tr className="border-t border-white/10">
            <td className="py-1 pr-3 font-semibold text-white/60">{t('bi.pivot.total')}</td>
            {p.columnTotals.map((v, i) => (
              <td key={i} className="py-1 pr-3 text-right font-semibold text-white/80">{fmt(v)}</td>
            ))}
            <td className="py-1 text-right font-semibold text-white">{fmt(p.grandTotal)}</td>
          </tr>
        )}
      </tbody>
    </table>
  )
}
