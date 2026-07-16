import type { FieldStat } from './insightsAggregate'
import type { CompareStatus } from '../types'
import { STATUS_ORDER, STATUS_UI } from './insightsStatus'

interface Props {
  fields: FieldStat[]
}

const GROUP_LABEL: Record<FieldStat['group'], string> = {
  identity: 'Identité', price: 'Prix', spec: 'Spécification', content: 'Contenu',
}

/** Barre empilée compacte de la répartition des statuts d'un champ. */
function MiniStack({ counts, total }: { counts: FieldStat['counts']; total: number }) {
  return (
    <div className="flex h-2.5 w-40 rounded-full overflow-hidden bg-white/[0.06]">
      {STATUS_ORDER.map((s: CompareStatus) =>
        counts[s] > 0 ? (
          <div key={s} title={`${STATUS_UI[s].label} : ${counts[s]}`}
            style={{ width: `${(counts[s] / total) * 100}%`, backgroundColor: STATUS_UI[s].hex }} />
        ) : null,
      )}
    </div>
  )
}

/** Tableau par champ : où se concentrent les écarts, trié par taux de divergence
 *  puis par nombre de divergences. */
export function InsightsFieldTable({ fields }: Props) {
  const sorted = [...fields].sort(
    (a, b) => b.divergenceRate - a.divergenceRate || b.counts.diff - a.counts.diff,
  )
  return (
    <div className="bg-surface border border-white/10 rounded-xl overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-white/45 border-b border-white/10">
              <th className="px-4 py-2.5 font-medium">Champ</th>
              <th className="px-3 py-2.5 font-medium">Groupe</th>
              <th className="px-3 py-2.5 font-medium">Répartition</th>
              <th className="px-3 py-2.5 font-medium text-center">Diverg.</th>
              <th className="px-3 py-2.5 font-medium text-center">Apport</th>
              <th className="px-3 py-2.5 font-medium text-center">Taux d'écart</th>
              <th className="px-3 py-2.5 font-medium text-center">Adoptés</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((f) => (
              <tr key={f.id} className="border-b border-white/[0.06] hover:bg-white/[0.03]">
                <td className="px-4 py-2.5 font-medium max-w-[18rem] truncate">{f.label}</td>
                <td className="px-3 py-2.5 text-xs text-white/50">{GROUP_LABEL[f.group]}</td>
                <td className="px-3 py-2.5"><MiniStack counts={f.counts} total={f.total} /></td>
                <td className="px-3 py-2.5 text-center tabular-nums text-amber-400">{f.counts.diff || '—'}</td>
                <td className="px-3 py-2.5 text-center tabular-nums text-indigo-300">{f.counts['mfr-only'] || '—'}</td>
                <td className="px-3 py-2.5 text-center tabular-nums font-semibold">
                  {f.counts.match + f.counts.diff > 0 ? `${Math.round(f.divergenceRate * 100)}%` : '—'}
                </td>
                <td className="px-3 py-2.5 text-center tabular-nums text-teal-400">{f.adopted || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
