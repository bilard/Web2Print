// Contrôles de filtrage, sur une ligne. L'écart de prix n'est PAS ici : il se pilote au
// clic dans le ruban de position, qui montre déjà la répartition — deux commandes pour
// le même filtre, à deux endroits, c'est ce qui rendait l'en-tête confus.
import type { SelectHTMLAttributes } from 'react'
import { Package, Boxes, Tag, EuroIcon, FilterX, ShieldQuestion, ArrowDownNarrowWide, ClipboardCheck } from 'lucide-react'
import { EMPTY_EXPLORER_FILTER, isExplorerFilterActive, type ExplorerFilter, type PairFilter, type StockFilter, type TrustFilter, type AuditFilter } from './filters'
import { useTranslation } from '@/lib/i18n'

const sel = 'bg-well text-white/70 text-[11px] rounded pl-6 pr-1.5 py-1.5 border border-white/10 focus:outline-none focus:border-white/25 appearance-none'
const num = 'bg-well text-white/70 text-[11px] rounded px-1.5 py-1.5 border border-white/10 w-[68px] focus:outline-none focus:border-white/25'

const chip = (on: boolean) =>
  `text-[11px] rounded px-2 py-1.5 border transition-colors whitespace-nowrap ${
    on ? 'bg-amber-400/15 border-amber-400/40 text-amber-200' : 'bg-well border-white/10 text-white/45 hover:text-white/80'
  }`

/** Select précédé de son icône : la nature du filtre se lit sans parcourir l'intitulé. */
function IconSelect({ icon: Icon, children, ...rest }: {
  icon: typeof Package
} & SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <div className="relative shrink-0">
      <Icon className="w-3 h-3 text-white/30 absolute left-1.5 top-1/2 -translate-y-1/2 pointer-events-none" />
      <select {...rest} className={sel}>{children}</select>
    </div>
  )
}

export function ExplorerFilters({ filter, onChange }: {
  filter: ExplorerFilter
  onChange: (patch: Partial<ExplorerFilter>) => void
}) {
  const { t } = useTranslation()
  const toNum = (v: string): number | null => {
    const n = Number(v.replace(',', '.'))
    return v.trim() === '' || Number.isNaN(n) ? null : n
  }

  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      <IconSelect icon={Package} value={filter.pairing}
        onChange={(e) => onChange({ pairing: e.target.value as PairFilter })}>
        <option value="matched">{t('pwx.appariesSeulement')}</option>
        <option value="all">{t('pwx.toutesLesFiches')}</option>
        <option value="orphan">{t('pwx.nonAppariesChezLui')}</option>
      </IconSelect>

      <IconSelect icon={ShieldQuestion} value={filter.trust}
        onChange={(e) => onChange({ trust: e.target.value as TrustFilter })}>
        <option value="all">{t('pwx.trust.filterAll')}</option>
        <option value="suspect">{t('pwx.trust.filterSuspect')}</option>
        <option value="doubt">{t('pwx.trust.filterDoubt')}</option>
        <option value="sure">{t('pwx.trust.filterSure')}</option>
      </IconSelect>

      <IconSelect icon={ClipboardCheck} value={filter.audit}
        onChange={(e) => onChange({ audit: e.target.value as AuditFilter })}>
        <option value="all">{t('pwx.verdict.filterAll')}</option>
        <option value="pending">{t('pwx.verdict.filterPending')}</option>
        <option value="ok">{t('pwx.verdict.filterOk')}</option>
        <option value="ko">{t('pwx.verdict.filterKo')}</option>
      </IconSelect>

      <IconSelect icon={Boxes} value={filter.stock}
        onChange={(e) => onChange({ stock: e.target.value as StockFilter })}>
        <option value="all">{t('pwx.tousStocks')}</option>
        <option value="in-stock">{t('pwx.inStock')}</option>
        <option value="out-of-stock">{t('pwx.outOfStock')}</option>
      </IconSelect>

      <div className="flex items-center gap-1 shrink-0">
        <EuroIcon className="w-3 h-3 text-white/30" />
        <input type="number" step="1" min="0" value={filter.priceMin ?? ''} placeholder={t('pwx.min')}
          onChange={(e) => onChange({ priceMin: toNum(e.target.value) })} className={num} />
        <span className="text-white/20 text-[11px]">–</span>
        <input type="number" step="1" min="0" value={filter.priceMax ?? ''} placeholder={t('pwx.max')}
          onChange={(e) => onChange({ priceMax: toNum(e.target.value) })} className={num} />
      </div>

      <button type="button" className={chip(filter.promoOnly)} onClick={() => onChange({ promoOnly: !filter.promoOnly })}>
        <Tag className="w-3 h-3 inline mr-1 -mt-px" />{t('pwx.onPromo')}
      </button>
      <button type="button" className={chip(filter.noPriceOnly)} onClick={() => onChange({ noPriceOnly: !filter.noPriceOnly })}>
        {t('pwx.sansPrixExploitable')}
      </button>
      <button type="button" className={chip(filter.worstFirst)} title={t('pwx.trust.worstFirst.help')}
        onClick={() => onChange({ worstFirst: !filter.worstFirst })}>
        <ArrowDownNarrowWide className="w-3 h-3 inline mr-1 -mt-px" />{t('pwx.trust.worstFirst')}
      </button>

      {isExplorerFilterActive(filter) && (
        <button type="button" onClick={() => onChange(EMPTY_EXPLORER_FILTER)}
          title={t('dam.tool.reset')}
          className="text-white/35 hover:text-white/80 p-1.5 rounded hover:bg-white/[0.06] transition-colors shrink-0">
          <FilterX className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  )
}

/** Mots-clés de titre : jetons actifs, puis les plus porteurs du site. Ligne séparée —
 *  leur nombre varie, et ils pousseraient les contrôles hors de vue. */
export function ExplorerTokens({ filter, onChange, tokenIndex }: {
  filter: ExplorerFilter
  onChange: (patch: Partial<ExplorerFilter>) => void
  tokenIndex: { token: string; count: number }[]
}) {
  const { t } = useTranslation()
  const top = tokenIndex.slice(0, 8).filter((s) => !filter.tokens.includes(s.token))
  if (filter.tokens.length === 0 && top.length === 0) return null

  return (
    <div className="flex items-center gap-1 flex-wrap">
      {filter.tokens.map((tk) => (
        <button key={tk} type="button" onClick={() => onChange({ tokens: filter.tokens.filter((x) => x !== tk) })}
          className="text-[11px] rounded px-2 py-0.5 bg-indigo-500/15 border border-indigo-400/40 text-indigo-200 hover:bg-indigo-500/25 transition-colors">
          {tk} ×
        </button>
      ))}
      {top.length > 0 && <span className="text-[10px] text-white/20 ml-1">{t('pwx.motsCles')}</span>}
      {top.map(({ token, count }) => (
        <button key={token} type="button" onClick={() => onChange({ tokens: [...filter.tokens, token] })}
          className="text-[11px] rounded px-2 py-0.5 text-white/35 hover:text-white/85 hover:bg-white/[0.06] transition-colors">
          {token}<span className="text-white/20 ml-1 tabular-nums">{count}</span>
        </button>
      ))}
    </div>
  )
}
