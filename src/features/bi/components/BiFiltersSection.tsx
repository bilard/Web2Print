// Section « Filtres », en trois PORTÉES : le visuel, la page, le tableau de bord entier.
//
// ⚠⚠ Elle vit DANS le volet « Visualisations » : une seule colonne, donc une seule zone
// « filtres du visuel ». C'est celle-ci — `BiVisualsPanel` retire `visualFilters` de ses
// puits. Les deux zones se justifiaient tant qu'elles étaient dans deux colonnes ; empilées,
// elles se dédoubleraient à deux centimètres d'écart pour un seul et même état.
//
// ⚠ « Sur cette page » reste un EMPLACEMENT : le contrat ne porte pas de filtres de page
// (`Dashboard.filters` est global). Un filtre affiché mais inactif fausserait la lecture de
// tous les chiffres — le dire vaut mieux que le simuler.
import { useTranslation } from '@/lib/i18n'
import { BiEyebrow } from './BiPanel'
import { BiFieldWell } from './BiFieldWell'
import type { DataSource } from '../registry/types'
import type { FilterClause, Tile } from '../types'

export function BiFiltersSection({ tile, source, globalFilters, canEdit, onApply }: {
  /** Tuile sélectionnée : la portée « sur ce visuel » devient adressable. */
  tile: Tile | null
  source: DataSource
  /** Filtres du tableau de bord — les seuls que le contrat porte pour toutes les pages. */
  globalFilters: FilterClause[]
  canEdit: boolean
  onApply: (next: Tile) => void
}) {
  const { t } = useTranslation()
  return (
    <section aria-label={t('bi.panel.filters')} className="flex flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        {/* ⚠⚠ Une teinte par PORTÉE : trois blocs identiques se confondaient, et un filtre
            posé sur le visuel se lisait comme un filtre de tout le tableau — ce qui n'a pas
            du tout les mêmes conséquences sur les chiffres. */}
        <BiEyebrow><Dot color={SCOPE_COLOR.visual} />{t('bi.filters.onVisual')}</BiEyebrow>
        <BiFieldWell
          well="visualFilters" slot="filtersPanel" tile={tile} source={source}
          canEdit={canEdit} onApply={onApply}
        />
      </div>

      <Scope label={t('bi.filters.onPage')} color={SCOPE_COLOR.page}>
        <Note text={t('bi.filters.pageSoon')} />
      </Scope>

      <Scope label={t('bi.filters.onAllPages')} color={SCOPE_COLOR.board}>
        {globalFilters.length === 0
          ? <Note text={t('bi.filters.none')} />
          : globalFilters.map((f, i) => (
            // ⚠ L'index est une clé légitime ici : la liste est en LECTURE SEULE, elle n'est
            // ni réordonnée ni filtrée — les filtres globaux ne se posent pas au glisser.
            <div key={`${f.field}:${i}`}
              className="rounded-lg border border-white/[0.06] bg-well px-2 py-1.5 flex items-center gap-2">
              <b className="text-[11.5px] font-semibold text-white truncate">{f.field}</b>
              <span className="ml-auto text-[11px] text-white/35 shrink-0">{f.op}</span>
            </div>
          ))}
      </Scope>
    </section>
  )
}

/** Les trois portées : du plus étroit (un visuel) au plus large (tout le tableau). */
const SCOPE_COLOR = { visual: '#fbbf24', page: '#a78bfa', board: '#f472b6' }

function Dot({ color }: { color: string }) {
  return (
    <span className="inline-block w-1.5 h-1.5 rounded-full mr-1.5 align-middle"
      style={{ background: color }} />
  )
}

function Scope({ label, children, color }: {
  label: string; children: React.ReactNode; color: string
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <BiEyebrow><Dot color={color} />{label}</BiEyebrow>
      {children}
    </div>
  )
}

function Note({ text }: { text: string }) {
  return (
    <p className="rounded-lg border border-dashed border-white/[0.12] bg-well px-2 py-1.5 text-[11px] text-white/25 leading-snug">
      {text}
    </p>
  )
}
