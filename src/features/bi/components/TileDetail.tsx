// Le tiroir de détail, et le calcul qui va avec.
//
// ⚠⚠ Ce composant n'est monté QUE le tiroir ouvert, et c'est tout l'intérêt : il porte
// `useSourceRows`, qui recompose les lignes de la feuille active. Monté dans chaque tuile
// « au cas où », ce hook ferait une seconde copie de la feuille PAR TUILE — vingt tuiles sur
// un catalogue de plusieurs centaines de milliers de fiches, c'est la panne mémoire assurée.
import { useTileDetail } from '../hooks/useTileDetail'
import { DetailDrawer } from './DetailDrawer'
import type { FilterClause, QuerySpec } from '../types'

export function TileDetail({ title, query, globalFilters, onClose }: {
  title: string
  /** Requête EFFECTIVE de la tuile (forage compris) : le détail montre les lignes du niveau
   *  où l'on se trouve, pas celles du niveau d'origine. */
  query: QuerySpec
  globalFilters: FilterClause[]
  onClose: () => void
}) {
  const { detail, filterLabels, exportRows } = useTileDetail(title, query, globalFilters)
  if (!detail) return null
  return (
    <DetailDrawer title={title} detail={detail} filters={filterLabels}
      onClose={onClose} onExport={exportRows} />
  )
}
