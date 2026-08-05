// Filtres de l'explorateur : financiers (écart, prix, promo, stock) et sémantiques
// (mots-clés de titre). Les mots-clés retenus s'affichent en jetons retirables — un
// filtre qu'on ne voit pas est un filtre qu'on oublie, et il fausse la lecture des stats.
import { X, FilterX } from 'lucide-react'
import { EMPTY_EXPLORER_FILTER, isExplorerFilterActive, type ExplorerFilter, type GapBand, type PairFilter, type StockFilter } from './filters'
import { useTranslation } from '@/lib/i18n'

const sel = 'bg-well text-white/80 text-xs rounded px-2 py-1.5 border border-white/10 focus:outline-none focus:border-white/25'
const numCls = 'bg-well text-white/80 text-xs rounded px-2 py-1.5 border border-white/10 w-24 focus:outline-none focus:border-white/25'

const chip = (on: boolean) =>
  `text-[11px] rounded px-2 py-1.5 border transition-colors ${
    on ? 'bg-indigo-500/15 border-indigo-400/40 text-indigo-200' : 'bg-well border-white/10 text-white/50 hover:text-white/80'
  }`

export function ExplorerFilters({ filter, onChange, tokenIndex }: {
  filter: ExplorerFilter
  onChange: (patch: Partial<ExplorerFilter>) => void
  tokenIndex: { token: string; count: number }[]
}) {
  const { t } = useTranslation()
  const num = (v: string): number | null => {
    const n = Number(v.replace(',', '.'))
    return v.trim() === '' || Number.isNaN(n) ? null : n
  }
  const topTokens = tokenIndex.slice(0, 10).filter((s) => !filter.tokens.includes(s.token))

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 flex-wrap">
        <select value={filter.pairing} onChange={(e) => onChange({ pairing: e.target.value as PairFilter })} className={sel}>
          <option value="matched">{t('pwx.appariesSeulement')}</option>
          <option value="all">{t('pwx.toutesLesFiches')}</option>
          <option value="orphan">{t('pwx.nonAppariesChezLui')}</option>
        </select>

        <select value={filter.gap} onChange={(e) => onChange({ gap: e.target.value as GapBand })} className={sel}>
          <option value="all">{t('pwx.tousEcarts')}</option>
          <option value="cheaper">{t('pwx.ilEstMoinsCher')}</option>
          <option value="aligned">{t('pwx.aligne1')}</option>
          <option value="dearer">{t('pwx.jeSuisMoinsCher')}</option>
        </select>

        <select value={filter.stock} onChange={(e) => onChange({ stock: e.target.value as StockFilter })} className={sel}>
          <option value="all">{t('pwx.tousStocks')}</option>
          <option value="in-stock">{t('pwx.inStock')}</option>
          <option value="out-of-stock">{t('pwx.outOfStock')}</option>
        </select>

        <div className="flex items-center gap-1">
          <input type="number" step="1" min="0" value={filter.priceMin ?? ''} placeholder={t('pwx.prixHtMin')}
            onChange={(e) => onChange({ priceMin: num(e.target.value) })} className={numCls} />
          <span className="text-white/25 text-xs">–</span>
          <input type="number" step="1" min="0" value={filter.priceMax ?? ''} placeholder="max"
            onChange={(e) => onChange({ priceMax: num(e.target.value) })} className={numCls} />
        </div>

        <button type="button" className={chip(filter.promoOnly)} onClick={() => onChange({ promoOnly: !filter.promoOnly })}>
          {t('pwx.onPromo')}
        </button>
        <button type="button" className={chip(filter.noPriceOnly)} onClick={() => onChange({ noPriceOnly: !filter.noPriceOnly })}>
          {t('pwx.sansPrixExploitable')}
        </button>

        {isExplorerFilterActive(filter) && (
          <button type="button" onClick={() => onChange(EMPTY_EXPLORER_FILTER)}
            className="text-[11px] rounded px-2 py-1.5 text-white/40 hover:text-white/80 flex items-center gap-1">
            <FilterX className="w-3 h-3" />{t('dam.tool.reset')}
          </button>
        )}
      </div>

      {/* Sémantique des titres : jetons actifs, puis les mots-clés les plus porteurs. */}
      <div className="flex items-center gap-1.5 flex-wrap">
        {filter.tokens.map((tk) => (
          <button key={tk} type="button" onClick={() => onChange({ tokens: filter.tokens.filter((x) => x !== tk) })}
            className="text-[11px] rounded px-2 py-1 bg-indigo-500/15 border border-indigo-400/40 text-indigo-200 flex items-center gap-1">
            {tk}<X className="w-3 h-3" />
          </button>
        ))}
        {topTokens.length > 0 && <span className="text-[10px] text-white/25 ml-1">{t('pwx.motsCles')}</span>}
        {topTokens.map(({ token, count }) => (
          <button key={token} type="button" onClick={() => onChange({ tokens: [...filter.tokens, token] })}
            className="text-[11px] rounded px-2 py-1 bg-well border border-white/10 text-white/45 hover:text-white/80 hover:border-white/25">
            {token}<span className="text-white/25 ml-1 tabular-nums">{count}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
