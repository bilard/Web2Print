// Ce qu'une zone ACCEPTE, et la raison EXACTE quand elle refuse. PUR : ni React, ni i18n.
//
// ⚠⚠ Le verdict est rendu PENDANT le survol, jamais au relâchement : un refus muet au
// lâcher se lit comme un geste raté, et l'utilisateur recommence. La raison porte une CLÉ
// de catalogue — c'est le composant qui traduit (même règle que `BiMessage`).
//
// ⚠⚠ Le refus d'une mesure non agrégeable est CIBLÉ, jamais général : une médiane calculée
// PAR GROUPE reste juste (le moteur agrège les lignes, jamais les valeurs déjà calculées —
// cf. `aggregate.ts`), et `AddTileMenu` la propose déjà en le disant. Ce qu'elle ne supporte
// pas, c'est d'être RECOMPOSÉE entre groupes : parts d'un tout, empilement, ligne de totaux.
import { measureKey, type Tile } from '../types'
import type { DataSource } from '../registry/types'
import { measureRefOf, wellCapacity, wellChips, type DraggedField, type WellId } from './wells'
import type { TranslationKey } from '@/lib/i18n'

export type WellVerdict = { ok: true } | { ok: false; reasonKey: TranslationKey }

const OK: WellVerdict = { ok: true }
const no = (reasonKey: TranslationKey): WellVerdict => ({ ok: false, reasonKey })

/** Le visuel RECOMPOSE-t-il ses valeurs entre groupes ? */
function totalises(tile: Tile): boolean {
  return tile.kind === 'pie' || tile.kind === 'doughnut'
    || tile.options?.stacked === true || tile.options?.showTotals === true
}

/** Pourquoi cette zone est-elle sans objet pour ce visuel ? Une phrase par cas — « cette
 *  zone n'a pas de sens ici » n'apprend rien à qui vient d'essayer. */
function emptyWellReason(well: WellId, tile: Tile): TranslationKey {
  if (tile.kind === 'kpi') {
    return well === 'tooltips' ? 'bi.well.refuse.tooltipNeedsChart' : 'bi.well.refuse.kpiDimension'
  }
  if (well === 'tooltips') return 'bi.well.refuse.tooltipNeedsChart'
  return 'bi.well.refuse.tableLegend'
}

/**
 * Cette zone accepte-t-elle ce champ, sur cette tuile ?
 *
 * ⚠ `tile === null` est le cas le plus courant à l'ouverture du volet : aucune tuile n'est
 * sélectionnée, et une zone qui accepterait ne saurait pas quoi reconfigurer.
 */
export function acceptField(
  well: WellId, tile: Tile | null, field: DraggedField, source: DataSource,
): WellVerdict {
  if (!tile) return no('bi.well.refuse.noSelection')
  if (wellCapacity(well, tile.kind) === 0) return no(emptyWellReason(well, tile))

  const chips = wellChips(well, tile, source)

  if (well === 'axis' || well === 'legend') {
    if (field.role === 'measure') return no('bi.well.refuse.needDimension')
    if (!source.dimensions.some((d) => d.id === field.id)) return no('bi.well.refuse.unknownField')
    if (chips.some((c) => c.id === field.id)) return no('bi.well.refuse.already')
    // ⚠ Une légende sans axe N'EST PAS une légende : c'est l'axe. Le moteur grouperait sur
    // une seule dimension et le graphe l'afficherait comme axe — le champ semblerait avoir
    // atterri dans la mauvaise zone.
    if (well === 'legend') {
      if (wellChips('axis', tile, source).length === 0) return no('bi.well.refuse.legendNeedsAxis')
      // ⚠ Symétrique du refus posé sur « Valeurs » : la légende éclate le graphe en séries
      // sur UNE mesure ; à plusieurs mesures, il n'y a pas de série à nommer.
      if (tile.kind !== 'pivot' && wellChips('values', tile, source).length > 1) {
        return no('bi.well.refuse.legendOrMeasures')
      }
    }
    return OK
  }

  if (well === 'visualFilters') {
    // ⚠⚠ Le moteur filtre sur une DIMENSION ou sur la clé brute de la ligne (`matches`) :
    // une mesure déclarée (complétude, écart médian) n'est calculée qu'APRÈS le filtrage,
    // et un filtre posé dessus ne retiendrait jamais une seule ligne — en silence.
    const column = field.role === 'dimension'
      ? field.id
      : source.measures.find((m) => m.id === field.id)?.derivedFrom?.field
    if (!column) return no('bi.well.refuse.filterNeedsColumn')
    if (!source.dimensions.some((d) => d.id === column)) return no('bi.well.refuse.unknownField')
    return OK
  }

  // « Valeurs » et « Info-bulles » : des mesures. Une colonne lâchée ici en devient une.
  const ref = measureRefOf(field, source)
  if (!ref) return no('bi.well.refuse.unknownField')
  const key = measureKey({ ...ref, alias: undefined })
  // ⚠⚠ Unicité sur les DEUX zones de mesures : `DashboardGrid` les fusionne pour le calcul,
  // et deux mesures de même clé n'y feraient qu'une colonne — la série visible disparaîtrait
  // au profit de l'info-bulle, sans un mot.
  const other = well === 'values' ? 'tooltips' : 'values'
  if ([...chips, ...wellChips(other, tile, source)].some((c) => c.id === key)) {
    return no('bi.well.refuse.already')
  }
  if (well === 'values') {
    // ⚠⚠ Une légende éclate DÉJÀ le graphe en séries (`ChartTile`) : une seconde mesure
    // demanderait un jeu de données par couple (mesure × série), illisible — et Power BI
    // refuse exactement de la même façon.
    if (chips.length > 0 && wellChips('legend', tile, source).length > 0) {
      return no('bi.well.refuse.legendOrMeasures')
    }
    if (totalises(tile)) {
      const found = source.measures.find((m) => m.id === key)
      if (found && !found.aggregable) return no('bi.well.refuse.nonAggregable')
    }
  }
  return OK
}

/**
 * Zone la PLUS PROBABLE pour ce champ — ce que le double-clic vise. `null` = aucune ne peut
 * le prendre, et le composant le dit plutôt que de ne rien faire.
 *
 * ⚠ Une mesure va aux valeurs, une dimension à l'axe : c'est l'attente Power BI. Le repli
 * sur l'autre zone couvre le cas réel de l'indicateur (pas d'axe) et du tableau déjà pourvu.
 */
export function bestWellFor(
  tile: Tile | null, field: DraggedField, source: DataSource,
): WellId | null {
  const order: WellId[] = field.role === 'measure'
    ? ['values', 'tooltips', 'visualFilters']
    : ['axis', 'legend', 'values', 'visualFilters']
  return order.find((w) => acceptField(w, tile, field, source).ok) ?? null
}
