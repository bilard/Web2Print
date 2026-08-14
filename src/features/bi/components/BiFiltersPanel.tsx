// Volet « Filtres », en trois PORTÉES : le visuel, la page, le tableau de bord entier.
//
// ⚠⚠ « Sur ce visuel » et la zone « Filtres du visuel » du volet Visualisations désignent le
// MÊME puits (`tile.query.filters`) : c'est le premier endroit où un lecteur de Power BI va
// chercher, et le second celui où il pose ses champs. Deux zones, un seul état — les
// dédoubler ferait diverger ce qui filtre et ce qui s'affiche.
//
// ⚠ « Sur cette page » reste un EMPLACEMENT : le contrat ne porte pas de filtres de page
// (`Dashboard.filters` est global). Un filtre affiché mais inactif fausserait la lecture de
// tous les chiffres — le dire vaut mieux que le simuler.
import { useTranslation } from '@/lib/i18n'
import { BiPanel, BiEyebrow } from './BiPanel'
import { BiFieldWell } from './BiFieldWell'
import type { DataSource } from '../registry/types'
import type { FilterClause, Tile } from '../types'

/** Largeur reprise de la maquette validée. */
const WIDTH = 232

export function BiFiltersPanel({ tile, source, globalFilters, canEdit, onApply }: {
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
    <BiPanel label={t('bi.panel.filters')} width={WIDTH} visibility="hidden xl:flex">
      <div className="flex flex-col gap-1.5">
        <BiEyebrow>{t('bi.filters.onVisual')}</BiEyebrow>
        {/* ⚠ `slot` distinct : deux zones dnd-kit ne peuvent pas porter le même identifiant,
            alors que le puits visé, lui, est bien le même. */}
        <BiFieldWell
          well="visualFilters" slot="filtersPanel" tile={tile} source={source}
          canEdit={canEdit} onApply={onApply}
        />
      </div>

      <Scope label={t('bi.filters.onPage')}>
        <Note text={t('bi.filters.pageSoon')} />
      </Scope>

      <Scope label={t('bi.filters.onAllPages')}>
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
    </BiPanel>
  )
}

function Scope({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <BiEyebrow>{label}</BiEyebrow>
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
