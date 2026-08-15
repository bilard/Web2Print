// Volet « Visualisations » : le type du visuel, ses filtres, et les zones où ses champs vont.
//
// ⚠ Les zones se branchent sur la MÊME tuile que la galerie de types : changer le type
// peut vider une zone de son sens (un indicateur n'a pas d'axe), et les zones le disent
// d'elles-mêmes au survol plutôt que d'accepter un champ qui ne s'afficherait nulle part.
//
// ⚠⚠ UNE SEULE colonne depuis que les filtres sont montés ici : `visualFilters` est rendu par
// `BiFiltersSection` — avec ses deux portées voisines — et RETIRÉ des puits, sinon la même
// zone apparaîtrait deux fois dans la même colonne pour un seul état (`tile.query.filters`).
import { useTranslation } from '@/lib/i18n'
import { BiPanel } from './BiPanel'
import { BiFieldWell } from './BiFieldWell'
import { BiFiltersSection } from './BiFiltersSection'
import { BiVizGallery, kindLabelKey } from './BiVizGallery'
import { BiAlertField } from './BiAlertField'
import { WELL_IDS } from '../builder/wells'
import type { DataSource } from '../registry/types'
import type { FilterClause, Tile, TileKind } from '../types'

/** Largeur de la colonne unique : les deux volets fusionnés y tiennent sans se serrer. */
const WIDTH = 264

/** Les zones du volet, sans celle que la section « Filtres » rend déjà. */
const PANEL_WELLS = WELL_IDS.filter((w) => w !== 'visualFilters')

export function BiVisualsPanel({ tile, source, globalFilters, onChangeKind, onApply, canEdit }: {
  /** Tuile sélectionnée — `null` quand aucune ne l'est. */
  tile: Tile | null
  source: DataSource
  /** Filtres du tableau de bord, pour la portée « sur toutes les pages ». */
  globalFilters: FilterClause[]
  onChangeKind: (kind: TileKind) => void
  onApply: (next: Tile) => void
  canEdit: boolean
}) {
  const { t } = useTranslation()
  const kind = tile?.kind ?? null
  return (
    <BiPanel label={t('bi.panel.visuals')} width={WIDTH} visibility="hidden xl:flex">
      <BiVizGallery kind={kind} onChange={onChangeKind} disabled={kind === null || !canEdit} />

      {/* ⚠ L'absence de sélection se DIT : sans ce mot, un volet aux zones vides se lit
          comme un volet cassé plutôt que comme un volet en attente d'un clic. */}
      <p className="text-[11px] text-white/30 leading-snug">
        {kind === null ? t('bi.visuals.noSelection') : t(kindLabelKey(kind))}
      </p>

      <BiFiltersSection
        tile={tile} source={source} globalFilters={globalFilters}
        canEdit={canEdit} onApply={onApply}
      />

      {/* Le trait sépare ce qui FILTRE de ce qui COMPOSE : deux gestes différents, empilés. */}
      <div className="pt-2 border-t border-white/[0.06] flex flex-col gap-3">
        {PANEL_WELLS.map((well) => (
          <BiFieldWell
            key={well} well={well} tile={tile} source={source}
            canEdit={canEdit} onApply={onApply}
          />
        ))}
      </div>

      {/* Le seuil ferme le volet : c'est un réglage de SURVEILLANCE, pas de composition. */}
      <div className="pt-2 mt-1 border-t border-white/[0.06]">
        <BiAlertField tile={tile} source={source} canEdit={canEdit} onApply={onApply} />
      </div>
    </BiPanel>
  )
}
