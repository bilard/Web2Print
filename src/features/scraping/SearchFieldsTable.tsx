import { Table2, Loader2, ExternalLink } from 'lucide-react'
import type { EnrichedProduct } from '@/features/excel/ai-enrichment/types'
import { resolveFieldValue } from './searchFieldValues'

interface Props {
  /** Champs demandés dans le prompt (libellés libres) — seuls les 5 premiers sont affichés. */
  fields: string[]
  /** Produits enrichis par le batch de scrape. */
  products: EnrichedProduct[]
  /** Nombre de pages encore en cours de scrape (batch actif) — affiche la progression. */
  remaining?: number
}

/** Tableau récapitulatif de l'onglet Recherche : une colonne par champ demandé
 *  dans le prompt (max 5), une ligne par produit scrapé — rempli en live par le batch. */
export function SearchFieldsTable({ fields, products, remaining = 0 }: Props) {
  const cols = fields.slice(0, 5)
  if (cols.length === 0 || products.length === 0) return null

  return (
    <div className="space-y-1.5">
      <span className="inline-flex items-center gap-1.5 text-[10px] text-white/30 uppercase tracking-wider">
        <Table2 className="w-3 h-3" /> Champs demandés — {products.length} produit{products.length > 1 ? 's' : ''}
        {remaining > 0 && (
          <span className="inline-flex items-center gap-1 text-white/25 normal-case">
            <Loader2 className="w-2.5 h-2.5 animate-spin" /> {remaining} page{remaining > 1 ? 's' : ''} en cours
          </span>
        )}
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
              <th className="w-9 px-2 py-2" title="Ouvrir la page source" />
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
                <td className="w-9 px-2 py-1.5 align-top">
                  {p.sourceUrl && (
                    <a
                      href={p.sourceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center justify-center w-6 h-6 rounded border border-indigo-500/25 bg-indigo-500/10 text-indigo-300/70 hover:text-indigo-200 hover:bg-indigo-500/20 transition-colors"
                      title={`Ouvrir la page source : ${p.sourceUrl}`}
                    >
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
