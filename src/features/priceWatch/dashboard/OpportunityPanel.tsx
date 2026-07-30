// Top opportunités : produits où je suis le plus cher, triés par écart UNITAIRE € (mon
// prix HT − meilleur prix concurrent HT — PAS un revenu : ni volume ni marge en données).
// Où baisser en priorité. Lit la vue filtrée (participe au cross-filter du cockpit).
import type { Cockpit } from './analytics'
import { eur, pct } from './format'
import { useTranslation } from '@/lib/i18n'

const TOP = 12

export function OpportunityPanel({ ck }: { ck: Cockpit }) {
  const { t } = useTranslation()
  const rows = ck.opportunities.filter((o) => o.gapEur != null && o.gapEur > 0).slice(0, TOP)
  const maxEur = Math.max(1, ...rows.map((o) => o.gapEur ?? 0))

  return (
    <div className="bg-surface rounded-lg p-4">
      <div className="flex items-baseline justify-between mb-3">
        <div className="text-sm font-semibold text-white">{t('pw.opp.title')} <span className="text-white/40 font-normal">{t('pw.opp.where')}</span></div>
        <div className="text-[11px] text-white/35">{t('pw.opp.unitGapNote', { cap: ck.truncated ? t('pw.opp.top1000') : '' })}</div>
      </div>
      {rows.length === 0 ? (
        <div className="text-white/40 text-sm py-8 text-center">{t('pw.opp.empty')}</div>
      ) : (
        <table className="w-full text-xs tabular-nums">
          <thead>
            <tr className="text-white/40 text-[10px] uppercase tracking-wide text-right">
              <th className="text-left font-medium pb-2">{t('pw.col.product')}</th>
              <th className="font-medium pb-2">{t('pw.opp.myPrice')}</th>
              <th className="font-medium pb-2">{t('pw.opp.cheaper')}</th>
              <th className="font-medium pb-2">{t('pw.opp.gap')}</th>
              {/* « Impact » laissait croire à un montant de CA — c'est un écart À L'UNITÉ,
                  sans volume de ventes derrière. Le titre le dit maintenant. */}
              <th className="font-medium pb-2 w-[26%]" title={t('pw.opp.unitGap.title')}>{t('pw.opp.unitGap')}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((o) => (
              <tr key={o.id} className="border-t border-white/5 text-right">
                <td className="text-left py-1.5 text-white/85 max-w-[200px] truncate" title={o.name}>
                  {o.name}<span className="text-white/35"> · {o.reference ?? '—'}</span>
                </td>
                <td className="text-white/70">{eur(o.myPriceHt)}</td>
                <td className="text-white/55 whitespace-nowrap">
                  {eur(o.minPriceHt)}<span className="text-white/30"> {o.minDomain?.replace(/^www\./, '').split('.')[0] ?? ''}</span>
                </td>
                <td className="text-rose-400 font-medium">{pct(o.gapPct)}</td>
                <td className="pl-2">
                  <div className="flex items-center gap-2 justify-end">
                    <span className="text-rose-300 w-14">{eur(o.gapEur)}</span>
                    <div className="flex-1 max-w-[90px] h-2 rounded-sm bg-well overflow-hidden">
                      <div className="h-full bg-rose-400/70 rounded-sm" style={{ width: `${((o.gapEur ?? 0) / maxEur) * 100}%` }} />
                    </div>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
