// Volet « Visualisations » : le type du visuel sélectionné, et les zones où ses champs vont.
//
// ⚠ Les cinq zones se branchent sur la MÊME tuile que la galerie de types : changer le type
// peut vider une zone de son sens (un indicateur n'a pas d'axe), et les zones le disent
// d'elles-mêmes au survol plutôt que d'accepter un champ qui ne s'afficherait nulle part.
import { useTranslation } from '@/lib/i18n'
import { BiPanel } from './BiPanel'
import { BiFieldWell } from './BiFieldWell'
import { BiVizGallery, kindLabelKey } from './BiVizGallery'
import { WELL_IDS } from '../builder/wells'
import type { DataSource } from '../registry/types'
import type { Tile, TileKind } from '../types'

/** Largeur reprise de la maquette validée : les trois volets ne sont pas égaux. */
const WIDTH = 236

export function BiVisualsPanel({ tile, source, onChangeKind, onApply, canEdit }: {
  /** Tuile sélectionnée — `null` quand aucune ne l'est. */
  tile: Tile | null
  source: DataSource
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

      {WELL_IDS.map((well) => (
        <BiFieldWell
          key={well} well={well} tile={tile} source={source}
          canEdit={canEdit} onApply={onApply}
        />
      ))}
    </BiPanel>
  )
}
