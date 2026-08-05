// Recherche autocomplétée de l'explorateur. Les suggestions sont calculées sur les
// fiches du site ACTIF (module pur `filters.ts`) : réf et code-barres d'abord — saisir
// un EAN doit tomber sur SA fiche, pas sur un mot-clé qui lui ressemble.
import { useMemo, useState } from 'react'
import { Search, X, Hash, Barcode, Tag, Package } from 'lucide-react'
import type { PairedRow } from './pairing'
import { suggest, type Suggestion, type SuggestionKind } from './filters'
import { useTranslation, type TranslationKey } from '@/lib/i18n'

const ICON: Record<SuggestionKind, typeof Hash> = {
  token: Tag, ref: Hash, ean: Barcode, product: Package,
}

/** Clés, pas libellés : traduites au rendu (une constante t() figerait la langue). */
const KIND_HINT: Record<SuggestionKind, TranslationKey> = {
  token: 'pwx.hint.keyword', ref: 'pwx.hint.ref', ean: 'pwx.hint.ean', product: 'pwx.hint.product',
}

export function ExplorerSearch({ rows, tokenIndex, value, onChange, onAddToken }: {
  rows: PairedRow[]
  tokenIndex: { token: string; count: number }[]
  value: string
  onChange: (q: string) => void
  onAddToken: (token: string) => void
}) {
  const { t } = useTranslation()
  const [focus, setFocus] = useState(false)
  const items = useMemo(
    () => (focus ? suggest(rows, tokenIndex, value) : []),
    [focus, rows, tokenIndex, value],
  )

  const pick = (s: Suggestion) => {
    if (s.kind === 'token') { onAddToken(s.value); onChange('') }
    else onChange(s.value)
    setFocus(false)
  }

  return (
    <div className="relative flex-1 min-w-[220px] max-w-lg">
      <Search className="w-3.5 h-3.5 text-white/30 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setFocus(true)}
        onBlur={() => window.setTimeout(() => setFocus(false), 120)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') { onChange(''); setFocus(false) }
          if (e.key === 'Enter' && items.length > 0) pick(items[0])
        }}
        placeholder={t('pwx.referenceEanTitre')}
        className="w-full bg-well text-white text-xs rounded pl-8 pr-7 py-2 border border-white/10 focus:outline-none focus:border-white/25 placeholder:text-white/25"
      />
      {value && (
        <button type="button" onClick={() => onChange('')}
          className="absolute right-2 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/70">
          <X className="w-3.5 h-3.5" />
        </button>
      )}
      {items.length > 0 && (
        <ul className="absolute z-30 left-0 right-0 mt-1 bg-surface-2 border border-white/10 rounded shadow-xl max-h-72 overflow-auto">
          {items.map((s) => {
            const Icon = ICON[s.kind]
            return (
              <li key={`${s.kind}:${s.value}`}>
                <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => pick(s)}
                  className="w-full text-left px-2.5 py-1.5 text-xs text-white/80 hover:bg-white/[0.06] flex items-center gap-2">
                  <Icon className="w-3 h-3 shrink-0 text-white/30" />
                  <span className="truncate flex-1">{s.label}</span>
                  <span className="text-[10px] text-white/25 shrink-0">
                    {s.kind === 'token' ? t('pwx.hint.tokenCount', { count: s.count }) : t(KIND_HINT[s.kind])}
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
