import { Table2 } from 'lucide-react'
import type { EnrichedProduct } from '@/features/excel/ai-enrichment/types'
import { resolveFieldValue, isSourceField, hostOfUrl } from './searchFieldValues'

interface Props {
  /** Champs demandés dans le prompt (libellés libres) — seuls les 5 premiers sont affichés. */
  fields: string[]
  /** Produits enrichis par le batch de scrape. */
  products: EnrichedProduct[]
  /** URLs cochées pas encore scrapées — affichées en lignes d'attente (seule la
   *  colonne site/source est remplie, le reste se remplit au fil du batch). */
  pendingUrls?: string[]
}

/** Tableau récapitulatif de l'onglet Recherche : une colonne par champ demandé
 *  dans le prompt (max 5), une ligne par page — visible dès la recherche,
 *  rempli en live par le batch de scrape. */
export function SearchFieldsTable({ fields, products, pendingUrls = [] }: Props) {
  const cols = fields.slice(0, 5)
  if (cols.length === 0 || (products.length === 0 && pendingUrls.length === 0)) return null

  return (
    <div className="space-y-1.5">
      <span className="inline-flex items-center gap-1.5 text-[10px] text-white/30 uppercase tracking-wider">
        <Table2 className="w-3 h-3" /> Champs demandés — {products.length} produit{products.length > 1 ? 's' : ''}
        {pendingUrls.length > 0 && <span className="text-white/20 normal-case">· {pendingUrls.length} en attente de scrape</span>}
      </span>
      <div className="border border-white/[0.06] rounded-lg overflow-x-auto">
        <table className="w-full text-[11px]">
          <thead>
            <tr className="border-b border-white/[0.08] bg-white/[0.02]">
              {cols.map((f) => (
                <th key={f} className="px-2.5 py-2 text-left font-medium text-white/45 uppercase tracking-wide text-[9px] whitespace-nowrap">
                  {f}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {products.map((p, i) => (
              <tr key={i} className="border-b border-white/[0.04] last:border-0 hover:bg-white/[0.02] transition-colors">
                {cols.map((f) => {
                  const value = resolveFieldValue(f, p)
                  return (
                    <td key={f} className="px-2.5 py-1.5 text-white/70 align-top max-w-[220px]">
                      {value
                        ? <span className="line-clamp-2" title={value}>{value}</span>
                        : <span className="text-white/20">—</span>}
                    </td>
                  )
                })}
              </tr>
            ))}
            {pendingUrls.map((url) => (
              <tr key={url} className="border-b border-white/[0.04] last:border-0">
                {cols.map((f) => (
                  <td key={f} className="px-2.5 py-1.5 align-top max-w-[220px]">
                    {isSourceField(f)
                      ? <span className="text-white/45">{hostOfUrl(url) || url}</span>
                      : <span className="text-white/15" title="En attente de scrape">…</span>}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
