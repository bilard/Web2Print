// Le choix d'une valeur de filtre parmi celles qui EXISTENT dans les données.
//
// ⚠⚠ Remplace une saisie libre. Taper « makita » là où la donnée porte « MAKITA » ne
// retenait aucune ligne, et rien ne le disait : l'utilisateur voyait une tuile vide et
// concluait que le module était cassé. Ici les valeurs sont extraites des lignes chargées,
// avec leur effectif — on choisit ce qui existe, on ne le devine plus.
import { useMemo, useState } from 'react'
import { Search } from 'lucide-react'
import { filterOptions } from '../filters/filterOptions'
import { intlLocale, useTranslation } from '@/lib/i18n'
import { BiChipPopover } from './BiChipPopover'
import type { Dimension, Row } from '../registry/types'

/** Au-delà, on n'affiche plus la liste entière : la recherche fait le tri. */
const VISIBLE = 60

export function BiFilterValuePicker({ dim, rows, value, disabled, onPick }: {
  /** Colonne filtrée. Absente = on ne peut pas proposer de valeurs (la saisie reste). */
  dim: Dimension
  /** Lignes de la source, telles que la tuile les lit. */
  rows: Row[]
  value: unknown
  disabled: boolean
  onPick: (value: string | null) => void
}) {
  const { t, locale } = useTranslation()
  const [query, setQuery] = useState('')
  const { options, truncated } = useMemo(() => filterOptions(rows, dim), [rows, dim])

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase()
    const kept = q
      ? options.filter((o) => (o.value ?? '').toLowerCase().includes(q))
      : options
    return kept.slice(0, VISIBLE)
  }, [options, query])

  const label = value === null || value === undefined || value === ''
    ? t('bi.filter.value')
    : String(value)
  const n = (v: number) => v.toLocaleString(intlLocale(locale))

  return (
    <BiChipPopover label={label} title={t('bi.filter.value')} disabled={disabled}>
      {(close) => (
        <>
          {options.length > 10 && (
            <div className="sticky top-0 flex items-center gap-1.5 bg-surface px-1.5 py-1">
              <Search className="w-3 h-3 text-white/30 shrink-0" />
              <input
                autoFocus value={query} onChange={(e) => setQuery(e.target.value)}
                placeholder={t('bi.filter.searchValue')} aria-label={t('bi.filter.searchValue')}
                className="w-full bg-transparent text-[11px] text-white/80 placeholder:text-white/25 focus:outline-none"
              />
            </div>
          )}
          {shown.length === 0 && (
            <p className="px-2 py-1.5 text-[11px] text-white/35">{t('bi.filter.noValue')}</p>
          )}
          {shown.map((o) => (
            <button
              key={o.value ?? '∅'}
              onClick={() => { onPick(o.value); close() }}
              className={`w-full flex items-center gap-2 px-2 py-1 text-left text-[11px] rounded transition-colors
                ${o.value === value ? 'bg-accent-soft text-indigo-300' : 'text-white/70 hover:bg-white/[0.06]'}`}
            >
              {/* Une valeur ABSENTE se choisit comme les autres : « sans marque » est une
                  question légitime, et la masquer rendrait une partie des lignes inatteignable. */}
              <span className={`truncate ${o.value === null ? 'italic text-white/45' : ''}`}>
                {o.value ?? t('bi.filters.emptyValue')}
              </span>
              <span className="ml-auto shrink-0 tabular-nums text-white/30">{n(o.count)}</span>
            </button>
          ))}
          {truncated && (
            // ⚠ Une liste tronquée en silence laisserait croire que les valeurs manquantes
            // n'existent pas dans les données.
            <p className="px-2 py-1 text-[10px] text-white/30 border-t border-white/5">
              {t('bi.filter.tooManyValues')}
            </p>
          )}
        </>
      )}
    </BiChipPopover>
  )
}
