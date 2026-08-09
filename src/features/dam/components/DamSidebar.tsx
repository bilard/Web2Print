import { useDamStore } from '../../../stores/dam.store'
import { DAM_COLORS } from '../types'
import { DamSearchBar } from './DamSearchBar'
import { DamSearchByImage } from './DamSearchByImage'
import { useTranslation, type TranslationKey } from '@/lib/i18n'

// Uniformément des CLÉS : un tableau mixte label/labelKey produit un type union
// où `labelKey` devient optionnel, et `t()` refuse alors `undefined`.
const SOURCES = [
  { value: 'all' as const, labelKey: 'dam.source.all' as TranslationKey },
  { value: 'pexels' as const, labelKey: 'dam.source.pexels' as TranslationKey },
  { value: 'unsplash' as const, labelKey: 'dam.source.unsplash' as TranslationKey },
]

// Constante de MODULE : la clé est stockée, la traduction se fait au rendu.
const ORIENTATIONS = [
  { value: 'all' as const, labelKey: 'dam.orientation.all' as TranslationKey },
  { value: 'landscape' as const, labelKey: 'dam.orientation.landscape' as TranslationKey },
  { value: 'portrait' as const, labelKey: 'dam.orientation.portrait' as TranslationKey },
  { value: 'square' as const, labelKey: 'dam.meta.square' as TranslationKey },
]

export function DamSidebar() {
  const { t } = useTranslation()
  const { filters, setFilters } = useDamStore()

  return (
    <div className="w-[220px] bg-surface-2 border-r border-white/5 flex flex-col shrink-0 min-h-0">
      {/* ⚠ La recherche est HORS du flux défilant : elle glissait hors de vue au premier
          défilement des filtres, alors que c'est par elle qu'on entre dans l'écran. */}
      <div className="p-4 pb-3 flex flex-col gap-4 shrink-0 border-b border-white/5">
        <DamSearchBar />
        <DamSearchByImage />
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto p-4 flex flex-col gap-4">
      <div>
        <div className="text-[9px] text-white/40 uppercase tracking-wider mb-1.5">{t('dam.meta.source')}</div>
        <div className="flex flex-wrap gap-1">
          {SOURCES.map((s) => (
            <button
              key={s.value}
              onClick={() => setFilters({ source: s.value })}
              className={`px-2 py-1 rounded text-[10px] transition ${
                filters.source === s.value
                  ? 'bg-indigo-500/20 text-indigo-400'
                  : 'bg-white/5 text-white/50 hover:bg-white/10'
              }`}
            >
              {t(s.labelKey)}
            </button>
          ))}
        </div>
      </div>

      <div>
        <div className="text-[9px] text-white/40 uppercase tracking-wider mb-1.5">{t('dam.meta.orientation')}</div>
        <div className="flex flex-wrap gap-1">
          {ORIENTATIONS.map((o) => (
            <button
              key={o.value}
              onClick={() => setFilters({ orientation: o.value })}
              className={`px-2 py-1 rounded text-[10px] transition ${
                filters.orientation === o.value
                  ? 'bg-indigo-500/20 text-indigo-400'
                  : 'bg-white/5 text-white/50 hover:bg-white/10'
              }`}
            >
              {t(o.labelKey)}
            </button>
          ))}
        </div>
      </div>

      <div>
        <div className="text-[9px] text-white/40 uppercase tracking-wider mb-1.5">{t('dam.meta.dominantColour')}</div>
        <div className="flex flex-wrap gap-1.5">
          {DAM_COLORS.map((c) => (
            <button
              key={c.value}
              onClick={() => setFilters({ color: filters.color === c.value ? null : c.value })}
              className={`w-5 h-5 rounded-full border-2 transition ${
                filters.color === c.value ? 'border-indigo-400 scale-110' : 'border-transparent'
              }`}
              style={{ backgroundColor: c.hex }}
              title={c.value}
            />
          ))}
        </div>
      </div>
      </div>
    </div>
  )
}
