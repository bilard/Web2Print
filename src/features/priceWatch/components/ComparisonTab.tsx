// src/features/priceWatch/components/ComparisonTab.tsx
import { useTrackedProducts, useCompetitorSites, usePriceMatches, usePriceWatchMutations } from '../usePriceWatch'

const btnSecondaryCls = 'text-xs bg-white/10 hover:bg-white/15 text-white px-2 py-1 rounded transition-colors'
const btnGhostCls = 'text-xs text-white/40 hover:text-white/70 px-2 py-1 rounded transition-colors'

export function ComparisonTab() {
  const products = useTrackedProducts()
  const sites = useCompetitorSites()
  const matches = usePriceMatches()
  const { setMatchStatus } = usePriceWatchMutations()

  const byKey = new Map(matches.map((m) => [`${m.productId}__${m.siteId}`, m]))
  const pending = matches.filter((m) => m.status === 'pending')

  return (
    <div className="space-y-6">
      {pending.length > 0 && (
        <section>
          <h3 className="mb-2 text-sm font-semibold text-white">
            À confirmer ({pending.length})
          </h3>
          <ul className="divide-y divide-white/10 rounded-md bg-surface">
            {pending.map((m) => {
              const p = products.find((x) => x.id === m.productId)
              const s = sites.find((x) => x.id === m.siteId)
              return (
                <li key={`${m.productId}__${m.siteId}`} className="flex items-center justify-between px-3 py-2 text-sm gap-3">
                  <a
                    href={m.url}
                    target="_blank"
                    rel="noreferrer"
                    className="truncate text-white/80 underline hover:text-white"
                  >
                    {p?.name} @ {s?.domain} ({Math.round(m.confidence * 100)}%)
                  </a>
                  <span className="flex gap-2 shrink-0">
                    <button
                      type="button"
                      className={btnSecondaryCls}
                      onClick={() => setMatchStatus(m.productId, m.siteId, 'confirmed')}
                    >
                      Confirmer
                    </button>
                    <button
                      type="button"
                      className={btnGhostCls}
                      onClick={() => setMatchStatus(m.productId, m.siteId, 'rejected')}
                    >
                      Rejeter
                    </button>
                  </span>
                </li>
              )
            })}
          </ul>
        </section>
      )}
      <section>
        <h3 className="mb-2 text-sm font-semibold text-white">Comparatif</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-white/50">
                <th className="py-1 pr-4">Produit</th>
                <th className="pr-4">Mon prix</th>
                {sites.map((s) => (
                  <th key={s.id} className="pr-4">{s.domain}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {products.map((p) => (
                <tr key={p.id} className="border-t border-white/10">
                  <td className="py-1 pr-4 text-white/80">{p.name}</td>
                  <td className="pr-4 text-white/70">
                    {p.myPrice != null ? `${p.myPrice} €` : '—'}
                  </td>
                  {sites.map((s) => {
                    const m = byKey.get(`${p.id}__${s.id}`)
                    const cheaper = m?.lastPrice != null && p.myPrice != null && m.lastPrice < p.myPrice
                    return (
                      <td key={s.id} className={`pr-4 ${cheaper ? 'text-red-400' : 'text-white/70'}`}>
                        {m?.lastPrice != null ? `${m.lastPrice} €` : '—'}
                      </td>
                    )
                  })}
                </tr>
              ))}
              {products.length === 0 && (
                <tr>
                  <td colSpan={2 + sites.length} className="py-6 text-center text-white/50">
                    Aucun produit à comparer.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}
