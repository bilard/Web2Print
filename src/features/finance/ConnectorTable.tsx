// Tableau dense des coûts par connecteur (mois courant) : volume, coût €, budget, restant.
import type { CostRow } from './costModel'
import { eur } from './costModel'

const GROUP_HEX: Record<string, string> = { LLM: '#818cf8', Scraping: '#fbbf24', Image: '#34d399' }

export function ConnectorTable({ rows }: { rows: CostRow[] }) {
  return (
    <div className="bg-surface rounded-lg p-4">
      <div className="text-sm font-semibold text-white mb-3">Coûts par connecteur — ce mois</div>
      {rows.length === 0 ? (
        <div className="text-white/40 text-sm py-8 text-center">Aucune consommation enregistrée ce mois-ci.</div>
      ) : (
        <table className="w-full text-xs tabular-nums">
          <thead>
            <tr className="text-white/40 text-[10px] uppercase tracking-wide text-right">
              <th className="text-left font-medium pb-2">Connecteur</th>
              <th className="font-medium pb-2">Volume</th>
              <th className="font-medium pb-2">Coût</th>
              <th className="font-medium pb-2">Budget</th>
              <th className="font-medium pb-2 w-[26%]">Restant</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const used = r.budgetUsd ? Math.min(100, (r.costUsd / r.budgetUsd) * 100) : 0
              const over = r.budgetUsd != null && r.costUsd >= r.budgetUsd
              const warn = r.budgetUsd != null && used >= 80 && !over
              return (
                <tr key={r.key} className="border-t border-white/5 text-right">
                  <td className="text-left py-1.5">
                    <span className="inline-block w-1.5 h-1.5 rounded-full mr-2 align-middle" style={{ backgroundColor: GROUP_HEX[r.group] }} />
                    <span className="text-white/85">{r.label}</span>
                    <span className="text-white/30 text-[10px] ml-1.5">{r.group}</span>
                  </td>
                  <td className="text-white/55 whitespace-nowrap">{r.volume}</td>
                  <td className="text-white/85 font-medium">{eur(r.costUsd)}</td>
                  <td className="text-white/50">{r.budgetUsd != null ? eur(r.budgetUsd) : '—'}</td>
                  <td className="pl-2">
                    {r.remainingUsd == null ? (
                      <span className="text-white/30">—</span>
                    ) : (
                      <div className="flex items-center gap-2 justify-end">
                        <span className={over ? 'text-rose-400' : warn ? 'text-amber-400' : 'text-emerald-400'}>{eur(r.remainingUsd)}</span>
                        <div className="flex-1 max-w-[80px] h-1.5 rounded-sm bg-well overflow-hidden">
                          <div className={`h-full rounded-sm ${over ? 'bg-rose-400' : warn ? 'bg-amber-400' : 'bg-emerald-400/80'}`} style={{ width: `${used}%` }} />
                        </div>
                      </div>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}
    </div>
  )
}
