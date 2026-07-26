// Tableau de bord lecture-seule : tout est dérivé des docs `matches` (produits
// et sites sont configurés dans le flux, pas persistés ici). Affiche la file
// « à confirmer » + la matrice comparative produit × site.
import { usePriceMatches, usePriceWatchMutations } from '../usePriceWatch'
import type { PriceMatch } from '../types'

const btnSecondaryCls = 'text-xs bg-white/10 hover:bg-white/15 text-white px-2 py-1 rounded transition-colors'
const btnGhostCls = 'text-xs text-white/40 hover:text-white/70 px-2 py-1 rounded transition-colors'

function distinct<T>(items: T[], key: (t: T) => string): T[] {
  const seen = new Set<string>()
  return items.filter((t) => {
    const k = key(t)
    if (seen.has(k)) return false
    seen.add(k)
    return true
  })
}

export function ComparisonTab() {
  const matches = usePriceMatches()
  const { setMatchStatus } = usePriceWatchMutations()

  const byKey = new Map(matches.map((m) => [`${m.productId}__${m.siteId}`, m]))
  const pending = matches.filter((m) => m.status === 'pending')
  // Produits et sites dérivés des matchs (champs dénormalisés productName/domain/myPrice).
  const products = distinct(matches, (m) => m.productId).map((m) => ({
    id: m.productId, name: m.productName ?? m.productId, myPrice: m.myPrice ?? null,
  }))
  const sites = distinct(matches, (m) => m.siteId).map((m) => ({ id: m.siteId, domain: m.domain ?? m.siteId }))

  const label = (m: PriceMatch) => `${m.productName ?? m.productId} @ ${m.domain ?? m.siteId} (${Math.round((m.confidence ?? 0) * 100)}%)`

  return (
    <div className="space-y-6">
      {pending.length > 0 && (
        <section data-pw-section="pending">
          <h3 className="mb-2 text-sm font-semibold text-white">À confirmer ({pending.length})</h3>
          <ul className="divide-y divide-white/10 rounded-md bg-surface">
            {pending.map((m) => (
              <li key={`${m.productId}__${m.siteId}`} className="flex items-center justify-between px-3 py-2 text-sm gap-3">
                <a href={m.url} target="_blank" rel="noreferrer" className="truncate text-white/80 underline hover:text-white">
                  {label(m)}
                </a>
                <span className="flex gap-2 shrink-0">
                  <button type="button" className={btnSecondaryCls} onClick={() => setMatchStatus(m.productId, m.siteId, 'confirmed')}>
                    Confirmer
                  </button>
                  <button type="button" className={btnGhostCls} onClick={() => setMatchStatus(m.productId, m.siteId, 'rejected')}>
                    Rejeter
                  </button>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
      <section data-pw-section="comparison">
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
                  <td className="pr-4 text-white/70">{p.myPrice != null ? `${p.myPrice} €` : '—'}</td>
                  {sites.map((s) => {
                    const m = byKey.get(`${p.id}__${s.id}`)
                    const cheaper = m?.lastPrice != null && p.myPrice != null && m.lastPrice < p.myPrice
                    // Identité relevée chez le concurrent : visible au survol pour
                    // repérer un mauvais appariement (mauvaise fiche, EAN différent).
                    const relevé = m && (m.competitorName || m.competitorEan)
                      ? `Relevé : ${m.competitorName ?? '?'}${m.competitorEan ? ` — EAN ${m.competitorEan}` : ''}`
                      : undefined
                    return (
                      <td key={s.id} className={`pr-4 ${cheaper ? 'text-red-400' : 'text-white/70'}`} title={relevé}>
                        {m?.lastPrice != null ? (
                          <a href={m.url} target="_blank" rel="noreferrer" className="underline decoration-dotted underline-offset-2 hover:text-white">
                            {m.lastPrice} €
                          </a>
                        ) : '—'}
                      </td>
                    )
                  })}
                </tr>
              ))}
              {products.length === 0 && (
                <tr>
                  <td colSpan={2 + sites.length} className="py-6 text-center text-white/50">
                    Aucune donnée — lance un workflow « Veille tarifaire » pour peupler le comparatif.
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
