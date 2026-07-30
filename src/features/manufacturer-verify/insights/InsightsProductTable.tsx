import { BadgeCheck, ShieldAlert, Minus, ExternalLink } from 'lucide-react'
import type { ProductStat } from './insightsAggregate'
import { t } from '@/lib/i18n'

interface Props {
  products: ProductStat[]
  onOpenProduct: (p: ProductStat) => void
}

const CONF_LABEL: Record<'high' | 'medium' | 'low', string> = { high: 'Élevée', medium: 'Moyenne', low: 'Faible' }
const CONF_CLS: Record<'high' | 'medium' | 'low', string> = {
  high: 'text-emerald-400', medium: 'text-amber-400', low: 'text-white/40',
}

function EanBadge({ match }: { match: boolean | null }) {
  if (match === true) return <span className="inline-flex items-center gap-1 text-emerald-400"><BadgeCheck className="w-3.5 h-3.5" />{t('mv.ean.certified')}</span>
  if (match === false) return <span className="inline-flex items-center gap-1 text-amber-400"><ShieldAlert className="w-3.5 h-3.5" />{t('mv.ean.different')}</span>
  return <span className="inline-flex items-center gap-1 text-white/35"><Minus className="w-3.5 h-3.5" />n/a</span>
}

/** Tableau des produits vérifiés, trié par nombre d'écarts décroissant.
 *  Chaque ligne ouvre la fiche produit correspondante dans le PIM. */
export function InsightsProductTable({ products, onOpenProduct }: Props) {
  const sorted = [...products].sort(
    (a, b) => b.specDiff + b.identityDiff - (a.specDiff + a.identityDiff),
  )
  return (
    <div className="bg-surface border border-white/10 rounded-xl overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-white/45 border-b border-white/10">
              <th className="px-4 py-2.5 font-medium">Produit</th>
              <th className="px-3 py-2.5 font-medium">EAN</th>
              <th className="px-3 py-2.5 font-medium text-center">Concord.</th>
              <th className="px-3 py-2.5 font-medium text-center">Diverg.</th>
              <th className="px-3 py-2.5 font-medium text-center">Apport</th>
              <th className="px-3 py-2.5 font-medium text-center">{t('mv.insights.identityDiff')}</th>
              <th className="px-3 py-2.5 font-medium text-center">{t('mv.insights.adopted')}</th>
              <th className="px-3 py-2.5 font-medium">Confiance</th>
              <th className="px-2 py-2.5" />
            </tr>
          </thead>
          <tbody>
            {sorted.map((p) => (
              <tr
                key={`${p.sheetIndex}:${p.rowId}`}
                onClick={() => onOpenProduct(p)}
                className="border-b border-white/[0.06] hover:bg-white/[0.03] cursor-pointer transition-colors"
              >
                <td className="px-4 py-2.5 max-w-[22rem]">
                  <div className="font-medium truncate">{p.name}</div>
                  {p.brand && <div className="text-xs text-white/45 truncate">{p.brand}</div>}
                </td>
                <td className="px-3 py-2.5 text-xs"><EanBadge match={p.eanMatch} /></td>
                <td className="px-3 py-2.5 text-center tabular-nums text-emerald-400">{p.specMatch || '—'}</td>
                <td className="px-3 py-2.5 text-center tabular-nums text-amber-400">{p.specDiff || '—'}</td>
                <td className="px-3 py-2.5 text-center tabular-nums text-indigo-300">{p.specCompleted || '—'}</td>
                <td className="px-3 py-2.5 text-center tabular-nums text-amber-400">{p.identityDiff || '—'}</td>
                <td className="px-3 py-2.5 text-center tabular-nums text-teal-400">{p.adopted || '—'}</td>
                <td className={`px-3 py-2.5 text-xs ${p.confidence ? CONF_CLS[p.confidence] : 'text-white/30'}`}>
                  {p.confidence ? CONF_LABEL[p.confidence] : '—'}
                </td>
                <td className="px-2 py-2.5 text-white/30"><ExternalLink className="w-3.5 h-3.5" /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
