// Volet « Visualisations » : le type du visuel sélectionné, et les zones où ses champs iront.
//
// ⚠⚠ Le SEUL geste vivant à ce stade est le changement de type — il agit vraiment sur la
// tuile sélectionnée. Les cinq zones sont des EMPLACEMENTS : le constructeur les remplira,
// et les afficher pleines aujourd'hui laisserait croire à un réglage déjà en place.
import { useTranslation } from '@/lib/i18n'
import { BiPanel } from './BiPanel'
import { BiFieldWell } from './BiFieldWell'
import { BiVizGallery, kindLabelKey } from './BiVizGallery'
import type { TileKind } from '../types'

/** Largeur reprise de la maquette validée : les trois volets ne sont pas égaux. */
const WIDTH = 236

const WELLS = ['bi.well.axis', 'bi.well.values', 'bi.well.legend',
  'bi.well.tooltips', 'bi.well.visualFilters'] as const

export function BiVisualsPanel({ kind, onChangeKind, canEdit }: {
  /** Type de la tuile sélectionnée — `null` quand aucune ne l'est. */
  kind: TileKind | null
  onChangeKind: (kind: TileKind) => void
  canEdit: boolean
}) {
  const { t } = useTranslation()
  return (
    <BiPanel label={t('bi.panel.visuals')} width={WIDTH} visibility="hidden xl:flex">
      <BiVizGallery kind={kind} onChange={onChangeKind} disabled={kind === null || !canEdit} />

      {/* ⚠ L'absence de sélection se DIT : sans ce mot, un volet aux zones vides se lit
          comme un volet cassé plutôt que comme un volet en attente d'un clic. */}
      <p className="text-[11px] text-white/30 leading-snug">
        {kind === null ? t('bi.visuals.noSelection') : t(kindLabelKey(kind))}
      </p>

      {WELLS.map((key) => <BiFieldWell key={key} label={t(key)} />)}
    </BiPanel>
  )
}
