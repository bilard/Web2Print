// Un modèle est-il ALIMENTABLE ici et maintenant ?
//
// ⚠⚠ Sans ce contrôle, un clic créerait un tableau de bord dont toutes les tuiles
// s'afficheraient vides — ce qui se lit comme une panne, pas comme une donnée manquante. La
// carte doit DIRE ce qui manque et le geste à faire.
import { useExcelStore } from '@/stores/excel.store'
import { usePimStore } from '@/stores/pim.store'
import { useWatchList } from '@/features/priceWatch/useCatalogReport'
import type { TranslationKey } from '@/lib/i18n'
import type { DashboardTemplate } from './types'

export interface TemplateAvailability {
  ready: boolean
  /** Ce qui manque, et le geste à faire. Absent quand le modèle est alimentable. */
  reasonKey?: TranslationKey
}

/**
 * Disponibilité des trois modèles, par clé. Un seul hook pour toutes les cartes : chaque
 * carte en appelant un ferait autant d'abonnements à la liste des suivis.
 */
export function useTemplateAvailability(): (tpl: DashboardTemplate) => TemplateAvailability {
  const watches = useWatchList()
  const sheets = useExcelStore((s) => s.sheets)
  const activeSheetIndex = useExcelStore((s) => s.activeSheetIndex)
  const hasProducts = usePimStore((s) => s.products.length > 0)

  // ⚠ MÊME condition que `useTileData`/`effectivePimSource` : une feuille sans colonne n'est
  // pas exploitable, le moteur se replie alors sur le catalogue master du PIM.
  const sheet = sheets[activeSheetIndex] ?? null
  const hasSheet = sheet !== null && sheet.columns.length > 0

  return (tpl: DashboardTemplate): TemplateAvailability => {
    if (tpl.sources.some((s) => s.startsWith('watch.'))) {
      // Le rapport lui-même n'est pas exigé : `useWatchLoader` sait dire « ce suivi n'a pas
      // encore de rapport », et ce message-là est utile DANS le tableau.
      return watches.length > 0 ? { ready: true } : { ready: false, reasonKey: 'bi.tpl.unavailableWatch' }
    }
    if (!hasSheet) {
      return hasProducts ? { ready: true } : { ready: false, reasonKey: 'bi.tpl.unavailablePim' }
    }
    // ⚠⚠ Une feuille ouverte NE SUFFIT PAS : `rowsFromSheet` remplit `taxo.1`…`taxo.4` depuis
    // `sheet.taxonomyLevels`. Sans niveaux désignés, toutes les lignes tombent dans le groupe
    // « valeur absente » et chaque tuile du modèle n'affiche qu'une seule barre — le tableau
    // vide que ce contrôle existe pour éviter.
    const levels = Object.keys(sheet.taxonomyLevels ?? {}).length
    return levels > 0 ? { ready: true } : { ready: false, reasonKey: 'bi.tpl.unavailableTaxo' }
  }
}
